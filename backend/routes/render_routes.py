import os
import shutil
import threading
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import TEMP_DIR, OUTPUT_DIR, CUSTOM_FONTS_DIR, get_render_progress, reset_render_progress, update_render_progress
from backend.utils.font_parser import resolve_ass_font_name
from backend.utils.ffmpeg_engine import (
    get_video_info,
    get_auto_versioned_path,
    generate_srt_file,
    generate_premiere_xml,
    render_ass_video
)

router = APIRouter()

class CaptionItem(BaseModel):
    id: Optional[str] = None
    start: float
    end: float
    text: str

class RenderStyleProps(BaseModel):
    fontFamily: str = "Century Gothic"
    fontStyle: str = "Bold"
    fontSize: int = 75
    tracking: float = 0.0
    leading: float = 1.2
    bold: bool = False
    italic: bool = False
    allCaps: bool = False
    smallCaps: bool = False
    underline: bool = False
    strikethrough: bool = False
    superscript: bool = False
    subscript: bool = False
    alignment: str = "bottom-center"
    textAlign: str = "center"
    posX: Optional[int] = 0
    posY: Optional[int] = 444
    fillEnabled: bool = True
    primaryColor: str = "#FFFFFF"
    primaryOpacity: float = 1.0
    strokeEnabled: bool = True
    strokeColor: str = "#000000"
    strokeWidth: float = 3.0
    strokeType: str = "Outer"
    bgEnabled: bool = False
    bgColor: str = "#000000"
    bgOpacity: float = 0.0
    bgPadding: int = 10
    shadowEnabled: bool = False
    shadowColor: str = "#000000"
    shadowDistance: int = 4
    shadowBlur: int = 4
    shadowOffsetX: int = 2
    shadowOffsetY: int = 2

class RenderRequest(BaseModel):
    video_path: str
    captions: List[CaptionItem]
    style: RenderStyleProps
    custom_output_dir: Optional[str] = None
    google_drive_export_path: Optional[str] = None
    export_filename: Optional[str] = None
    export_mp4: bool = True
    export_srt: bool = True
    export_xml: bool = True

class AiCaptionRequest(BaseModel):
    video_path: Optional[str] = None

class BatchScanRequest(BaseModel):
    folder_path: str

class ParseSrtRequest(BaseModel):
    srt_path: Optional[str] = None
    srt_content: Optional[str] = None

def hex_to_ass_color(hex_str: str, opacity: float = 1.0) -> str:
    hex_clean = hex_str.lstrip("#")
    if len(hex_clean) == 6:
        r, g, b = hex_clean[0:2], hex_clean[2:4], hex_clean[4:6]
    elif len(hex_clean) == 8:
        r, g, b = hex_clean[0:2], hex_clean[2:4], hex_clean[4:6]
    else:
        r, g, b = "FF", "FF", "FF"
        
    alpha_int = int((1.0 - max(0.0, min(1.0, opacity))) * 255)
    alpha_hex = f"{alpha_int:02X}"
    return f"&H{alpha_hex}{b}{g}{r}".upper()

