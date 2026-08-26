import os
import sys
import threading
from pathlib import Path

APP_VERSION = "8.2.0"

# Environment detection
IS_COLAB = "google.colab" in sys.modules

# Base Paths
BASE_DIR = Path(__file__).resolve().parent
TEMP_DIR = BASE_DIR / "temp"
CUSTOM_FONTS_DIR = BASE_DIR / "fonts" / "custom"
SYSTEM_FONTS_DIR = Path("/usr/share/fonts") if not sys.platform.startswith("win") else Path(os.environ.get("WINDIR", "C:\\Windows")) / "Fonts"
OUTPUT_DIR = BASE_DIR / "exports"

# Ensure essential workspace directories exist
TEMP_DIR.mkdir(parents=True, exist_ok=True)
CUSTOM_FONTS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Global Render Progress State & Thread Lock
_progress_lock = threading.Lock()
GLOBAL_RENDER_PROGRESS = {
    "job_id": None,
    "percent": 0.0,
    "status": "Ready",
    "stage": "Idle",
    "current_frame": 0,
    "total_frames": 0,
    "speed": "0x",
    "eta": "0s",
    "error": None
}

def update_render_progress(job_id=None, percent=None, status=None, stage=None, current_frame=None, total_frames=None, speed=None, eta=None, error=None):
    with _progress_lock:
        if job_id is not None:
            GLOBAL_RENDER_PROGRESS["job_id"] = str(job_id)
        if percent is not None:
            GLOBAL_RENDER_PROGRESS["percent"] = round(float(percent), 2)
        if status is not None:
            GLOBAL_RENDER_PROGRESS["status"] = str(status)
        if stage is not None:
            GLOBAL_RENDER_PROGRESS["stage"] = str(stage)
        if current_frame is not None:
            GLOBAL_RENDER_PROGRESS["current_frame"] = int(current_frame)
        if total_frames is not None:
            GLOBAL_RENDER_PROGRESS["total_frames"] = int(total_frames)
        if speed is not None:
            GLOBAL_RENDER_PROGRESS["speed"] = str(speed)
        if eta is not None:
            GLOBAL_RENDER_PROGRESS["eta"] = str(eta)
        if error is not None:
            GLOBAL_RENDER_PROGRESS["error"] = str(error)

def get_render_progress():
    with _progress_lock:
        return dict(GLOBAL_RENDER_PROGRESS)

def reset_render_progress(job_id=None):
    with _progress_lock:
        GLOBAL_RENDER_PROGRESS["job_id"] = str(job_id) if job_id else None
        GLOBAL_RENDER_PROGRESS["percent"] = 0.0
        GLOBAL_RENDER_PROGRESS["status"] = "Initializing render pipeline..."
        GLOBAL_RENDER_PROGRESS["stage"] = "Initializing"
        GLOBAL_RENDER_PROGRESS["current_frame"] = 0
        GLOBAL_RENDER_PROGRESS["total_frames"] = 0
        GLOBAL_RENDER_PROGRESS["speed"] = "0x"
        GLOBAL_RENDER_PROGRESS["eta"] = "Calculating..."
        GLOBAL_RENDER_PROGRESS["error"] = None
