import os
import subprocess
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
import gdown

from config import TEMP_DIR
from backend.utils.ffmpeg_engine import get_video_duration_secs, get_video_info

router = APIRouter()

class CheckVideoRequest(BaseModel):
    video_path: str

class DownloadDriveRequest(BaseModel):
    url_or_id: str
    output_filename: str = "downloaded_video.mp4"

@router.post("/check_video")
def check_video(req: CheckVideoRequest):
    """
    Validates file existence, file size, duration, and lists available video files in directory if missing.
    Handles spaces in file paths cleanly.
    """
    path_obj = Path(req.video_path).resolve()
    if not path_obj.exists():
        parent_dir = path_obj.parent if path_obj.parent.exists() else Path.cwd()
        video_extensions = {".mp4", ".mov", ".mkv", ".avi", ".webm"}
        available_files = [
            f.name for f in parent_dir.glob("*") if f.suffix.lower() in video_extensions
        ]
        return {
            "valid": False,
            "error": f"Video file not found: '{req.video_path}'",
            "search_directory": str(parent_dir),
            "available_files": available_files
        }

    try:
        size_bytes = path_obj.stat().st_size
        size_mb = round(size_bytes / (1024 * 1024), 2)
        info = get_video_info(str(path_obj))
        return {
            "valid": True,
            "path": str(path_obj),
            "filename": path_obj.name,
            "size_mb": size_mb,
            "duration": round(info["duration"], 2),
            "width": info["width"],
            "height": info["height"],
            "fps": round(info["fps"], 2)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to inspect video: {str(e)}")

@router.get("/browse_files")
def browse_files(folder_path: Optional[str] = None):
    """
    Lists subdirectories and video files for folder browser and quick-select dropdown.
    """
    video_extensions = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".flv", ".m4v", ".wmv"}
    
    if folder_path and folder_path.strip():
        curr_dir = Path(folder_path.strip()).resolve()
    else:
        # Default to /content on Colab or current working directory
        colab_content = Path("/content")
        curr_dir = colab_content if colab_content.exists() else Path.cwd()

    if not curr_dir.exists() or not curr_dir.is_dir():
        curr_dir = curr_dir.parent if curr_dir.parent.exists() else Path.cwd()

    parent_dir = str(curr_dir.parent.resolve()) if curr_dir.parent != curr_dir else None

    subdirs = []
    video_files = []

    try:
        for entry in sorted(curr_dir.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            if entry.name.startswith(".") or entry.name in ("__pycache__", "node_modules", "temp"):
                continue
            if entry.is_dir():
                subdirs.append({
                    "name": entry.name,
                    "path": str(entry.resolve()),
                    "is_dir": True
                })
            elif entry.is_file() and entry.suffix.lower() in video_extensions:
                try:
                    stat = entry.stat()
                    size_mb = round(stat.st_size / (1024 * 1024), 2)
                    video_files.append({
                        "name": entry.name,
                        "path": str(entry.resolve()),
                        "size_mb": size_mb,
                        "is_dir": False
                    })
                except Exception:
                    pass
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "current_dir": str(curr_dir),
            "parent_dir": parent_dir,
            "subdirs": [],
            "video_files": []
        }

    return {
        "success": True,
        "current_dir": str(curr_dir),
        "parent_dir": parent_dir,
        "subdirs": subdirs,
        "video_files": video_files
    }

@router.get("/stream")
def stream_video(video_path: str = Query(...), quality: str = Query("480p")):
    """
    Generates/serves an adaptive H.264 YUV420p web proxy for 0-lag browser HTML5 playback.
    Supports adjustable preview qualities: full (original), 720p, 480p (fast), 360p (ultra-fast).
    """
    source_path = Path(video_path).resolve()
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"Source video file not found: '{video_path}'")

    qual = (quality or "480p").lower().strip()
    if qual in ("full", "original", "1080p"):
        return FileResponse(
            str(source_path),
            media_type="video/mp4",
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600"
            }
        )

    # Scale filters per selected preview quality
    scale_filter = "scale=-2:480"
    crf_val = "26"
    if qual == "720p":
        scale_filter = "scale=-2:720"
        crf_val = "23"
    elif qual == "360p":
        scale_filter = "scale=-2:360"
        crf_val = "28"

    proxy_filename = f"web_proxy_{qual}_{source_path.stem}.mp4"
    proxy_path = TEMP_DIR / proxy_filename

    # If proxy doesn't exist or source file is newer, generate fast web-optimized proxy
    if not proxy_path.exists() or proxy_path.stat().st_mtime < source_path.stat().st_mtime:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(source_path),
            "-vf", scale_filter,
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", crf_val, "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "96k",
            str(proxy_path.resolve())
        ]
        try:
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        except Exception:
            # Fall back to serving direct file if proxy generation fails
            return FileResponse(
                str(source_path),
                media_type="video/mp4",
                headers={
                    "Accept-Ranges": "bytes",
                    "Cache-Control": "public, max-age=3600"
                }
            )

    return FileResponse(
        str(proxy_path.resolve()),
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600"
        }
    )

@router.post("/download_drive_link")
def download_drive_link(req: DownloadDriveRequest):
    """
    Downloads video directly from Google Drive links/IDs using gdown with universal URL parsing.
    """
    import re
    try:
        output_path = TEMP_DIR / req.output_filename
        url = req.url_or_id.strip()
        
        # Universal regex to extract Google Drive file ID (25+ alphanumeric/hyphen/underscore chars)
        if "drive.google.com" in url:
            match = re.search(r'[-\w]{25,}', url)
            if match:
                file_id = match.group(0)
                gdown_target = f"https://drive.google.com/uc?id={file_id}"
            else:
                gdown_target = url
        else:
            gdown_target = url

        res = gdown.download(gdown_target, str(output_path.resolve()), quiet=False, fuzzy=True)
        if not res or not output_path.exists():
            raise Exception("Failed to download video from Google Drive link. Please ensure the link is set to 'Anyone with the link can view'.")

        info = get_video_info(str(output_path.resolve()))
        return {
            "success": True,
            "saved_path": str(output_path.resolve()),
            "filename": output_path.name,
            "duration": round(info["duration"], 2)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Google Drive download failed: {str(e)}")
