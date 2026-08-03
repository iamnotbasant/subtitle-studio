import os
import sys
import time
import socket
import subprocess
import threading
import urllib.request
from pathlib import Path
import uvicorn

from config import APP_VERSION, IS_COLAB, CUSTOM_FONTS_DIR, BASE_DIR
from backend.utils.font_parser import scan_all_available_fonts

def kill_port_8000():
    """
    Terminates any process occupying port 8000 across platforms (Linux, macOS, Windows).
    """
    print("Checking port 8000 availability...")
    if os.name != "nt":
        # Linux / Colab / macOS
        try:
            subprocess.run("fuser -k -9 8000/tcp", shell=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
        except Exception:
            pass
        try:
            subprocess.run("lsof -ti:8000 | xargs kill -9", shell=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
        except Exception:
            pass
    else:
        # Windows
        try:
            res = subprocess.run("netstat -ano | findstr :8000", shell=True, capture_output=True, text=True)
            for line in res.stdout.splitlines():
                parts = line.strip().split()
                if len(parts) >= 5 and "LISTENING" in parts:
                    pid = parts[-1]
                    subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
        except Exception:
            pass
    time.sleep(1.0)

def ensure_essential_fonts():
    """
    Ensures essential default fonts (e.g. Montserrat, Poppins) exist in custom fonts directory.
    """
    print("Verifying essential fonts availability...")
    essential_fonts = {
        "Montserrat-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-Bold.ttf",
        "Poppins-Bold.ttf": "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf"
    }
    
    for filename, url in essential_fonts.items():
        font_path = CUSTOM_FONTS_DIR / filename
        if not font_path.exists():
            try:
                print(f"Downloading essential font: {filename}...")
                urllib.request.urlretrieve(url, font_path)
            except Exception as e:
                print(f"Could not download {filename}: {e}")

    # Register all system & custom fonts
    fonts = scan_all_available_fonts()
    print(f"Registered {len(fonts)} unique font families into Subtitle Studio font database.")

def launch_colab_proxy():
    """
    Exposes Uvicorn server port via Google Colab proxy kernel helper.
    """
    if IS_COLAB:
        try:
            from google.colab import kernel
            print("\n" + "="*70)
            print("🚀 Running inside Google Colab environment!")
            proxy_url = kernel.proxyPort(8000)
            print(f"🔗 Premiere Properties Subtitle Studio URL: {proxy_url}")
            print("="*70 + "\n")
        except Exception as e:
            print(f"Could not expose Colab proxy port: {e}")

def run_uvicorn_server():
    """
    Runs the Uvicorn FastAPI server on host 0.0.0.0 and port 8000.
    """
    # Import app string dynamically for reload compatibility
    sys.path.insert(0, str(BASE_DIR))
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=False, log_level="info")

if __name__ == "__main__":
    print(f"Starting Premiere Properties Subtitle Studio (v{APP_VERSION})...")
    kill_port_8000()
    ensure_essential_fonts()
    launch_colab_proxy()

    # Launch server
    server_thread = threading.Thread(target=run_uvicorn_server, daemon=True)
    server_thread.start()

    print("\n" + "*"*60)
    print("✨ Subtitle Studio Server is now active on http://localhost:8000/frontend/index.html")
    print("*"*60 + "\n")

    try:
        while server_thread.is_alive():
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\nShutting down Subtitle Studio server...")
