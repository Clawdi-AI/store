---
name: markmap-mindmap-export
description: "Generate book/notes mindmaps in the locked Markmap style (SVG+foreignObject) and export a PNG after render verification. Use when user asks to build a mindmap/brain map, generate HTML mindmap, or export PNG from a mindmap, especially with requirements like markmap style, curved links, horizontal label lines, drag/zoom, remove bottom-left watermark/tip, and avoid sending blank/whiteboard images."
---

# Markmap Mindmap Export (Lincoln Baseline)

## What “done” means
- Output **HTML first** (self-contained/offline; Markmap SVG + foreignObject; drag/zoom).
- Only after confirming it rendered (not blank), export **PNG**.
- **Never** include any bottom-left tip/watermark text.
- Style is fixed to Lincoln’s chosen baseline:
  - `--markmap-max-width` + `fit-content` foreignObject container to keep horizontal lines adapted to text.

## Workflow (must follow)

### 1) Prepare Markdown source
- Create a Markdown file where the top `#` is the root node.
- Use `##/###/####` or list nesting for deeper relationships.

### 2) Build self-contained HTML
Use the bundled builder script:

```bash
node scripts/build_markmap_html.js \
  --in <input.md> \
  --out <output.html> \
  --title "<title>" \
  --maxWidth 420 \
  --containerMaxWidth 1400
```

Notes:
- The script embeds:
  - `assets/d3.v7.min.js`
  - `assets/markmap-view.browser.js`
  - `assets/markmap-lib.iife.js`
- It also guards against the known failure mode: `document.querySelector(#mindmap)` (missing quotes).

### 3) Render-check before exporting PNG (no whiteboard)
When automating with OpenClaw tools:

1. Serve the HTML locally (example):
   - `python3 -m http.server <port> --bind 127.0.0.1`
2. Open the page in the browser tool.
3. Wait 1–3s.
4. **Verify** it rendered:
   - Evaluate `document.querySelector('#mindmap')?.childElementCount`.
   - If `0` → do **NOT** screenshot; fix the error and retry.

### 4) Export PNG (preferred: headless, deterministic)
Use the bundled headless exporter (fixed canvas + validation):

```bash
node scripts/export_png_headless.js \
  --in <input.md> \
  --out <output.png> \
  --title "<title>" \
  --width 9000 \
  --height 5063 \
  --maxWidth 420 \
  --adapt 1 \
  --marginX 0.1755 \
  --marginY 0.0285 \
  --pad 40
```

Hard requirements (to keep Lincoln-level clarity):
- Must have **google-chrome-stable** (or set `CHROME_BIN`).
- Must have **Python + Pillow** (used to detect whiteboard exports).
- **Send PNG as a file attachment** (not inline image) to avoid chat app recompression.

Notes:
- The exporter uses headless Chrome (no GUI screenshot) and validates the PNG is not near-all-white.
- If higher clarity is needed and the map is dense:
  - Increase width/height until you hit pixel limits.
  - Do **not** send intermediate failed (blank) images.

## Bundled files
- `scripts/build_markmap_html.js` — build offline HTML with baseline style.
- `scripts/export_png_headless.js` — headless 导出 PNG + 白板检测 +（可选）留白自适配。
- `scripts/adapt_png_margins.py` — 裁留白/等比放大/固定画布留边（不变形）。
- `assets/` — d3 + markmap libs used for embedding.

