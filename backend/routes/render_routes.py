import os
import threading
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from config import TEMP_DIR, OUTPUT_DIR, get_render_progress, reset_render_progress
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
    fontFamily: str = "Montserrat"
    fontStyle: str = "Bold"  # Regular, Bold, Italic, Black
    fontSize: int = 48
    tracking: float = 0.0    # letter spacing
    leading: float = 1.2     # line height
    bold: bool = False
    italic: bool = False
    allCaps: bool = False
    smallCaps: bool = False
    underline: bool = False
    strikethrough: bool = False
    superscript: bool = False
    subscript: bool = False
    alignment: str = "bottom-center"
    textAlign: str = "center"  # left, center, right, justify
    posX: Optional[int] = None
    posY: Optional[int] = None
    fillEnabled: bool = True
    primaryColor: str = "#FFFFFF"
    primaryOpacity: float = 1.0
    strokeEnabled: bool = True
    strokeColor: str = "#000000"
    strokeWidth: int = 2
    strokeType: str = "Outer"  # Outer, Inner, Center
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

def hex_to_ass_color(hex_str: str, opacity: float = 1.0) -> str:
    """
    Converts CSS hex #RRGGBB or #RRGGBBAA into ASS color string &HAABBGGRR.
    Note: ASS alpha is 00=Opaque, FF=Transparent.
    """
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

def get_ass_alignment(align_str: str) -> int:
    """
    Maps alignment matrix string to ASS numpad alignment code (1-9).
    """
    mapping = {
        "bottom-left": 1, "bottom-center": 2, "bottom-right": 3,
        "middle-left": 4, "center": 5, "middle-center": 5, "middle-right": 6,
        "top-left": 7, "top-center": 8, "top-right": 9
    }
    return mapping.get(align_str.lower(), 2)

def generate_ass_script(video_path: str, captions: List[dict], style: RenderStyleProps, ass_output_path: Path):
    """
    Generates a full .ass subtitle file aligned 1:1 with Premiere Pro Essential Graphics controls.
    """
    info = get_video_info(video_path)
    res_x = info["width"]
    res_y = info["height"]

    # Fill / Primary Color
    fill_op = style.primaryOpacity if style.fillEnabled else 0.0
    primary_ass = hex_to_ass_color(style.primaryColor, fill_op)

    # Stroke / Outline
    stroke_op = 1.0 if (style.strokeEnabled and style.strokeWidth > 0) else 0.0
    stroke_ass = hex_to_ass_color(style.strokeColor, stroke_op)
    stroke_val = style.strokeWidth if style.strokeEnabled else 0

    # Background Box
    bg_op = style.bgOpacity if style.bgEnabled else 0.0
    bg_ass = hex_to_ass_color(style.bgColor, bg_op)

    # Shadow
    shadow_op = 0.7 if style.shadowEnabled else 0.0
    shadow_ass = hex_to_ass_color(style.shadowColor, shadow_op)
    shadow_val = max(abs(style.shadowOffsetX), abs(style.shadowOffsetY), style.shadowDistance) if style.shadowEnabled else 0

    # BorderStyle: 1 = Outline + Shadow, 3 = Opaque Box
    border_style = 3 if (style.bgEnabled and style.bgOpacity > 0) else 1
    outline_val = style.bgPadding if border_style == 3 else stroke_val

    is_bold = 1 if (style.bold or style.fontStyle.lower() in ("bold", "black")) else 0
    is_italic = 1 if (style.italic or style.fontStyle.lower() == "italic") else 0
    align_num = get_ass_alignment(style.alignment)

    # ASS Header
    ass_content = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {res_x}",
        f"PlayResY: {res_y}",
        "ScaledBorderAndShadow: yes",
        "WrapStyle: 0",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,{style.fontFamily},{style.fontSize},{primary_ass},&H00000000,{stroke_ass},{bg_ass},{is_bold},{is_italic},{1 if style.underline else 0},{1 if style.strikethrough else 0},100,100,{style.tracking},0,{border_style},{outline_val},{shadow_val},{align_num},20,20,20,1",
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

    for cap in captions:
        start_t = format_ass_time(cap["start"])
        end_t = format_ass_time(cap["end"])
        text = cap["text"]

        if style.allCaps:
            text = text.upper()

        tags = []
        if style.posX is not None and style.posY is not None:
            tags.append(f"\\pos({style.posX},{style.posY})")

        if style.tracking != 0:
            tags.append(f"\\fsp{style.tracking}")

        tag_str = "{" + "".join(tags) + "}" if tags else ""
        ass_content.append(f"Dialogue: 0,{start_t},{end_t},Default,,0,0,0,,{tag_str}{text}")

    with open(ass_output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(ass_content))

def async_render_job(video_path: str, caption_dicts: List[dict], style: RenderStyleProps):
    """
    Background worker thread to execute export job.
    """
    ass_path = TEMP_DIR / "render_temp.ass"
    generate_ass_script(video_path, caption_dicts, style, ass_path)

    out_mp4_path = get_auto_versioned_path(video_path, ext=".mp4")
    out_srt_path = out_mp4_path.with_suffix(".srt")
    out_xml_path = out_mp4_path.with_suffix(".xml")

    generate_srt_file(caption_dicts, out_srt_path)
    generate_premiere_xml(video_path, caption_dicts, out_xml_path)

    duration = get_video_info(video_path)["duration"]
    render_ass_video(video_path, str(ass_path), out_mp4_path, duration)

@router.post("/render")
def trigger_render(req: RenderRequest):
    """
    Accepts JSON payload with video path, captions, and Essential Graphics styles, triggers background render.
    """
    path_obj = Path(req.video_path).resolve()
    if not path_obj.exists():
        raise HTTPException(status_code=404, detail=f"Source video path does not exist: '{req.video_path}'")

    reset_render_progress()
    caption_dicts = [c.dict() for c in req.captions]

    thread = threading.Thread(target=async_render_job, args=(str(path_obj), caption_dicts, req.style), daemon=True)
    thread.start()

    return {
        "status": "Started",
        "message": "Render task initiated successfully.",
        "video_path": str(path_obj)
    }

@router.get("/render_progress")
def render_progress():
    """
    Returns current GLOBAL_RENDER_PROGRESS state.
    """
    return get_render_progress()
