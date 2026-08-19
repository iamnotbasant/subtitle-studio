import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from config import CUSTOM_FONTS_DIR
from backend.utils.font_parser import scan_and_register_font, scan_all_available_fonts, setup_colab_linux_fontconfig

router = APIRouter()

@router.post("/upload_font")
async def upload_font(file: UploadFile = File(...)):
    """
    Handles custom .ttf/.otf font upload, saves in custom fonts dir, registers metadata,
    and updates fontconfig cache if on Linux / Google Colab.
    """
    filename = file.filename
    ext = Path(filename).suffix.lower()
    if ext not in (".ttf", ".otf", ".woff", ".woff2"):
        raise HTTPException(status_code=400, detail="Only .ttf, .otf font files are supported.")

    CUSTOM_FONTS_DIR.mkdir(parents=True, exist_ok=True)
    target_path = CUSTOM_FONTS_DIR / filename
    try:
        content = await file.read()
        with open(target_path, "wb") as f:
            f.write(content)

        # Parse & Register font in metadata cache
        metadata = scan_and_register_font(target_path)

        # Sync with Linux/Colab fontconfig
        setup_colab_linux_fontconfig()

        return {
            "success": True,
            "message": f"Font '{filename}' registered successfully.",
            "font_metadata": metadata
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Font upload failed: {str(e)}")

@router.get("/custom_fonts/{filename}")
def get_custom_font(filename: str):
    """
    Serves font files with exact MIME type (font/ttf, font/otf, font/woff2) and caching headers.
    """
    font_path = CUSTOM_FONTS_DIR / filename
    if not font_path.exists():
        raise HTTPException(status_code=404, detail=f"Font file '{filename}' not found.")
    
    ext = font_path.suffix.lower()
    if ext == ".ttf":
        mime_type = "font/ttf"
    elif ext == ".otf":
        mime_type = "font/otf"
    elif ext == ".woff2":
        mime_type = "font/woff2"
    else:
        mime_type = "application/octet-stream"

    headers = {
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*"
    }
    return FileResponse(str(font_path), media_type=mime_type, headers=headers)

@router.get("/list_fonts")
def list_fonts():
    """
    Returns list of all scanned and registered fonts categorized into custom and essential creator fonts.
    """
    all_fonts = scan_all_available_fonts()
    custom_fonts = [f for f in all_fonts if f.get("is_custom", False)]
    essential_fonts = [f for f in all_fonts if not f.get("is_custom", False)]

    return {
        "count": len(all_fonts),
        "custom_count": len(custom_fonts),
        "essential_count": len(essential_fonts),
        "custom_fonts": custom_fonts,
        "essential_fonts": essential_fonts,
        "fonts": all_fonts
    }
