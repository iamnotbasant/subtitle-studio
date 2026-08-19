import os
import sys
import glob
import shutil
import subprocess
import urllib.request
from urllib.error import HTTPError, URLError
from pathlib import Path
from fontTools.ttLib import TTFont
from config import CUSTOM_FONTS_DIR, SYSTEM_FONTS_DIR

FONT_METADATA_MAP = {}

# Verified high-speed remote CDN/raw sources for essential creator fonts
ESSENTIAL_FONTS_MAP = {
    "Montserrat-Variable.ttf": [
        "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf",
        "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/montserrat/Montserrat%5Bwght%5D.ttf"
    ],
    "Poppins-Bold.ttf": [
        "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf",
        "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/poppins/Poppins-Bold.ttf"
    ],
    "Poppins-Regular.ttf": [
        "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Regular.ttf",
        "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/poppins/Poppins-Regular.ttf"
    ],
    "Inter-Variable.ttf": [
        "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf",
        "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf"
    ],
    "Oswald-Variable.ttf": [
        "https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf",
        "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/oswald/Oswald%5Bwght%5D.ttf"
    ],
    "BebasNeue-Regular.ttf": [
        "https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf",
        "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/bebasneue/BebasNeue-Regular.ttf"
    ],
    "Anton-Regular.ttf": [
        "https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
        "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/anton/Anton-Regular.ttf"
    ],
    "LeagueGothic-Variable.ttf": [
        "https://raw.githubusercontent.com/google/fonts/main/ofl/leaguegothic/LeagueGothic%5Bwdth%5D.ttf",
        "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/leaguegothic/LeagueGothic%5Bwdth%5D.ttf"
    ],
    "Questrial-Regular.ttf": [
        "https://raw.githubusercontent.com/google/fonts/main/ofl/questrial/Questrial-Regular.ttf",
        "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/questrial/Questrial-Regular.ttf"
    ],
    "Roboto-Bold.ttf": [
        "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Bold.ttf",
        "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Bold.ttf"
    ],
    "Roboto-Regular.ttf": [
        "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Regular.ttf",
        "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf"
    ]
}

def download_font_with_fallback(filename: str, urls: list, target_path: Path) -> bool:
    """
    Downloads font file using modern user-agent headers and multi-URL fallback mechanism.
    """
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    for url in urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=12) as response:
                if response.status == 200:
                    content = response.read()
                    if len(content) > 1000:
                        with open(target_path, "wb") as f:
                            f.write(content)
                        print(f"[OK] Downloaded essential font: {filename}")
                        return True
        except (HTTPError, URLError, Exception):
            continue
    print(f"[Warning] Could not download {filename} from remote sources.")
    return False

