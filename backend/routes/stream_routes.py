import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
import gdown

from config import TEMP_DIR, OUTPUT_DIR, BASE_DIR
from backend.utils.ffmpeg_engine import get_video_duration_secs, get_video_info, check_has_audio

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
        video_extensions = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".flv", ".m4v", ".wmv"}
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
    Lists subdirectories, video files, and subtitle files for folder browser and quick-select modals.
    Returns bookmarks, video metadata, and auto-pairing helpers.
    """
    video_extensions = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".flv", ".m4v", ".wmv", ".ts", ".3gp"}
    srt_extensions = {".srt", ".vtt", ".ass"}
    
    if folder_path and folder_path.strip():
        curr_dir = Path(folder_path.strip()).resolve()
    else:
        # Default to /content on Colab or current working directory
        colab_content = Path("/content")
        curr_dir = colab_content if colab_content.exists() else Path.cwd()

    if not curr_dir.exists() or not curr_dir.is_dir():
        curr_dir = curr_dir.parent if curr_dir.parent.exists() else Path.cwd()

    parent_dir = str(curr_dir.parent.resolve()) if curr_dir.parent != curr_dir else None

    # Detect Available Quick Bookmarks
    bookmarks = []
    colab_root = Path("/content")
    if colab_root.exists():
        bookmarks.append({"label": "Colab Root (/content)", "path": str(colab_root.resolve()), "icon": "colab"})
    
    gdrive_mydrive = Path("/content/drive/MyDrive")
    if gdrive_mydrive.exists():
        bookmarks.append({"label": "Google Drive (MyDrive)", "path": str(gdrive_mydrive.resolve()), "icon": "drive"})
    elif Path("/content/drive").exists():
        bookmarks.append({"label": "Google Drive", "path": "/content/drive", "icon": "drive"})

    if OUTPUT_DIR.exists():
        bookmarks.append({"label": "App Exports", "path": str(OUTPUT_DIR.resolve()), "icon": "exports"})

    bookmarks.append({"label": "Working Directory", "path": str(Path.cwd().resolve()), "icon": "folder"})

    subdirs = []
    video_files = []
    srt_files = []

    try:
        for entry in sorted(curr_dir.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            if entry.name.startswith(".") or entry.name in ("__pycache__", "node_modules", "temp", ".git"):
                continue
            if entry.is_dir():
                # Count videos in subdirectory
                vid_count = 0
                try:
                    vid_count = len([f for f in entry.glob("*") if f.is_file() and f.suffix.lower() in video_extensions])
                except Exception:
                    pass

                subdirs.append({
                    "name": entry.name,
                    "path": str(entry.resolve()),
                    "is_dir": True,
                    "video_count": vid_count
                })
            elif entry.is_file():
                ext = entry.suffix.lower()
                if ext in video_extensions:
                    try:
                        stat = entry.stat()
                        size_mb = round(stat.st_size / (1024 * 1024), 2)
                        
                        # Check if matching SRT exists in this directory
                        has_matching_srt = (curr_dir / f"{entry.stem}.srt").exists() or (curr_dir / f"{entry.stem}.vtt").exists()

                        video_obj = {
                            "name": entry.name,
                            "path": str(entry.resolve()),
                            "size_mb": size_mb,
                            "stem": entry.stem,
                            "ext": ext,
                            "is_dir": False,
                            "has_matching_srt": has_matching_srt,
                            "modified_at": int(stat.st_mtime)
                        }
                        video_files.append(video_obj)
                    except Exception:
                        pass
                elif ext in srt_extensions:
                    try:
                        stat = entry.stat()
                        size_kb = round(stat.st_size / 1024, 1)
                        srt_files.append({
                            "name": entry.name,
                            "path": str(entry.resolve()),
                            "size_kb": size_kb,
                            "stem": entry.stem,
                            "ext": ext,
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
            "bookmarks": bookmarks,
            "subdirs": [],
            "video_files": [],
            "videos": [],
            "srt_files": []
        }

    return {
        "success": True,
        "current_dir": str(curr_dir),
        "parent_dir": parent_dir,
        "bookmarks": bookmarks,
        "subdirs": subdirs,
        "video_files": video_files,
        "videos": video_files, # Backward compatibility alias!
        "srt_files": srt_files
    }

@router.post("/upload_media")
async def upload_media_file(file: UploadFile = File(...)):
    """
    Accepts multipart media file upload and saves to local server directory.
    Enables direct browser uploads to Google Colab and remote servers.
    """
    upload_dir = TEMP_DIR / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    clean_filename = Path(file.filename).name
    save_path = upload_dir / clean_filename

    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        stat = save_path.stat()
        size_mb = round(stat.st_size / (1024 * 1024), 2)
        ext = save_path.suffix.lower()
        is_video = ext in {".mp4", ".mov", ".mkv", ".avi", ".webm", ".flv", ".m4v", ".wmv"}
        is_srt = ext in {".srt", ".vtt", ".ass"}

        return {
            "success": True,
            "saved_path": str(save_path.resolve()),
            "filename": clean_filename,
            "size_mb": size_mb,
            "is_video": is_video,
            "is_srt": is_srt
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

import hashlib
from fastapi import Request
from fastapi.responses import StreamingResponse, Response

def range_stream_response(file_path: Path, request: Request, media_type: str = "video/mp4") -> Response:
    """
    Serves video with full HTTP 206 Partial Content Range request support.
    Enables instant seeking, 0-stutter timeline scrubbing, and cross-browser HTML5 video compatibility.
    """
    clean_path = Path(file_path).resolve()
    if not clean_path.exists() or not clean_path.is_file():
        raise HTTPException(status_code=404, detail="Video file not found")

    file_size = clean_path.stat().st_size
    range_header = request.headers.get("range")

    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600"
    }

    if range_header and range_header.startswith("bytes="):
        range_val = range_header.replace("bytes=", "").strip()
        parts = range_val.split("-")
        start_str = parts[0]
        end_str = parts[1] if len(parts) > 1 else ""

        try:
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
        except ValueError:
            start = 0
            end = file_size - 1

        if start >= file_size:
            return Response(
                status_code=416,
                headers={"Content-Range": f"bytes */{file_size}"}
            )

        end = min(end, file_size - 1)
        content_length = (end - start) + 1

        def chunk_generator():
            chunk_size = 256 * 1024  # 256 KB chunks
            with open(clean_path, "rb") as f:
                f.seek(start)
                bytes_left = content_length
                while bytes_left > 0:
                    read_len = min(chunk_size, bytes_left)
                    data = f.read(read_len)
                    if not data:
                        break
                    bytes_left -= len(data)
                    yield data

        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        headers["Content-Length"] = str(content_length)

        return StreamingResponse(
            chunk_generator(),
            status_code=206,
            headers=headers,
            media_type=media_type
        )

    # Full file stream response
    def full_generator():
        chunk_size = 256 * 1024
        with open(clean_path, "rb") as f:
            while chunk := f.read(chunk_size):
                yield chunk

    headers["Content-Length"] = str(file_size)
    return StreamingResponse(
        full_generator(),
        status_code=200,
        headers=headers,
        media_type=media_type
    )

@router.get("/stream")
def stream_video(request: Request, video_path: str = Query(...), quality: str = Query("480p")):
    """
    Generates/serves an adaptive H.264 YUV420p web proxy for 0-lag browser HTML5 playback with HTTP 206 seeking.
    Supports adjustable preview qualities: full (original), 720p, 480p (fast), 360p (ultra-fast).
    """
    source_path = Path(video_path).resolve()
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"Source video file not found: '{video_path}'")

    qual = (quality or "480p").lower().strip()
    ext = source_path.suffix.lower()
    is_mp4 = ext in (".mp4", ".m4v")

    # If full quality requested and file is standard MP4, stream directly with zero transcoding lag
    if qual in ("full", "original", "1080p") and is_mp4:
        return range_stream_response(source_path, request, media_type="video/mp4")

    # Unique proxy filename based on path hash and mtime to avoid collisions
    path_hash = hashlib.md5(f"{str(source_path)}_{source_path.stat().st_mtime}".encode()).hexdigest()[:8]
    proxy_filename = f"web_proxy_{qual}_{path_hash}_{source_path.stem}.mp4"
    proxy_path = TEMP_DIR / proxy_filename

    # Scale filters per selected preview quality
    scale_filter = "scale=-2:480"
    crf_val = "26"
    if qual == "720p":
        scale_filter = "scale=-2:720"
        crf_val = "23"
    elif qual == "360p":
        scale_filter = "scale=-2:360"
        crf_val = "28"

    # Check audio presence to avoid FFmpeg AAC encode failure on silent videos
    audio_info = check_has_audio(str(source_path))
    audio_args = ["-c:a", "aac", "-b:a", "96k"] if audio_info.get("has_audio") else ["-an"]

    # If proxy doesn't exist or is older, generate fast web-optimized proxy
    if not proxy_path.exists() or proxy_path.stat().st_size == 0 or proxy_path.stat().st_mtime < source_path.stat().st_mtime:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(source_path),
            "-vf", scale_filter,
            "-c:v", "libx264", "-preset", "ultrafast", "-tune", "fastdecode", "-crf", crf_val, "-pix_fmt", "yuv420p",
            "-threads", "0",
            "-movflags", "+faststart"
        ] + audio_args + [str(proxy_path.resolve())]
        try:
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        except Exception:
            # Fall back to serving direct file if proxy generation fails
            if is_mp4:
                return range_stream_response(source_path, request, media_type="video/mp4")
            raise HTTPException(status_code=500, detail="Failed to transcode video stream proxy.")

    return range_stream_response(proxy_path, request, media_type="video/mp4")

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
