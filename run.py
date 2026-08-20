import os
import sys
import time
import socket
import subprocess
import threading
from pathlib import Path
import uvicorn

# Ensure UTF-8 output encoding on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from config import APP_VERSION, IS_COLAB, CUSTOM_FONTS_DIR, BASE_DIR
from backend.utils.font_parser import ensure_essential_fonts, scan_all_available_fonts

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
    time.sleep(0.8)

def get_colab_proxy_url():
    """
    Detects Google Colab environment and evaluates kernel proxy port to construct sanitized public URL.
    """
    if IS_COLAB or "google.colab" in sys.modules:
        try:
            from google.colab import output, kernel
            try:
                raw_url = output.eval_js('google.colab.kernel.proxyPort(8000)')
            except Exception:
                raw_url = kernel.proxyPort(8000)

            url_str = str(raw_url).strip()
            if not url_str.startswith("http"):
                url_str = f"https://{url_str}"

            clean_base_url = url_str.rstrip('/')
            return f"{clean_base_url}/frontend/index.html"
        except Exception as e:
            print(f"Note: Colab proxy URL generation error: {e}")
            return None
    return None

def print_startup_banner():
    """
    Prints high-visibility clickable startup link banner BEFORE server initialization.
    """
    colab_link = get_colab_proxy_url()
    
    print("\n" + "="*75)
    print(f"[*] Subtitle Studio Pro (v{APP_VERSION}) - Minimal Dark Edition")
    if colab_link:
        print("[!] Running inside Google Colab Environment")
        print(f"[>] PUBLIC COLAB STUDIO LINK: {colab_link}")
    else:
        print("[!] Running on Local Machine")
        print(" -> LOCAL STUDIO LINK: http://localhost:8000/frontend/index.html")
    print("="*75 + "\n")

def run_uvicorn_server():
    """
    Launches Uvicorn FastAPI server on host 0.0.0.0 and port 8000.
    """
    sys.path.insert(0, str(BASE_DIR))
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=False, log_level="info")

if __name__ == "__main__":
    kill_port_8000()
    ensure_essential_fonts()
    
    # Print clickable URL banner BEFORE server launch for non-blocking log visibility
    print_startup_banner()

    # Launch daemon Uvicorn server thread
    server_thread = threading.Thread(target=run_uvicorn_server, daemon=True)
    server_thread.start()

    try:
        while server_thread.is_alive():
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\nShutting down Subtitle Studio server...")
