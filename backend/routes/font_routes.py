import os
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from config import CUSTOM_FONTS_DIR
from backend.utils.font_parser import scan_and_register_font, scan_all_available_fonts

router = APIRouter()

@router.post("/upload_font")
async def upload_font(file: UploadFile = File(...)):
    """
    Handles custom .ttf/.otf font upload, saves in custom fonts dir, updates fc-cache if on Linux.
    """
    filename = file.filename
    ext = Path(filename).suffix.lower()
    if ext not in (".ttf", ".otf"):
        raise HTTPException(status_code=400, detail="Only .ttf and .otf font files are supported.")

    target_path = CUSTOM_FONTS_DIR / filename
    try:
        content = await file.read()
        with open(target_path, "wb") as f:
            f.write(content)

        # Update fc-cache if running on Linux/Colab
        if not os.name == "nt":
            try:
                subprocess.run(["fc-cache", "-f", "-v", str(CUSTOM_FONTS_DIR)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            except Exception:
                pass

        metadata = scan_and_register_font(target_path)
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
    Serves font files with exact MIME type (font/ttf or font/otf).
    """
    font_path = CUSTOM_FONTS_DIR / filename
    if not font_path.exists():
        raise HTTPException(status_code=404, detail="Font file not found")
    
    ext = font_path.suffix.lower()
    mime_type = "font/ttf" if ext == ".ttf" else "font/otf"
    return FileResponse(str(font_path), media_type=mime_type)

@router.get("/list_fonts")
def list_fonts():
    """
    Returns list of all scanned and registered fonts.
    """
    fonts = scan_all_available_fonts()
    return {
        "count": len(fonts),
        "fonts": fonts
    }
