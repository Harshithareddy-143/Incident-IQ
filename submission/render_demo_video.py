"""Render locally captured IncidentIQ screenshots into a captioned MP4."""
from pathlib import Path

import cv2
from PIL import Image, ImageDraw, ImageFont

ASSETS = Path(__file__).parent / "assets"
SCENES = [
    ("01-overview.png", "INCIDENTIQ", "Incident response with persistent engineering memory."),
    ("02-memory-bank.png", "HINDSIGHT MEMORY", "INC-018 stores production symptoms and its confirmed fix."),
    ("03-comparison-input.png", "THE INCIDENT", "A synthetic Payments API outage is ready for a live comparison."),
    ("04-live-comparison.png", "LIVE COMPARISON", "Same incident. No memory versus six live Hindsight memories."),
]
WIDTH, HEIGHT, FPS, SECONDS = 1280, 720, 15, 4
FONT_PATH = Path("C:/Windows/Fonts/segoeui.ttf")


def caption(image: Image.Image, chapter: str, line: str) -> Image.Image:
    image = image.convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rectangle((0, 605, WIDTH, HEIGHT), fill=(5, 7, 12, 238))
    draw.rectangle((0, 605, 8, HEIGHT), fill=(157, 126, 255, 255))
    chapter_font = ImageFont.truetype(str(FONT_PATH), 17) if FONT_PATH.exists() else ImageFont.load_default()
    line_font = ImageFont.truetype(str(FONT_PATH), 26) if FONT_PATH.exists() else ImageFont.load_default()
    draw.text((34, 625), chapter, font=chapter_font, fill=(184, 164, 255, 255))
    draw.text((34, 657), line, font=line_font, fill=(242, 244, 248, 255))
    return image


def main() -> None:
    output = ASSETS / "IncidentIQ-demo.mp4"
    writer = cv2.VideoWriter(str(output), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (WIDTH, HEIGHT))
    if not writer.isOpened():
        raise RuntimeError("This OpenCV installation cannot encode MP4 video.")
    try:
        for filename, chapter, line in SCENES:
            path = ASSETS / filename
            if not path.exists():
                raise FileNotFoundError(f"Capture missing: {path}")
            frame = cv2.cvtColor(__import__("numpy").array(caption(Image.open(path), chapter, line)), cv2.COLOR_RGB2BGR)
            for _ in range(FPS * SECONDS):
                writer.write(frame)
    finally:
        writer.release()
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
