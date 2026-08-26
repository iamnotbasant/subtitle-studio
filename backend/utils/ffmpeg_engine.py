import os
import re
import sys
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Union, Optional, List, Dict
from config import OUTPUT_DIR, TEMP_DIR, CUSTOM_FONTS_DIR, SYSTEM_FONTS_DIR, update_render_progress, reset_render_progress

def escape_ffmpeg_filter_path(path_input: Union[str, Path]) -> str:
    r"""
    Escapes file path string for FFmpeg video filter parameter (-vf subtitles='...').
    Converts backslashes to forward slashes, escapes colons (C:\ -> C\:) and special characters.
    """
    p_str = str(Path(path_input).resolve()).replace("\\", "/")
    p_str = p_str.replace(":", "\\:")
    p_str = p_str.replace("'", "'\\''")
    p_str = p_str.replace("[", "\\[").replace("]", "\\]")
    return p_str

def get_video_duration_secs(video_path: Union[str, Path]) -> float:
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

def check_has_audio(video_path: Union[str, Path]) -> bool:
    """
    Checks if source video contains an active audio stream.
    """
    clean_path = str(Path(video_path).resolve())
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=codec_name",
        "-of", "csv=p=0",
        clean_path
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
        return bool(res.stdout.strip())
    except Exception:
        return False

