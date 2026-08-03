import os
import re
import sys
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from config import OUTPUT_DIR, TEMP_DIR, CUSTOM_FONTS_DIR, SYSTEM_FONTS_DIR, update_render_progress, reset_render_progress

def escape_ffmpeg_filter_path(path_input: str or Path) -> str:
    """
    Escapes file path string for FFmpeg video filter parameter (-vf subtitles='...').
    Converts backslashes to forward slashes, escapes colons (C:\ -> C\:) and special characters.
    """
    p_str = str(Path(path_input).resolve()).replace("\\", "/")
    p_str = p_str.replace(":", "\\:")
    p_str = p_str.replace("'", "'\\''")
    p_str = p_str.replace("[", "\\[").replace("]", "\\]")
    return p_str

def get_video_duration_secs(video_path: str or Path) -> float:
    """
    Uses ffprobe to obtain total video duration in seconds with robust path escaping.
    """
    clean_path = str(Path(video_path).resolve())
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        clean_path
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return float(res.stdout.strip())
    except Exception as e:
        print(f"Error getting video duration for '{clean_path}': {e}")
        return 0.0

def get_video_info(video_path: str or Path) -> dict:
    """
    Retrieves video resolution, frame rate, and duration.
    """
    clean_path = str(Path(video_path).resolve())
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,duration",
        "-of", "csv=p=0",
        clean_path
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        parts = res.stdout.strip().split(",")
        width = int(parts[0]) if len(parts) > 0 and parts[0] else 1920
        height = int(parts[1]) if len(parts) > 1 and parts[1] else 1080
        fps_str = parts[2] if len(parts) > 2 and parts[2] else "30/1"
        if "/" in fps_str:
            num, den = fps_str.split("/")
            fps = float(num) / float(den) if float(den) != 0 else 30.0
        else:
            fps = float(fps_str)
        duration = float(parts[3]) if len(parts) > 3 and parts[3] else get_video_duration_secs(clean_path)
        return {"width": width, "height": height, "fps": fps, "duration": duration}
    except Exception:
        return {"width": 1920, "height": 1080, "fps": 30.0, "duration": get_video_duration_secs(clean_path)}

def get_auto_versioned_path(base_name: str or Path, ext: str = ".mp4") -> Path:
    """
    Auto-increments file output path (e.g. video_v1.mp4, video_v2.mp4) if target exists.
    """
    clean_stem = re.sub(r"_v\d+$", "", Path(base_name).stem)
    version = 1
    target = OUTPUT_DIR / f"{clean_stem}_v{version}{ext}"
    while target.exists():
        version += 1
        target = OUTPUT_DIR / f"{clean_stem}_v{version}{ext}"
    return target