def generate_ass_script(video_path: str, captions: List[dict], style: RenderStyleProps, ass_output_path: Path):
    """
    Generates a pixel-perfect ASS subtitle script for FFmpeg rendering.
    Enforces PlayResX/PlayResY canvas resolution and calculates center-origin absolute coordinates.
    """
    info = get_video_info(video_path)
    res_x = info.get("width") or 1080
    res_y = info.get("height") or 1920

    # Explicitly enforce ASS Canvas Resolution to prevent FFmpeg 384x288 fallback
    play_res_x = res_x
    play_res_y = res_y

    # Calculate scale factor relative to reference 1920 vertical sequence height (or 1080 horizontal / 1:1 square)
    if res_y > res_x:
        ref_x = 1080.0
        ref_y = 1920.0
    elif res_x > res_y:
        ref_x = 1920.0
        ref_y = 1080.0
    else:
        ref_x = float(res_x)
        ref_y = float(res_y)

    scale_factor = res_y / ref_y
    ass_font_size = max(12, round(style.fontSize * scale_factor))

    fill_op = style.primaryOpacity if style.fillEnabled else 0.0
    primary_ass = hex_to_ass_color(style.primaryColor, fill_op)

    stroke_op = 1.0 if (style.strokeEnabled and style.strokeWidth > 0) else 0.0
    stroke_ass = hex_to_ass_color(style.strokeColor, stroke_op)
    stroke_val = max(1, round(style.strokeWidth * (res_y / 1080.0))) if style.strokeEnabled else 0

    bg_op = style.bgOpacity if style.bgEnabled else 0.0
    bg_ass = hex_to_ass_color(style.bgColor, bg_op)

    shadow_op = 0.7 if style.shadowEnabled else 0.0
    shadow_ass = hex_to_ass_color(style.shadowColor, shadow_op)
    shadow_val = max(abs(style.shadowOffsetX), abs(style.shadowOffsetY), style.shadowDistance) if style.shadowEnabled else 0

    border_style = 3 if (style.bgEnabled and style.bgOpacity > 0) else 1
    outline_val = style.bgPadding if border_style == 3 else stroke_val

    is_bold = 1 if (style.bold or style.fontStyle.lower() in ("bold", "black")) else 0
    is_italic = 1 if (style.italic or style.fontStyle.lower() == "italic") else 0

    # Resolve exact internal font family / postscript name for libass & custom fonts
    ass_font_name = resolve_ass_font_name(style.fontFamily)

    # Force Alignment 5 (Middle-Center anchor) for absolute \pos(abs_x, abs_y) coordinate positioning
    ass_alignment = 5

    ass_content = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {play_res_x}",
        f"PlayResY: {play_res_y}",
        "ScaledBorderAndShadow: yes",
        "WrapStyle: 2",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,{ass_font_name},{ass_font_size},{primary_ass},&H00000000,{stroke_ass},{bg_ass},{is_bold},{is_italic},{1 if style.underline else 0},{1 if style.strikethrough else 0},100,100,{style.tracking},0,{border_style},{outline_val},{shadow_val},{ass_alignment},20,20,40,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]

    def format_ass_time(secs: float) -> str:
        h = int(secs // 3600)
        m = int((secs % 3600) // 60)
        s = int(secs % 60)
        cs = int((secs - int(secs)) * 100)
        return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

    # Calculate center-origin absolute coordinates matching Premiere Pro (540 + ppPosX, 960 + ppPosY)
    pp_pos_x = style.posX if style.posX is not None else 0
    pp_pos_y = style.posY if style.posY is not None else 444

    abs_x = round((play_res_x / 2.0) + (pp_pos_x * (play_res_x / ref_x)))
    abs_y = round((play_res_y / 2.0) + (pp_pos_y * (play_res_y / ref_y)))

    # Sort captions chronologically by start time
    sorted_captions = sorted(captions, key=lambda c: float(c.get("start", 0.0)))

    # Calculate vertical spacing for overlapping lines (font size + margins/padding)
    line_height = round(ass_font_size * 1.35 + (stroke_val * 2))
    shift_direction = -1 if pp_pos_y >= 0 else 1  # Shift upwards if in bottom half, downwards if top

    # Multi-tier overlap slot tracker: slot_index -> active_end_sec
    active_slots = {}

    for cap in sorted_captions:
        start_sec = max(0.0, float(cap.get("start", 0.0)))
        end_sec = max(start_sec + 0.05, float(cap.get("end", start_sec + 1.0)))
        start_t = format_ass_time(start_sec)
        end_t = format_ass_time(end_sec)

        # Clear expired slots
        expired = [s for s, e in active_slots.items() if e <= start_sec]
        for s in expired:
            del active_slots[s]

        # Find first available slot (0 = baseline, 1 = shifted, etc.)
        slot = 0
        while slot in active_slots:
            slot += 1
        active_slots[slot] = end_sec

        # Offset Y position for overlapping captions to prevent visual collisions
        cap_y = abs_y + (slot * shift_direction * line_height)
        
        text = str(cap.get("text", "")).replace("\r\n", "\\N").replace("\n", "\\N")

        if style.allCaps:
            text = text.upper()

        tags = [f"\\an5\\pos({abs_x},{cap_y})"]
        if style.tracking != 0:
            tags.append(f"\\fsp{style.tracking}")

        tag_str = "{" + "".join(tags) + "}"
        ass_content.append(f"Dialogue: {slot},{start_t},{end_t},Default,,0,0,0,,{tag_str}{text}")

    with open(ass_output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(ass_content))

import uuid

RENDER_EXECUTION_LOCK = threading.Lock()

def async_render_job(video_path: str, caption_dicts: List[dict], req: RenderRequest, job_id: str):
    with RENDER_EXECUTION_LOCK:
        try:
            # Determine structured local and custom/Drive output folders
            local_video_dir = OUTPUT_DIR / "videos"
            local_srt_dir = OUTPUT_DIR / "subtitles"
            local_xml_dir = OUTPUT_DIR / "sequences"

            local_video_dir.mkdir(parents=True, exist_ok=True)
            local_srt_dir.mkdir(parents=True, exist_ok=True)
            local_xml_dir.mkdir(parents=True, exist_ok=True)

            custom_base = None
            if req.custom_output_dir and str(req.custom_output_dir).strip():
                custom_base = Path(str(req.custom_output_dir).strip()).resolve()
                custom_base.mkdir(parents=True, exist_ok=True)

            drive_base = None
            if req.google_drive_export_path and str(req.google_drive_export_path).strip():
                drive_base = Path(str(req.google_drive_export_path).strip()).resolve()
                drive_base.mkdir(parents=True, exist_ok=True)

            # Stage 1: Generate subtitle styles & ASS script
            update_render_progress(
                job_id=job_id,
                percent=5.0,
                status="Generating subtitle styles & ASS script...",
                stage="Subtitle Engine",
                speed="1x",
                eta="Calculating..."
            )
            ass_path = TEMP_DIR / f"render_{job_id}.ass"
            generate_ass_script(video_path, caption_dicts, req.style, ass_path)

            # Calculate auto-versioned output paths (clean stem first, then _v1, _v2 if collision exists)
            if req.export_filename and req.export_filename.strip():
                clean_stem = Path(req.export_filename.strip()).stem
                out_srt_path = local_srt_dir / f"{clean_stem}.srt"
            else:
                out_srt_path = get_auto_versioned_path(video_path, ext=".srt", base_dir=local_srt_dir)
                clean_stem = out_srt_path.stem
            out_mp4_path = local_video_dir / f"{clean_stem}.mp4"
            out_xml_path = local_xml_dir / f"{clean_stem}.xml"

            # Step 2: Generate and save .SRT file FIRST as requested
            if req.export_srt:
                update_render_progress(
                    job_id=job_id,
                    percent=12.0,
                    status=f"Exporting .SRT subtitle file: {out_srt_path.name}...",
                    stage="SRT Export",
                    eta="1s"
                )
                generate_srt_file(caption_dicts, out_srt_path)
                # Copy to custom or drive folders if configured
                if out_srt_path.exists():
                    if custom_base and custom_base.exists():
                        try:
                            shutil.copy2(out_srt_path, custom_base / out_srt_path.name)
                        except Exception as ce:
                            print(f"Warning: Could not copy SRT to custom folder: {ce}")
                    if drive_base and drive_base.exists():
                        try:
                            shutil.copy2(out_srt_path, drive_base / out_srt_path.name)
                        except Exception as de:
                            print(f"Warning: Could not copy SRT to Google Drive: {de}")

            # Step 3: Generate Premiere Pro XML sequence
            if req.export_xml:
                update_render_progress(
                    job_id=job_id,
                    percent=18.0,
                    status=f"Generating Premiere Pro XML sequence: {out_xml_path.name}...",
                    stage="Sequence XML",
                    eta="1s"
                )
                generate_premiere_xml(video_path, caption_dicts, out_xml_path)
                if out_xml_path.exists():
                    if custom_base and custom_base.exists():
                        try:
                            shutil.copy2(out_xml_path, custom_base / out_xml_path.name)
                        except Exception as ce:
                            print(f"Warning: Could not copy XML to custom folder: {ce}")
                    if drive_base and drive_base.exists():
                        try:
                            shutil.copy2(out_xml_path, drive_base / out_xml_path.name)
                        except Exception as de:
                            print(f"Warning: Could not copy XML to Google Drive: {de}")

            # Step 4: Render Video with burned subtitles
            if req.export_mp4:
                duration = get_video_info(video_path)["duration"]
                success = render_ass_video(video_path, str(ass_path), out_mp4_path, duration, job_id=job_id)
                if not success:
                    return

                if out_mp4_path.exists():
                    if custom_base and custom_base.exists():
                        try:
                            shutil.copy2(out_mp4_path, custom_base / out_mp4_path.name)
                        except Exception as ce:
                            print(f"Warning: Could not copy MP4 to custom folder: {ce}")
                    if drive_base and drive_base.exists():
                        try:
                            shutil.copy2(out_mp4_path, drive_base / out_mp4_path.name)
                        except Exception as de:
                            print(f"Warning: Could not copy MP4 to Google Drive: {de}")
            else:
                # If MP4 burn was not selected, complete task now
                update_render_progress(
                    job_id=job_id,
                    percent=100.0,
                    status="Subtitle & XML Export Completed Successfully",
                    stage="Done",
                    eta="0s"
                )
        except Exception as err:
            print(f"Error in async_render_job: {err}")
            update_render_progress(
                job_id=job_id,
                percent=0.0,
                status=f"Export failed: {err}",
                stage="Failed",
                error=str(err)
            )

@router.post("/render")
def trigger_render(req: RenderRequest):
    path_obj = Path(req.video_path).resolve()
    if not path_obj.exists():
        raise HTTPException(status_code=404, detail=f"Source video path does not exist: '{req.video_path}'")

    job_id = f"job_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}"
    reset_render_progress(job_id=job_id)
    caption_dicts = [c.dict() for c in req.captions]

    thread = threading.Thread(target=async_render_job, args=(str(path_obj), caption_dicts, req, job_id), daemon=True)
    thread.start()

    return {
        "status": "Started",
        "job_id": job_id,
        "message": "Render task initiated successfully.",
        "video_path": str(path_obj)
    }

@router.get("/render_progress")
def render_progress(job_id: Optional[str] = None):
    prog = get_render_progress()
    if job_id and prog.get("job_id") and prog.get("job_id") != job_id:
        return {
            "job_id": job_id,
            "percent": 0.0,
            "status": "Waiting in sequential render queue...",
            "stage": "Queued",
            "speed": "0x",
            "eta": "Queued..."
        }
    return prog

@router.get("/presets")
def get_style_presets():
    return {
        "presets": [
            {
                "id": "preset_pop_yellow",
                "name": "Pop Yellow Shorts",
                "fontFamily": "Montserrat",
                "fontStyle": "Black",
                "fontSize": 75,
                "primaryColor": "#FFDE00",
                "strokeEnabled": True,
                "strokeColor": "#000000",
                "strokeWidth": 4.0,
                "shadowEnabled": True
            },
            {
                "id": "preset_classic_white",
                "name": "Classic Premiere Subtitle",
                "fontFamily": "Century Gothic",
                "fontStyle": "Bold",
                "fontSize": 75,
                "primaryColor": "#FFFFFF",
                "strokeEnabled": True,
                "strokeColor": "#000000",
                "strokeWidth": 3.0
            },
            {
                "id": "preset_viral_green",
                "name": "Viral Neon Green",
                "fontFamily": "Poppins",
                "fontStyle": "Bold",
                "fontSize": 75,
                "primaryColor": "#22C55E",
                "strokeEnabled": True,
                "strokeColor": "#000000",
                "strokeWidth": 3.5,
                "shadowEnabled": True
            },
            {
                "id": "preset_neon_cyberpunk",
                "name": "Neon Cyberpunk Pink",
                "fontFamily": "Poppins",
                "fontStyle": "Bold",
                "fontSize": 75,
                "primaryColor": "#FF007F",
                "strokeEnabled": True,
                "strokeColor": "#00F3FF",
                "strokeWidth": 3.0,
                "shadowEnabled": True
            },
            {
                "id": "preset_minimalist_podcast",
                "name": "Minimalist Podcast Pill",
                "fontFamily": "Inter",
                "fontStyle": "Regular",
                "fontSize": 65,
                "primaryColor": "#FFFFFF",
                "bgEnabled": True,
                "bgColor": "#000000",
                "bgOpacity": 0.65,
                "bgPadding": 12
            },
            {
                "id": "preset_cinematic_gold",
                "name": "Cinematic Luxury Gold",
                "fontFamily": "Montserrat",
                "fontStyle": "Bold",
                "fontSize": 72,
                "primaryColor": "#FCD34D",
                "strokeEnabled": True,
                "strokeColor": "#000000",
                "strokeWidth": 3.0,
                "shadowEnabled": True
            }
        ]
    }

@router.post("/generate_ai_captions")
def generate_ai_captions(req: AiCaptionRequest):
    duration = 15.0
    if req.video_path and Path(req.video_path).exists():
        duration = get_video_info(req.video_path)["duration"]

    sample_lines = [
        "Welcome to Premiere Properties Subtitle Studio.",
        "Automate your video subtitles with Essential Graphics.",
        "Par likha jaata hai with pixel-perfect 3.0px outer stroke.",
        "Export directly to Google Drive and Premiere Pro XML."
    ]

    generated = []
    step = min(4.0, duration / len(sample_lines))
    curr = 0.5
    for idx, text in enumerate(sample_lines):
        end = min(duration, curr + step - 0.3)
        generated.append({
            "id": f"cap_ai_{idx+1}",
            "start": round(curr, 2),
            "end": round(end, 2),
            "text": text
        })
        curr = end + 0.3
        if curr >= duration:
            break

    return {
        "success": True,
        "count": len(generated),
        "captions": generated
    }

@router.get("/list_exports")
def list_exports():
    exports = []
    seen_paths = set()
    if OUTPUT_DIR.exists():
        for file in sorted(OUTPUT_DIR.glob("**/*.mp4"), key=lambda f: f.stat().st_mtime, reverse=True):
            resolved_str = str(file.resolve())
            if resolved_str in seen_paths:
                continue
            seen_paths.add(resolved_str)
            try:
                stat = file.stat()
                size_mb = round(stat.st_size / (1024 * 1024), 2)
                info = get_video_info(str(file))

                # Check for srt in same folder or subtitles/ folder
                srt_same = file.with_suffix(".srt")
                srt_sub = OUTPUT_DIR / "subtitles" / f"{file.stem}.srt"
                srt_exists = srt_same.exists() or srt_sub.exists()

                xml_same = file.with_suffix(".xml")
                xml_sub = OUTPUT_DIR / "sequences" / f"{file.stem}.xml"
                xml_exists = xml_same.exists() or xml_sub.exists()

                exports.append({
                    "filename": file.name,
                    "path": resolved_str,
                    "size_mb": size_mb,
                    "duration": round(info["duration"], 2),
                    "created_at": int(stat.st_mtime),
                    "srt_exists": srt_exists,
                    "xml_exists": xml_exists
                })
            except Exception:
                continue

    exports.sort(key=lambda x: x["created_at"], reverse=True)
    return {"count": len(exports), "exports": exports}

@router.get("/exports/{filename}")
def stream_export_file(filename: str, quality: str = "full"):
    # Check direct in OUTPUT_DIR or inside videos/
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        file_path = OUTPUT_DIR / "videos" / filename
    if not file_path.exists():
        # Search recursively
        matches = list(OUTPUT_DIR.glob(f"**/{filename}"))
        if matches:
            file_path = matches[0]
        else:
            raise HTTPException(status_code=404, detail=f"Exported video '{filename}' not found.")

    if quality and quality.lower() in ("480p", "360p", "720p", "fast"):
        # Generate or serve proxy for fast preview
        target_scale = "scale=-2:480" if quality in ("480p", "fast") else ("scale=-2:360" if quality == "360p" else "scale=-2:720")
        proxy_name = f"gallery_proxy_{quality}_{file_path.stem}.mp4"
        proxy_path = TEMP_DIR / proxy_name

        if not proxy_path.exists() or proxy_path.stat().st_mtime < file_path.stat().st_mtime:
            import subprocess
            cmd = [
                "ffmpeg", "-y",
                "-i", str(file_path.resolve()),
                "-vf", target_scale,
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "27", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-c:a", "aac", "-b:a", "96k",
                str(proxy_path.resolve())
            ]
            try:
                subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                return FileResponse(
                    str(proxy_path.resolve()),
                    media_type="video/mp4",
                    headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600"}
                )
            except Exception:
                pass

    return FileResponse(
        str(file_path.resolve()),
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache, no-store, must-revalidate"
        }
    )

def parse_srt_string_to_captions(srt_text: str) -> List[dict]:
    """
    Parses raw SRT subtitle text into a structured list of CaptionItem dictionaries.
    """
    import re
    def parse_time(t_str: str) -> float:
        t_clean = t_str.strip().replace(',', '.')
        parts = t_clean.split(':')
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
        elif len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        return float(parts[0])

    blocks = re.split(r'\n\s*\n', srt_text.strip().replace('\r\n', '\n'))
    captions = []
    idx = 1
    for block in blocks:
        lines = [l.strip() for l in block.split('\n') if l.strip()]
        if not lines:
            continue
        # Find line with timestamp arrow '-->'
        time_idx = -1
        for i, line in enumerate(lines):
            if '-->' in line:
                time_idx = i
                break
        if time_idx == -1:
            continue

        time_line = lines[time_idx]
        parts = time_line.split('-->')
        if len(parts) != 2:
            continue

        try:
            start_s = parse_time(parts[0])
            end_s = parse_time(parts[1])
            text_lines = lines[time_idx + 1:]
            text = ' '.join(text_lines)
            if text:
                captions.append({
                    "id": f"cap_{idx}",
                    "start": round(start_s, 2),
                    "end": round(end_s, 2),
                    "text": text
                })
                idx += 1
        except Exception:
            continue
    return captions

@router.post("/parse_srt")
def parse_srt(req: ParseSrtRequest):
    """
    Parses SRT content from direct text string or file path on server.
    """
    content = req.srt_content or ""
    if req.srt_path:
        p = Path(req.srt_path).resolve()
        if p.exists() and p.is_file():
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to read SRT file: {str(e)}")
        else:
            raise HTTPException(status_code=404, detail=f"SRT file not found: {req.srt_path}")

    if not content:
        return {"captions": [], "count": 0}

    captions = parse_srt_string_to_captions(content)
    return {
        "count": len(captions),
        "captions": captions
    }

@router.post("/batch_scan_pairs")
def batch_scan_pairs(req: BatchScanRequest):
    """
    Scans a folder for video files and SRT subtitle files, automatically pairing them by filename stem.
    """
    folder = Path(req.folder_path).resolve()
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=404, detail=f"Directory not found: '{req.folder_path}'")

    video_exts = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".flv", ".m4v"}
    srt_exts = {".srt", ".vtt"}

    video_files = []
    srt_files = {}

    try:
        for item in sorted(folder.iterdir(), key=lambda e: e.name.lower()):
            if item.is_file():
                suf = item.suffix.lower()
                if suf in video_exts:
                    video_files.append(item)
                elif suf in srt_exts:
                    srt_files[item.stem.lower()] = item
                    srt_files[item.name.lower()] = item
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scan directory: {str(e)}")

    pairs = []
    for idx, vfile in enumerate(video_files, 1):
        v_stem = vfile.stem.lower()
        matched_srt = None
        # Exact stem match
        if v_stem in srt_files:
            matched_srt = srt_files[v_stem]
        else:
            # Fuzzy match: e.g. v_stem + ".en" or starts with
            for s_key, s_val in srt_files.items():
                if s_key.startswith(v_stem) or v_stem.startswith(s_key):
                    matched_srt = s_val
                    break

        info = get_video_info(str(vfile))
        size_mb = round(vfile.stat().st_size / (1024 * 1024), 2)

        captions_count = 0
        if matched_srt:
            try:
                with open(matched_srt, "r", encoding="utf-8", errors="ignore") as sf:
                    caps = parse_srt_string_to_captions(sf.read())
                    captions_count = len(caps)
            except Exception:
                pass

        pairs.append({
            "id": f"batch_{idx}",
            "video_path": str(vfile.resolve()),
            "video_name": vfile.name,
            "size_mb": size_mb,
            "duration": round(info.get("duration", 0), 2),
            "width": info.get("width", 1920),
            "height": info.get("height", 1080),
            "fps": round(info.get("fps", 30), 2),
            "srt_path": str(matched_srt.resolve()) if matched_srt else None,
            "srt_name": matched_srt.name if matched_srt else None,
            "captions_count": captions_count,
            "status": "ready" if matched_srt else "missing_srt"
        })

    all_srts = [{"name": s.name, "path": str(s.resolve())} for s in srt_files.values() if s.is_file()]
    unique_srts = []
    seen = set()
    for s in all_srts:
        if s["path"] not in seen:
            seen.add(s["path"])
            unique_srts.append(s)

    return {
        "folder": str(folder),
        "total_videos": len(video_files),
        "total_srts": len(unique_srts),
        "pairs": pairs,
        "available_srts": unique_srts
    }

