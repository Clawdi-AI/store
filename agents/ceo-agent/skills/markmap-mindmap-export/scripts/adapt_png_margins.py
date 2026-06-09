#!/usr/bin/env python3
"""Adapt Markmap-exported PNG to Lincoln's preferred canvas ratio/margins WITHOUT distorting text.

What it does:
- Detect content bounding box (non-white pixels)
- Crop tightly (with small padding)
- Uniformly scale to fit into an inner region of the original canvas
- Paste centered onto a white canvas (same output size)

This reduces excessive whitespace while keeping font aspect ratio intact.

Usage:
  python3 scripts/adapt_png_margins.py --in in.png --out out.png \
    --marginX 0.1755 --marginY 0.0285 --pad 40
"""

import argparse
from PIL import Image, ImageChops


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True)
    ap.add_argument('--out', dest='out', required=True)
    ap.add_argument('--marginX', type=float, default=0.1755)
    ap.add_argument('--marginY', type=float, default=0.0285)
    ap.add_argument('--pad', type=int, default=40)
    return ap.parse_args()


def main():
    a = parse_args()
    im = Image.open(a.inp).convert('RGB')
    W, H = im.size

    bg = Image.new('RGB', (W, H), (255, 255, 255))
    diff = ImageChops.difference(im, bg)
    bbox = diff.getbbox()
    if not bbox:
        # nothing to adapt
        im.save(a.out)
        return

    x0, y0, x1, y1 = bbox
    pad = max(0, int(a.pad))
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(W, x1 + pad)
    y1 = min(H, y1 + pad)

    crop = im.crop((x0, y0, x1, y1))

    mx = int(round(a.marginX * W))
    my = int(round(a.marginY * H))
    innerW = max(1, W - 2 * mx)
    innerH = max(1, H - 2 * my)

    cw, ch = crop.size
    scale = min(innerW / cw, innerH / ch)
    newW = max(1, int(round(cw * scale)))
    newH = max(1, int(round(ch * scale)))

    resized = crop.resize((newW, newH), Image.LANCZOS)

    out = Image.new('RGB', (W, H), (255, 255, 255))
    px = mx + (innerW - newW) // 2
    py = my + (innerH - newH) // 2
    out.paste(resized, (px, py))

    out.save(a.out, optimize=True)


if __name__ == '__main__':
    main()