def generate_srt_file(captions: list, output_path: Path):
    """
    Generates a standard .srt subtitle file from caption data list.
    """
    def format_srt_time(seconds: float) -> str:
        millis = int((seconds - int(seconds)) * 1000)
        secs = int(seconds) % 60
        mins = (int(seconds) // 60) % 60
        hrs = int(seconds) // 3600
        return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"

    with open(output_path, "w", encoding="utf-8") as f:
        for idx, cap in enumerate(captions, 1):
            start_str = format_srt_time(cap.get("start", 0.0))
            end_str = format_srt_time(cap.get("end", 0.0))
            text = cap.get("text", "")
            f.write(f"{idx}\n{start_str} --> {end_str}\n{text}\n\n")

def generate_premiere_xml(video_path: str or Path, captions: list, output_xml_path: Path):
    """
    Generates an Adobe Premiere Pro (.xml) sequence containing clip markers / subtitle tracks.
    """
    clean_path = Path(video_path).resolve()
    info = get_video_info(clean_path)
    total_frames = int(info["duration"] * info["fps"])
    timebase = int(round(info["fps"]))

    xmeml = ET.Element("xmeml", version="4")
    sequence = ET.SubElement(xmeml, "sequence", id="Sequence1")
    ET.SubElement(sequence, "name").text = clean_path.stem + " Subtitle Sequence"
    ET.SubElement(sequence, "duration").text = str(total_frames)

    rate = ET.SubElement(sequence, "rate")
    ET.SubElement(rate, "timebase").text = str(timebase)
    ET.SubElement(rate, "ntsc").text = "FALSE"

    media = ET.SubElement(sequence, "media")
    video = ET.SubElement(media, "video")
    
    # Track 1: Main Video
    v_track1 = ET.SubElement(video, "track")
    clip1 = ET.SubElement(v_track1, "clipitem", id="clipitem-1")
    ET.SubElement(clip1, "name").text = clean_path.name
    ET.SubElement(clip1, "duration").text = str(total_frames)
    ET.SubElement(clip1, "start").text = "0"
    ET.SubElement(clip1, "end").text = str(total_frames)
    
    file_elem = ET.SubElement(clip1, "file", id="file-1")
    ET.SubElement(file_elem, "name").text = clean_path.name
    ET.SubElement(file_elem, "pathurl").text = clean_path.as_uri()

    # Track 2: Subtitle markers / clips
    v_track2 = ET.SubElement(video, "track")
    for idx, cap in enumerate(captions, 1):
        start_frame = int(cap.get("start", 0.0) * info["fps"])
        end_frame = int(cap.get("end", 0.0) * info["fps"])
        dur = max(1, end_frame - start_frame)
        
        cap_clip = ET.SubElement(v_track2, "clipitem", id=f"sub-clip-{idx}")
        ET.SubElement(cap_clip, "name").text = cap.get("text", f"Subtitle {idx}")
        ET.SubElement(cap_clip, "start").text = str(start_frame)
        ET.SubElement(cap_clip, "end").text = str(end_frame)
        ET.SubElement(cap_clip, "duration").text = str(dur)
        
        marker = ET.SubElement(cap_clip, "marker")
        ET.SubElement(marker, "name").text = "Subtitle Text"
        ET.SubElement(marker, "comment").text = cap.get("text", "")
        ET.SubElement(marker, "in").text = "0"
        ET.SubElement(marker, "out").text = str(dur)

    tree = ET.ElementTree(xmeml)
    ET.indent(tree, space="  ")
    tree.write(output_xml_path, encoding="utf-8", xml_declaration=True)

def render_ass_video(video_path: str or Path, ass_path: str or Path, output_path: Path, duration: float) -> bool:
    """
    Executes the 6-stage fallback ASS subtitle FFmpeg render pipeline:
      Stage 1: GPU NVENC Fast + Custom Fonts Dir + Copy Audio
      Stage 2: GPU NVENC Fast + System Fonts Dir + Copy Audio
      Stage 3: CPU libx264 Ultrafast + Custom Fonts Dir + Copy Audio
      Stage 4: CPU libx264 Ultrafast + System Fonts Dir + Copy Audio
      Stage 5: CPU libx264 Ultrafast + Custom Fonts Dir + AAC Audio
      Stage 6: CPU libx264 Ultrafast + System Fonts Dir + AAC Audio
    """
    reset_render_progress()

    clean_video_path = str(Path(video_path).resolve())
    escaped_ass = escape_ffmpeg_filter_path(ass_path)
    escaped_custom_fonts = escape_ffmpeg_filter_path(CUSTOM_FONTS_DIR)
    escaped_sys_fonts = escape_ffmpeg_filter_path(SYSTEM_FONTS_DIR)

    stages = [
        {
            "name": "Stage 1: GPU NVENC + Custom Fonts Dir + Copy Audio",
            "args": ["-c:v", "h264_nvenc", "-preset", "p1", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_custom_fonts}'", "-c:a", "copy"]
        },
        {
            "name": "Stage 2: GPU NVENC + System Fonts Dir + Copy Audio",
            "args": ["-c:v", "h264_nvenc", "-preset", "p1", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_sys_fonts}'", "-c:a", "copy"]
        },
        {
            "name": "Stage 3: CPU libx264 Ultrafast + Custom Fonts Dir + Copy Audio",
            "args": ["-c:v", "libx264", "-preset", "ultrafast", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_custom_fonts}'", "-c:a", "copy"]
        },
        {
            "name": "Stage 4: CPU libx264 Ultrafast + System Fonts Dir + Copy Audio",
            "args": ["-c:v", "libx264", "-preset", "ultrafast", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_sys_fonts}'", "-c:a", "copy"]
        },
        {
            "name": "Stage 5: CPU libx264 Ultrafast + Custom Fonts Dir + AAC Re-encode",
            "args": ["-c:v", "libx264", "-preset", "ultrafast", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_custom_fonts}'", "-c:a", "aac", "-b:a", "192k"]
        },
        {
            "name": "Stage 6: CPU libx264 Ultrafast + System Fonts Dir + AAC Re-encode",
            "args": ["-c:v", "libx264", "-preset", "ultrafast", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_sys_fonts}'", "-c:a", "aac", "-b:a", "192k"]
        }
    ]

    progress_file = TEMP_DIR / "ffmpeg_progress.txt"

    for idx, stage in enumerate(stages, 1):
        update_render_progress(
            percent=0,
            status=f"Running {stage['name']}",
            stage=f"Stage {idx}/6"
        )
        
        if progress_file.exists():
            try:
                progress_file.unlink()
            except Exception:
                pass

        cmd = [
            "ffmpeg", "-y",
            "-progress", str(progress_file),
            "-i", clean_video_path
        ] + stage["args"] + [str(output_path.resolve())]

        try:
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            
            while process.poll() is None:
                time.sleep(0.3)
                if progress_file.exists():
                    try:
                        with open(progress_file, "r") as pf:
                            content = pf.read()
                        
                        out_time_ms = 0
                        speed = "1x"
                        for line in content.splitlines():
                            if line.startswith("out_time_ms="):
                                val = line.split("=")[1].strip()
                                if val.isdigit():
                                    out_time_ms = int(val)
                            elif line.startswith("speed="):
                                speed = line.split("=")[1].strip()
                        
                        current_secs = out_time_ms / 1_000_000.0
                        if duration > 0:
                            pct = min(99.9, (current_secs / duration) * 100.0)
                            update_render_progress(
                                percent=pct,
                                speed=speed,
                                status=f"Rendering: {pct:.1f}% ({stage['name']})"
                            )
                    except Exception:
                        pass

            if process.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
                update_render_progress(
                    percent=100.0,
                    status="Render Completed Successfully",
                    stage="Done"
                )
                return True

        except Exception as err:
            print(f"{stage['name']} failed with error: {err}")
            continue

    update_render_progress(
        percent=0,
        status="Render Failed Across All Fallback Engines",
        stage="Failed",
        error="All 6 render stages failed to output video."
    )
    return False
