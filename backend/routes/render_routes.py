import os
import shutil
import threading
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import TEMP_DIR, OUTPUT_DIR, CUSTOM_FONTS_DIR, get_render_progress, reset_render_progress
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
    posX: Optional[int] = -3
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
    export_mp4: bool = True
    export_srt: bool = True
    export_xml: bool = True

class AiCaptionRequest(BaseModel):
    video_path: Optional[str] = None

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

    # Calculate scale factor relative to reference 1920 vertical sequence height
    ref_y = 1920.0 if res_y >= res_x else 1080.0
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
        f"Style: Default,{style.fontFamily},{ass_font_size},{primary_ass},&H00000000,{stroke_ass},{bg_ass},{is_bold},{is_italic},{1 if style.underline else 0},{1 if style.strikethrough else 0},100,100,{style.tracking},0,{border_style},{outline_val},{shadow_val},{ass_alignment},20,20,40,1",
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
    pp_pos_x = style.posX if style.posX is not None else -3
    pp_pos_y = style.posY if style.posY is not None else 444

    ref_x = 1080.0 if res_y >= res_x else 1920.0
    abs_x = round((play_res_x / 2.0) + (pp_pos_x * (play_res_x / ref_x)))
    abs_y = round((play_res_y / 2.0) + (pp_pos_y * (play_res_y / ref_y)))

    for cap in captions:
        start_t = format_ass_time(cap["start"])
        end_t = format_ass_time(cap["end"])
        text = cap["text"]

        if style.allCaps:
            text = text.upper()

        tags = [f"\\pos({abs_x},{abs_y})"]
        if style.tracking != 0:
            tags.append(f"\\fsp{style.tracking}")

        tag_str = "{" + "".join(tags) + "}"
        ass_content.append(f"Dialogue: 0,{start_t},{end_t},Default,,0,0,0,,{tag_str}{text}")

    with open(ass_output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(ass_content))

def async_render_job(video_path: str, caption_dicts: List[dict], req: RenderRequest):
    ass_path = TEMP_DIR / "render_temp.ass"
    generate_ass_script(video_path, caption_dicts, req.style, ass_path)

    out_mp4_path = get_auto_versioned_path(video_path, ext=".mp4")
    out_srt_path = out_mp4_path.with_suffix(".srt")
    out_xml_path = out_mp4_path.with_suffix(".xml")

    if req.export_srt:
        generate_srt_file(caption_dicts, out_srt_path)

    if req.export_xml:
        generate_premiere_xml(video_path, caption_dicts, out_xml_path)

    if req.export_mp4:
        duration = get_video_info(video_path)["duration"]
        render_ass_video(video_path, str(ass_path), out_mp4_path, duration)

    dest_dir_str = req.google_drive_export_path or req.custom_output_dir
    if dest_dir_str:
        try:
            dest_dir = Path(dest_dir_str).resolve()
            dest_dir.mkdir(parents=True, exist_ok=True)

            if req.export_mp4 and out_mp4_path.exists():
                shutil.copy2(out_mp4_path, dest_dir / out_mp4_path.name)

            if req.export_srt and out_srt_path.exists():
                shutil.copy2(out_srt_path, dest_dir / out_srt_path.name)

            if req.export_xml and out_xml_path.exists():
                shutil.copy2(out_xml_path, dest_dir / out_xml_path.name)
        except Exception as e:
            print(f"Warning: Failed to copy exports to custom/Drive destination path: {e}")

@router.post("/render")
def trigger_render(req: RenderRequest):
    path_obj = Path(req.video_path).resolve()
    if not path_obj.exists():
        raise HTTPException(status_code=404, detail=f"Source video path does not exist: '{req.video_path}'")

    reset_render_progress()
    caption_dicts = [c.dict() for c in req.captions]

    thread = threading.Thread(target=async_render_job, args=(str(path_obj), caption_dicts, req), daemon=True)
    thread.start()

    return {
        "status": "Started",
        "message": "Render task initiated successfully.",
        "video_path": str(path_obj)
    }

@router.get("/render_progress")
def render_progress():
    return get_render_progress()

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
                "strokeWidth": 4,
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
                "strokeWidth": 3
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
                "strokeWidth": 3,
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
    if OUTPUT_DIR.exists():
        for file in OUTPUT_DIR.glob("*.mp4"):
            try:
                stat = file.stat()
                size_mb = round(stat.st_size / (1024 * 1024), 2)
                info = get_video_info(str(file))
                exports.append({
                    "filename": file.name,
                    "path": str(file.resolve()),
                    "size_mb": size_mb,
                    "duration": round(info["duration"], 2),
                    "created_at": int(stat.st_mtime),
                    "srt_exists": file.with_suffix(".srt").exists(),
                    "xml_exists": file.with_suffix(".xml").exists()
                })
            except Exception:
                continue

    exports.sort(key=lambda x: x["created_at"], reverse=True)
    return {"count": len(exports), "exports": exports}

@router.get("/exports/{filename}")
def stream_export_file(filename: str):
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Exported video '{filename}' not found.")
    return FileResponse(str(file_path), media_type="video/mp4")
