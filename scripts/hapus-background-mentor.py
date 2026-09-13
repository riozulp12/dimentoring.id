"""
Hapus background foto mentor secara otomatis pakai rembg.

Baca semua foto di public/mentors/, hapus background, simpan sebagai
PNG (nama sama, ekstensi .png), timpa file lama.

Cara pakai:
    pip install rembg onnxruntime --break-system-packages
    python scripts/hapus-background-mentor.py
"""

import sys
from pathlib import Path

from PIL import Image
from rembg import new_session, remove

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
MENTOR_DIR = PROJECT_ROOT / "public" / "mentors"

VALID_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

# Pinned explicitly: rembg's default model (bria-rmbg-2.0 as of rembg 2.0.84)
# is licensed for non-commercial use only. isnet-general-use is permissively
# licensed and safe for this commercial site.
MODEL_NAME = "isnet-general-use"


def find_mentor_photos(folder: Path) -> list[Path]:
    if not folder.is_dir():
        raise FileNotFoundError(f"Folder tidak ditemukan: {folder}")
    return sorted(
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS
    )


def process_photo(path: Path, session) -> Path:
    with Image.open(path) as img:
        img = img.convert("RGBA")
        result = remove(img, session=session)

    output_path = path.with_suffix(".png")
    result.save(output_path, format="PNG")

    if output_path != path:
        path.unlink()

    return output_path


def main() -> None:
    try:
        photos = find_mentor_photos(MENTOR_DIR)
    except FileNotFoundError as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    if not photos:
        print(f"Tidak ada foto ditemukan di {MENTOR_DIR}")
        sys.exit(0)

    print(f"Ditemukan {len(photos)} foto di {MENTOR_DIR}")
    print(f"Model: {MODEL_NAME} (download pertama kali bisa makan waktu)\n")

    session = new_session(MODEL_NAME)

    succeeded: list[Path] = []
    failed: list[tuple[Path, str]] = []

    for path in photos:
        print(f"Memproses {path.name} ...", end=" ", flush=True)
        try:
            output_path = process_photo(path, session)
            succeeded.append(output_path)
            print(f"OK -> {output_path.name}")
        except Exception as e:
            failed.append((path, str(e)))
            print(f"GAGAL ({e})")

    print("\n=== Laporan ===")
    print(f"Berhasil: {len(succeeded)}/{len(photos)}")
    if succeeded:
        for p in succeeded:
            print(f"  - {p.name}")

    if failed:
        print(f"\nGagal: {len(failed)}")
        for p, err in failed:
            print(f"  - {p.name}: {err}")


if __name__ == "__main__":
    main()
