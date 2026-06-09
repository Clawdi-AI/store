#!/usr/bin/env node
/**
 * Deterministic PNG export without interactive GUI screenshots.
 *
 * Pipeline:
 * 1) Markdown -> fixed-size export HTML (self-contained/offline)
 * 2) Headless Chrome -> PNG
 * 3) Validate PNG is not a whiteboard (sample pixels)
 *
 * Usage:
 *   node scripts/export_png_headless.js --in book.md --out out.png \
 *     --title "..." --width 9000 --height 5063 --maxWidth 420
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i >= 0) return process.argv[i + 1];
  return def;
}

function getPythonCommand() {
  // Try python3 first (Unix/Linux/macOS), fallback to python (Windows)
  const candidates = ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'ignore' });
      return cmd;
    } catch {
      continue;
    }
  }
  console.error('No Python found. Install Python 3.');
  process.exit(2);
}

const inPath = arg('--in', null);
const outPath = arg('--out', null);
const title = arg('--title', 'Mindmap');
const width = Number(arg('--width', '9000'));
const height = Number(arg('--height', '5063'));
const maxWidth = Number(arg('--maxWidth', '420'));

// Post-process: reduce excessive whitespace WITHOUT distorting fonts
// (crop content bbox -> uniform scale -> paste onto fixed canvas with margins)
const adapt = String(arg('--adapt', '1')) !== '0';
const marginX = Number(arg('--marginX', '0.1755'));
const marginY = Number(arg('--marginY', '0.0285'));
const pad = Number(arg('--pad', '40'));

if (!inPath || !outPath) {
  console.error('Missing --in or --out');
  process.exit(2);
}

const skillDir = path.resolve(__dirname, '..');
const assetsDir = path.join(skillDir, 'assets');
const mdRaw = fs.readFileSync(inPath, 'utf8');

const d3 = fs.readFileSync(path.join(assetsDir, 'd3.v7.min.js'), 'utf8');
const view = fs.readFileSync(path.join(assetsDir, 'markmap-view.browser.js'), 'utf8');
const lib = fs.readFileSync(path.join(assetsDir, 'markmap-lib.iife.js'), 'utf8');

const tmpHtml = path.join(os.tmpdir(), `markmap-export-${Date.now()}.html`);

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  .markmap{--markmap-max-width:${maxWidth}px;--markmap-font:300 16px/20px sans-serif;--markmap-circle-open-bg:#fff;--markmap-text-color:#333;font:var(--markmap-font);color:var(--markmap-text-color)}
  .markmap-link{fill:none}
  .markmap-node>circle{cursor:pointer}
  .markmap-foreign{display:inline-block}
  .markmap-foreign p{margin:0}
  .markmap-foreign>div{width:fit-content;max-width:var(--markmap-max-width);text-align:left}
  .markmap-foreign>div>div{display:inline-block}
  html,body{margin:0;background:#fff}
  #mindmap{width:${width}px;height:${height}px;display:block}
</style></head>
<body>
<svg id="mindmap" class="markmap"></svg>
<script>${d3}</script>
<script>${view}</script>
<script>${lib}</script>
<script>
  const md = ${JSON.stringify(mdRaw)};
  const { Transformer } = window.markmap;
  const transformer = new Transformer();
  const { root } = transformer.transform(md);
  const svg = document.querySelector('#mindmap');
  const mm = window.markmap.Markmap.create(svg, { duration: 0, maxWidth: ${maxWidth}, spacingHorizontal: 110, spacingVertical: 12, paddingX: 8 }, root);
  mm.fit();
</script>
</body></html>`;

if (html.includes('document.querySelector(#mindmap)')) {
  throw new Error('BUG: selector quotes missing');
}

fs.writeFileSync(tmpHtml, html);

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
  '/Applications/Chromium.app/Contents/MacOS/Chromium',             // macOS Chromium
  '/usr/bin/google-chrome-stable',                                  // Linux
  '/usr/bin/google-chrome',                                          // Linux
  '/usr/bin/chromium',                                               // Linux
  '/usr/bin/chromium-browser',                                       // Linux
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',     // Windows
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' // Windows
].filter(Boolean);

let chrome = chromeCandidates.find(p => {
  try {
    fs.accessSync(p, fs.constants.F_OK); // Windows may not support X_OK
    return true;
  } catch {
    return false;
  }
});

if (!chrome) {
  console.error('No Chrome/Chromium binary found. Set CHROME_BIN or install google-chrome-stable.');
  process.exit(2);
}

// Export PNG via headless Chrome
// Convert path to proper file:// URL (handles Windows paths correctly)
const { pathToFileURL } = require('url');
const fileUrl = pathToFileURL(tmpHtml).href;

execFileSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--window-size=${width},${height}`,
  `--screenshot=${outPath}`,
  '--virtual-time-budget=5000',
  '--run-all-compositor-stages-before-draw',
  fileUrl,
], { stdio: 'ignore' });

// Validate PNG: fail if it looks like a whiteboard
const py = `
from PIL import Image
import sys
p=sys.argv[1]
img=Image.open(p).convert('RGB')
# downsample for speed
img=img.resize((600, int(600*img.height/img.width)))
pix=img.getdata()
# count near-white pixels
white=0
for r,g,b in pix:
    if r>245 and g>245 and b>245:
        white+=1
ratio=white/len(pix)
# if almost all white, treat as blank
if ratio>0.995:
    print('WHITEBOARD', ratio)
    sys.exit(3)
print('OK', ratio)
`;

try {
  const pythonCmd = getPythonCommand();
  execFileSync(pythonCmd, ['-c', py, outPath], { stdio: 'inherit' });
} catch (e) {
  console.error('Export validation failed (whiteboard).');
  process.exit(3);
}

// Optional: adapt margins (crop + uniform scale + paste) to reduce excessive whitespace
if (adapt) {
  const adaptScript = path.join(skillDir, 'scripts', 'adapt_png_margins.py');
  const pythonCmd = getPythonCommand();
  execFileSync(pythonCmd, [
    adaptScript,
    '--in', outPath,
    '--out', outPath,
    '--marginX', String(marginX),
    '--marginY', String(marginY),
    '--pad', String(pad),
  ], { stdio: 'ignore' });
}

console.log(`OK: exported ${outPath}`);

function escapeHtml(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