def setup_colab_linux_fontconfig():
    """
    On Linux and Google Colab, registers CUSTOM_FONTS_DIR with Fontconfig
    by copying fonts into standard font directories (~/.fonts, ~/.local/share/fonts)
    and refreshing the system font cache (fc-cache -f).
    """
    if os.name == "nt":
        return

    try:
        home_fonts = Path.home() / ".fonts"
        local_fonts = Path.home() / ".local" / "share" / "fonts"
        home_fonts.mkdir(parents=True, exist_ok=True)
        local_fonts.mkdir(parents=True, exist_ok=True)

        # Copy/symlink all custom and essential fonts into fontconfig search paths
        if CUSTOM_FONTS_DIR.exists():
            for font_file in CUSTOM_FONTS_DIR.glob("*.*"):
                if font_file.suffix.lower() in (".ttf", ".otf"):
                    dest1 = home_fonts / font_file.name
                    dest2 = local_fonts / font_file.name
                    if not dest1.exists():
                        try:
                            shutil.copy2(font_file, dest1)
                        except Exception:
                            pass
                    if not dest2.exists():
                        try:
                            shutil.copy2(font_file, dest2)
                        except Exception:
                            pass

        # Refresh fc-cache
        subprocess.run(["fc-cache", "-f", str(home_fonts), str(local_fonts), str(CUSTOM_FONTS_DIR)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        print("[OK] Registered custom fonts with Linux Fontconfig / fc-cache.")
    except Exception as e:
        print(f"Note: Fontconfig registration notice: {e}")

def ensure_essential_fonts():
    """
    Ensures all essential creator fonts (Montserrat, Poppins, Inter, Oswald, Roboto, Bebas Neue, Anton, Questrial)
    exist in the custom fonts directory and are registered.
    """
    CUSTOM_FONTS_DIR.mkdir(parents=True, exist_ok=True)
    
    for filename, urls in ESSENTIAL_FONTS_MAP.items():
        font_path = CUSTOM_FONTS_DIR / filename
        if not font_path.exists() or font_path.stat().st_size < 1000:
            download_font_with_fallback(filename, urls, font_path)

    # Sync with Linux/Colab fontconfig if on Linux
    setup_colab_linux_fontconfig()

    # Scan & register all fonts
    fonts = scan_all_available_fonts()
    print(f"[OK] Registered {len(fonts)} font families in Subtitle Studio font engine.")

def extract_font_names(file_path: Path):
    """
    Extracts true internal family name, full name, PostScript name,
    and subfamily style from a .ttf or .otf font file using fontTools.
    """
    try:
        font = TTFont(file_path, fontNumber=0)
        names = {}
        for record in font["name"].names:
            # Name IDs: 1 = Family, 2 = Subfamily, 4 = Full Name, 6 = PostScript Name, 16 = Preferred Family
            name_id = record.nameID
            if name_id in (1, 2, 4, 6, 16):
                try:
                    string_val = record.toUnicode()
                except Exception:
                    string_val = record.string.decode("latin1", errors="ignore")
                names[name_id] = string_val.strip()

        family_name = names.get(16) or names.get(1) or file_path.stem
        full_name = names.get(4) or family_name
        postscript_name = names.get(6) or file_path.stem
        subfamily = names.get(2) or "Regular"
        
        font.close()

        is_essential = file_path.name in ESSENTIAL_FONTS_MAP

        return {
            "family": family_name,
            "full_name": full_name,
            "postscript_name": postscript_name,
            "subfamily": subfamily,
            "file_name": file_path.name,
            "path": str(file_path.resolve()),
            "is_custom": not is_essential
        }
    except Exception as e:
        clean_name = file_path.stem.replace("-", " ").replace("_", " ").title()
        is_essential = file_path.name in ESSENTIAL_FONTS_MAP
        return {
            "family": clean_name,
            "full_name": clean_name,
            "postscript_name": file_path.stem,
            "subfamily": "Regular",
            "file_name": file_path.name,
            "path": str(file_path.resolve()),
            "is_custom": not is_essential,
            "error": str(e)
        }

def scan_and_register_font(file_path: str or Path):
    """
    Parses a single font file and registers all its name variants into FONT_METADATA_MAP.
    """
    path_obj = Path(file_path)
    if not path_obj.exists() or path_obj.suffix.lower() not in (".ttf", ".otf"):
        return None
    
    metadata = extract_font_names(path_obj)
    if metadata:
        family = metadata["family"]
        postscript = metadata["postscript_name"]
        full_name = metadata["full_name"]
        file_name = path_obj.name
        clean_stem = path_obj.stem.replace("-", " ").replace("_", " ").title()

        FONT_METADATA_MAP[family] = metadata
        FONT_METADATA_MAP[family.lower()] = metadata
        FONT_METADATA_MAP[postscript] = metadata
        FONT_METADATA_MAP[postscript.lower()] = metadata
        FONT_METADATA_MAP[full_name] = metadata
        FONT_METADATA_MAP[full_name.lower()] = metadata
        FONT_METADATA_MAP[file_name] = metadata
        FONT_METADATA_MAP[clean_stem] = metadata
        FONT_METADATA_MAP[clean_stem.lower()] = metadata
    return metadata

def resolve_ass_font_name(font_family_input: str) -> str:
    """
    Resolves the exact font family or PostScript name to write in the ASS subtitle script.
    Guarantees matching between what the user selected in UI and what libass / FFmpeg expects.
    """
    if not font_family_input:
        return "Poppins"

    clean_input = font_family_input.strip().strip("'\"")
    
    # 1. Exact or case-insensitive match in registered map
    if clean_input in FONT_METADATA_MAP:
        meta = FONT_METADATA_MAP[clean_input]
        return meta.get("family") or meta.get("postscript_name") or clean_input

    lower_input = clean_input.lower()
    if lower_input in FONT_METADATA_MAP:
        meta = FONT_METADATA_MAP[lower_input]
        return meta.get("family") or meta.get("postscript_name") or clean_input

    # 2. Check for Century Gothic mapping (Colab/Linux fallback to Questrial / Poppins)
    if lower_input in ("century gothic", "centurygothic"):
        if "Century Gothic" in FONT_METADATA_MAP:
            return "Century Gothic"
        # If running on Linux/Colab where Century Gothic isn't installed, use Questrial or Poppins
        if "Questrial" in FONT_METADATA_MAP:
            return "Questrial"
        if "Poppins" in FONT_METADATA_MAP:
            return "Poppins"

    # 3. Check for partial matching in custom fonts
    for key, meta in FONT_METADATA_MAP.items():
        if lower_input in key.lower() or key.lower() in lower_input:
            return meta.get("family") or meta.get("postscript_name") or clean_input

    return clean_input

def scan_all_available_fonts():
    """
    Scans custom fonts directory and registers essential/system fonts instantly.
    """
    # 1. Scan custom fonts directory (always fast & fresh)
    if CUSTOM_FONTS_DIR.exists():
        for font_file in CUSTOM_FONTS_DIR.iterdir():
            if font_file.is_file() and font_file.suffix.lower() in (".ttf", ".otf"):
                scan_and_register_font(font_file)

    # 2. Add standard known system fonts metadata if not already registered
    common_system_fonts = [
        {"family": "Arial", "full_name": "Arial Regular", "postscript_name": "ArialMT", "is_custom": False},
        {"family": "Century Gothic", "full_name": "Century Gothic", "postscript_name": "CenturyGothic", "is_custom": False}
    ]
    for sys_f in common_system_fonts:
        fam = sys_f["family"]
        if fam not in FONT_METADATA_MAP:
            FONT_METADATA_MAP[fam] = sys_f
            FONT_METADATA_MAP[fam.lower()] = sys_f
            FONT_METADATA_MAP[sys_f["postscript_name"]] = sys_f
            FONT_METADATA_MAP[sys_f["postscript_name"].lower()] = sys_f

    # Return unique fonts keyed by family name
    unique_fonts = {}
    for meta in FONT_METADATA_MAP.values():
        fam = meta.get("family")
        if fam and fam not in unique_fonts:
            unique_fonts[fam] = meta

    # Sort custom fonts first, then alphabetical
    font_list = list(unique_fonts.values())
    font_list.sort(key=lambda x: (not x.get("is_custom", False), x.get("family", "").lower()))
    return font_list