def get_video_info(video_path: Union[str, Path]) -> dict:
    """
    Retrieves video resolution, frame rate, duration, and audio presence.
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
        has_audio = check_has_audio(clean_path)
        return {"width": width, "height": height, "fps": fps, "duration": duration, "has_audio": has_audio}
    except Exception:
        return {"width": 1920, "height": 1080, "fps": 30.0, "duration": get_video_duration_secs(clean_path), "has_audio": False}

def get_auto_versioned_path(base_name: Union[str, Path], ext: str = ".mp4", base_dir: Optional[Union[str, Path]] = None) -> Path:
    """
    Auto-increments file output path.
    First tries original filename (e.g. video.mp4).
    If it exists, auto-increments with _v1, _v2, etc. (e.g. video_v1.mp4, video_v2.mp4).
    """
    target_dir = Path(base_dir).resolve() if base_dir else OUTPUT_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    clean_stem = re.sub(r"_v\d+$", "", Path(base_name).stem)
    # First attempt: Original filename without any version suffix
    target = target_dir / f"{clean_stem}{ext}"
    if not target.exists():
        return target

    # If original file exists, start versioning: _v1, _v2, ...
    version = 1
    target = target_dir / f"{clean_stem}_v{version}{ext}"
    while target.exists():
        version += 1
        target = target_dir / f"{clean_stem}_v{version}{ext}"
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

    sorted_caps = sorted(captions, key=lambda c: float(c.get("start", 0.0)))
    with open(output_path, "w", encoding="utf-8") as f:
        for idx, cap in enumerate(sorted_caps, 1):
            start_str = format_srt_time(cap.get("start", 0.0))
            end_str = format_srt_time(cap.get("end", 0.0))
            text = cap.get("text", "")
            f.write(f"{idx}\n{start_str} --> {end_str}\n{text}\n\n")

def generate_premiere_xml(video_path: Union[str, Path], captions: list, output_xml_path: Path):
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
    sorted_caps = sorted(captions, key=lambda c: float(c.get("start", 0.0)))
    for idx, cap in enumerate(sorted_caps, 1):
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

def check_nvenc_support() -> bool:
    """
    Checks whether NVIDIA NVENC hardware encoder is actively available.
    """
    try:
        res = subprocess.run(
            ["ffmpeg", "-hide_banner", "-f", "lavfi", "-i", "nullsrc=s=64x64:d=0.04", "-c:v", "h264_nvenc", "-f", "null", "-"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=2
        )
        return res.returncode == 0
    except Exception:
        return False

def parse_ffmpeg_timestamp(time_str: str) -> float:
    """
    Converts FFmpeg timestamp string (e.g. '00:01:23.456000') into total seconds.
    """
    try:
        parts = time_str.strip().split(":")
        if len(parts) == 3:
            h = float(parts[0])
            m = float(parts[1])
            s = float(parts[2])
            return max(0.0, h * 3600.0 + m * 60.0 + s)
    except Exception:
        pass
    return 0.0

def render_ass_video(video_path: Union[str, Path], ass_path: Union[str, Path], output_path: Path, duration: float) -> bool:
    """
    Executes an adaptive, high-performance subtitle burn FFmpeg render pipeline:
    - Auto-detects NVENC GPU acceleration or defaults smoothly to CPU libx264 Ultrafast.
    - Accurately tracks real-time progress, encoding speed, frame counts, and ETA.
    """
    clean_video_path = str(Path(video_path).resolve())
    escaped_ass = escape_ffmpeg_filter_path(ass_path)
    escaped_custom_fonts = escape_ffmpeg_filter_path(CUSTOM_FONTS_DIR)

    info = get_video_info(clean_video_path)
    fps = info.get("fps") or 30.0
    total_frames = int(round((duration or info.get("duration") or 0.0) * fps))
    has_audio = info.get("has_audio", True)

    has_gpu = check_nvenc_support()

    # Build audio arguments based on whether audio track exists
    audio_copy = ["-c:a", "copy"] if has_audio else ["-an"]
    audio_aac = ["-c:a", "aac", "-b:a", "192k"] if has_audio else ["-an"]

    if has_gpu:
        stages = [
            {
                "name": "GPU NVENC (Fast + Audio Sync)",
                "args": ["-c:v", "h264_nvenc", "-preset", "p1", "-movflags", "+faststart", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_custom_fonts}'"] + audio_copy
            },
            {
                "name": "GPU NVENC (Fast + AAC Audio)",
                "args": ["-c:v", "h264_nvenc", "-preset", "p1", "-movflags", "+faststart", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_custom_fonts}'"] + audio_aac
            },
            {
                "name": "CPU libx264 (Ultrafast + Audio Copy)",
                "args": ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-movflags", "+faststart", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_custom_fonts}'"] + audio_copy
            },
            {
                "name": "CPU libx264 (Ultrafast + AAC Audio)",
                "args": ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-movflags", "+faststart", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_custom_fonts}'"] + audio_aac
            }
        ]
    else:
        stages = [
            {
                "name": "CPU libx264 (Ultrafast + Stream Copy)",
                "args": ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-movflags", "+faststart", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_custom_fonts}'"] + audio_copy
            },
            {
                "name": "CPU libx264 (Ultrafast + AAC Audio)",
                "args": ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-movflags", "+faststart", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_custom_fonts}'"] + audio_aac
            },
            {
                "name": "CPU libx264 (Veryfast + Safe Pixel Format)",
                "args": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_custom_fonts}'"] + audio_aac
            },
            {
                "name": "CPU libx264 (High Compatibility Baseline)",
                "args": ["-c:v", "libx264", "-preset", "fast", "-profile:v", "baseline", "-level", "3.0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-vf", f"subtitles='{escaped_ass}':fontsdir='{escaped_custom_fonts}'"] + audio_aac
            }
        ]

    progress_file = TEMP_DIR / "ffmpeg_progress.txt"
    log_file_path = TEMP_DIR / "ffmpeg_render.log"

    for idx, stage in enumerate(stages, 1):
        stage_label = f"Stage {idx}/{len(stages)}: {stage['name']}"
        update_render_progress(
            percent=0.0,
            status=f"Starting {stage['name']}...",
            stage=f"Stage {idx}/{len(stages)}",
            current_frame=0,
            total_frames=total_frames,
            speed="0x",
            eta="Calculating..."
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

        start_wall_time = time.time()
        last_speed_str = "1.0x"
        last_current_frame = 0

        try:
            with open(log_file_path, "w", encoding="utf-8", errors="ignore") as log_file:
                process = subprocess.Popen(cmd, stdout=log_file, stderr=log_file, text=True)

                while process.poll() is None:
                    time.sleep(0.15)
                    if not progress_file.exists():
                        continue

                    try:
                        content = ""
                        with open(progress_file, "r", encoding="utf-8", errors="ignore") as pf:
                            content = pf.read()

                        if not content:
                            continue

                        current_secs = 0.0
                        cur_frame = 0
                        speed_str = last_speed_str
                        speed_factor = 1.0

                        for line in content.splitlines():
                            line_strip = line.strip()
                            if line_strip.startswith("out_time_us="):
                                val_str = line_strip.split("=", 1)[1].strip()
                                if val_str.lstrip("-").isdigit():
                                    us = int(val_str)
                                    if us > 0:
                                        current_secs = max(current_secs, us / 1_000_000.0)
                            elif line_strip.startswith("out_time_ms="):
                                val_str = line_strip.split("=", 1)[1].strip()
                                if val_str.lstrip("-").isdigit():
                                    us = int(val_str)
                                    if us > 0:
                                        current_secs = max(current_secs, us / 1_000_000.0)
                            elif line_strip.startswith("out_time="):
                                time_part = line_strip.split("=", 1)[1].strip()
                                if ":" in time_part:
                                    parsed_s = parse_ffmpeg_timestamp(time_part)
                                    if parsed_s > 0:
                                        current_secs = max(current_secs, parsed_s)
                            elif line_strip.startswith("frame="):
                                f_str = line_strip.split("=", 1)[1].strip()
                                if f_str.isdigit():
                                    cur_frame = max(cur_frame, int(f_str))
                            elif line_strip.startswith("speed="):
                                sp_str = line_strip.split("=", 1)[1].strip()
                                if sp_str and sp_str != "N/A":
                                    speed_str = sp_str
                                    last_speed_str = sp_str
                                    try:
                                        speed_factor = float(sp_str.replace("x", "").strip())
                                    except Exception:
                                        speed_factor = 1.0

                        last_current_frame = cur_frame

                        pct = 0.0
                        if duration > 0:
                            pct_time = (current_secs / duration) * 100.0
                            pct_frame = (cur_frame / total_frames * 100.0) if total_frames > 0 else 0.0
                            pct = min(99.5, max(0.0, max(pct_time, pct_frame)))
                        elif total_frames > 0 and cur_frame > 0:
                            pct = min(99.5, max(0.0, (cur_frame / total_frames) * 100.0))

                        # Calculate ETA
                        eta_str = "--"
                        if duration > 0 and current_secs > 0:
                            remaining_s = max(0.0, duration - current_secs)
                            if speed_factor > 0.05:
                                eta_val = remaining_s / speed_factor
                            else:
                                elapsed = max(0.1, time.time() - start_wall_time)
                                eta_val = (remaining_s / current_secs) * elapsed

                            if eta_val >= 60:
                                eta_str = f"{int(eta_val // 60)}m {int(eta_val % 60):02d}s"
                            else:
                                eta_str = f"{int(round(eta_val))}s"
                        elif duration > 0:
                            eta_str = f"{int(round(duration))}s"

                        update_render_progress(
                            percent=pct,
                            status=f"Rendering: {pct:.1f}% ({stage['name']})",
                            stage=f"Stage {idx}/{len(stages)}",
                            current_frame=cur_frame,
                            total_frames=total_frames,
                            speed=speed_str,
                            eta=eta_str
                        )
                    except Exception:
                        pass

            if process.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
                update_render_progress(
                    percent=100.0,
                    status="Render Completed Successfully",
                    stage="Done",
                    current_frame=total_frames if total_frames > 0 else last_current_frame,
                    total_frames=total_frames if total_frames > 0 else last_current_frame,
                    speed=last_speed_str,
                    eta="0s"
                )
                return True

        except Exception as err:
            print(f"{stage['name']} failed with error: {err}")
            continue

    update_render_progress(
        percent=0,
        status="Render Failed Across Fallback Engines",
        stage="Failed",
        error="All render stages failed to output video. Check log for details."
    )
    return False
