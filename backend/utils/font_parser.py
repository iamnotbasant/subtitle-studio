import os
import glob
from pathlib import Path
from fontTools.ttLib import TTFont
from config import CUSTOM_FONTS_DIR, SYSTEM_FONTS_DIR

FONT_METADATA_MAP = {}

def extract_font_names(file_path: Path):
    """
    Extracts true internal family name, full name, PostScript name,
    and style from a .ttf or .otf font file using fontTools.
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

        return {
            "family": family_name,
            "full_name": full_name,
            "postscript_name": postscript_name,
            "subfamily": subfamily,
            "file_name": file_path.name,
            "path": str(file_path.resolve())
        }
    except Exception as e:
        # Fallback if fontTools fails to parse specific table
        clean_name = file_path.stem.replace("-", " ").replace("_", " ").title()
        return {
            "family": clean_name,
            "full_name": clean_name,
            "postscript_name": file_path.stem,
            "subfamily": "Regular",
            "file_name": file_path.name,
            "path": str(file_path.resolve()),
            "error": str(e)
        }

def scan_and_register_font(file_path: str or Path):
    """
    Parses a single font file and registers it into global FONT_METADATA_MAP.
    """
    path_obj = Path(file_path)
    if not path_obj.exists() or path_obj.suffix.lower() not in (".ttf", ".otf"):
        return None
    
    metadata = extract_font_names(path_obj)
    if metadata:
        FONT_METADATA_MAP[metadata["family"]] = metadata
        FONT_METADATA_MAP[metadata["postscript_name"]] = metadata
        FONT_METADATA_MAP[path_obj.name] = metadata
    return metadata

def scan_google_drive_fonts(drive_fonts_dir: str = None):
    """
    Scans specified directory or custom fonts directory for downloadable Google Fonts.
    """
    target_dir = Path(drive_fonts_dir) if drive_fonts_dir else CUSTOM_FONTS_DIR
    registered = []
    if target_dir.exists():
        for font_file in target_dir.glob("*.[tT][tT][fF]"):
            meta = scan_and_register_font(font_file)
            if meta:
                registered.append(meta)
        for font_file in target_dir.glob("*.[oO][tT][fF]"):
            meta = scan_and_register_font(font_file)
            if meta:
                registered.append(meta)
    return registered

def scan_all_available_fonts():
    """
    Scans both custom uploaded fonts directory and system font directories.
    """
    scan_google_drive_fonts(CUSTOM_FONTS_DIR)
    
    # Optional scan for system fonts
    if SYSTEM_FONTS_DIR.exists():
        for font_file in SYSTEM_FONTS_DIR.glob("**/*.[tT][tT][fF]"):
            try:
                meta = extract_font_names(font_file)
                if meta and meta["family"] not in FONT_METADATA_MAP:
                    FONT_METADATA_MAP[meta["family"]] = meta
            except Exception:
                continue

    return list({v["family"]: v for v in FONT_METADATA_MAP.values()}.values())
