#!/usr/bin/env python3
"""Regenerate homepage WebP thumbnails. Requires Pillow (see README.md)."""
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]


class HomepageImages(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = set()

    def handle_starttag(self, tag, attrs):
        if tag != "img":
            return
        attrs = dict(attrs)
        source = attrs.get("data-full") or attrs.get("src", "")
        if source.startswith("src/") and source.lower().endswith((".jpg", ".jpeg", ".png")):
            self.sources.add(source)


def thumbnail_path(source):
    return Path("thumbnails") / Path(source).relative_to("src").with_suffix(".webp")


def main():
    parser = HomepageImages()
    parser.feed((ROOT / "index.html").read_text(encoding="utf-8"))
    # The profile has no full-resolution lightbox, so include its original explicitly.
    parser.sources.add("src/profile.jpg")
    original_bytes = thumbnail_bytes = 0
    for source in sorted(parser.sources):
        original = ROOT / source
        destination = ROOT / thumbnail_path(source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(original) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            edge = 256 if source == "src/profile.jpg" else 640
            image.thumbnail((edge, edge), Image.Resampling.LANCZOS)
            image.save(destination, "WEBP", quality=82, method=6)
        original_bytes += original.stat().st_size
        thumbnail_bytes += destination.stat().st_size
    print(f"Generated {len(parser.sources)} thumbnails: "
          f"{original_bytes / 1024**2:.2f} MiB → {thumbnail_bytes / 1024**2:.2f} MiB "
          f"({1 - thumbnail_bytes / original_bytes:.1%} smaller).")


if __name__ == "__main__":
    main()
