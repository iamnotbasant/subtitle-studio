import os
import sys
import time
import socket
import subprocess
import threading
import urllib.request
from urllib.error import HTTPError, URLError
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

def download_font_with_fallback(filename: str, urls: list, target_path: Path):
    """
    Downloads font file using user-agent headers and multi-URL fallback mechanism without throwing 404 exceptions.
    """
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    
    for url in urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    content = response.read()
                    if len(content) > 1000:  # Ensure valid non-empty font binary
                        with open(target_path, "wb") as f:
                            f.write(content)
                        print(f" Successfully downloaded font: {filename}")
                        return True
        except (HTTPError, URLError, Exception):
            continue
            
    print(f" Warning: Could not download {filename} from remote sources. Falling back to system fonts.")
    return False

def ensure_essential_fonts():
    """
    Ensures essential fonts (Montserrat, Poppins, Inter, Oswald, Roboto) exist in custom fonts directory or system fonts.
    """
    print("Verifying essential fonts (Montserrat, Poppins, Inter, Oswald, Roboto)...")
    
    essential_fonts_urls = {
        "Montserrat-Bold.ttf": [
            "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat-Bold.ttf",
            "https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-Bold.ttf"
        ],
        "Poppins-Bold.ttf": [
            "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf",
            "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf"
        ],
        "Inter-Bold.ttf": [
            "https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/Inter-Bold.otf",
            "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter-Bold.ttf"
        ],
        "Oswald-Bold.ttf": [
            "https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/static/Oswald-Bold.ttf",
            "https://github.com/google/fonts/raw/main/ofl/oswald/static/Oswald-Bold.ttf"
        ],
        "Roboto-Bold.ttf": [
            "https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/static/Roboto-Bold.ttf",
            "https://github.com/google/fonts/raw/main/ofl/roboto/static/Roboto-Bold.ttf"
        ]
    }
    
    for filename, urls in essential_fonts_urls.items():
        font_path = CUSTOM_FONTS_DIR / filename
        if not font_path.exists():
            download_font_with_fallback(filename, urls, font_path)

    # Register all system & custom fonts into database
    fonts = scan_all_available_fonts()
    print(f"Registered {len(fonts)} font families in Subtitle Studio font database.")

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

            # Sanitize trailing slashes to prevent '.devfrontend/index.html' malformed URLs
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
    print(f"🎬 Premiere Properties Subtitle Studio (v{APP_VERSION})")
    if colab_link:
        print("🚀 Running inside Google Colab Environment!")
        print(f"✨ PUBLIC COLAB STUDIO LINK: {colab_link}")
    else:
        print("🖥️  Running on Local Machine!")
        print("✨ LOCAL STUDIO LINK: http://localhost:8000/frontend/index.html")
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
