#!/usr/bin/env node
/**
 * Build a self-contained Markmap HTML (offline) from Markdown.
 *
 * - Embeds d3 + markmap-view (browser) + markmap-lib (iife) from assets/
 * - Applies the locked “Lincoln baseline” style:
 *   - no bottom-left tip/watermark
 *   - horizontal lines adapt to text width (fit-content foreignObject)
 *   - --markmap-max-width and Markmap.create maxWidth aligned
 *
 * Usage:
 *   node scripts/build_markmap_html.js --in input.md --out out.html --title "..." --maxWidth 420 --containerMaxWidth 1400
 */

const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i >= 0) return process.argv[i + 1];
  return def;
}

const inPath = arg('--in', null);
const outPath = arg('--out', null);
const title = arg('--title', 'Mindmap');
const maxWidth = Number(arg('--maxWidth', '420'));
const containerMaxWidth = Number(arg('--containerMaxWidth', '1400'));

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

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    /* Locked baseline style */
    .markmap{--markmap-max-width:${maxWidth}px;--markmap-a-color:#0097e6;--markmap-a-hover-color:#00a8ff;--markmap-code-bg:#f0f0f0;--markmap-code-color:#555;--markmap-highlight-bg:#ffeaa7;--markmap-table-border:1px solid currentColor;--markmap-font:300 16px/20px sans-serif;--markmap-circle-open-bg:#fff;--markmap-text-color:#333;--markmap-highlight-node-bg:#ff02;font:var(--markmap-font);color:var(--markmap-text-color)}
    .markmap-link{fill:none}
    .markmap-node>circle{cursor:pointer}
    .markmap-foreign{display:inline-block}
    .markmap-foreign p{margin:0}
    .markmap-foreign a{color:var(--markmap-a-color)}
    .markmap-foreign a:hover{color:var(--markmap-a-hover-color)}
    .markmap-foreign code{padding:.25em;font-size:calc(1em - 2px);color:var(--markmap-code-color);background-color:var(--markmap-code-bg);border-radius:2px}
    .markmap-foreign pre{margin:0}
    .markmap-foreign pre>code{display:block}
    .markmap-foreign del{text-decoration:line-through}
    .markmap-foreign em{font-style:italic}
    .markmap-foreign strong{font-weight:700}
    .markmap-foreign mark{background:var(--markmap-highlight-bg)}
    .markmap-foreign table,.markmap-foreign th,.markmap-foreign td{border-collapse:collapse;border:var(--markmap-table-border)}
    .markmap-foreign img{display:inline-block}
    .markmap-foreign svg{fill:currentColor}
    /* key: adapt line length to text content */
    .markmap-foreign>div{width:fit-content;max-width:var(--markmap-max-width);text-align:left}
    .markmap-foreign>div>div{display:inline-block}
    .markmap-highlight rect{fill:var(--markmap-highlight-node-bg)}

    html,body{height:100%;margin:0;background:#f6f7fb}
    .wrap{height:100%;display:flex;align-items:stretch;justify-content:center;padding:18px;box-sizing:border-box}
    .card{flex:1;max-width:${containerMaxWidth}px;background:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.08);overflow:hidden;position:relative}
    #mindmap{width:100%;height:100%}
  </style>
</head>
<body>
<div class="wrap"><div class="card">
  <svg id="mindmap" class="markmap"></svg>
</div></div>

<script>${d3}</script>
<script>${view}</script>
<script>${lib}</script>
<script>
  const md = ${JSON.stringify(mdRaw)};
  const { Transformer } = window.markmap;
  const transformer = new Transformer();
  const { root } = transformer.transform(md);
  const svg = document.querySelector('#mindmap');
  const mm = window.markmap.Markmap.create(svg, {
    duration: 200,
    maxWidth: ${maxWidth},
    spacingHorizontal: 110,
    spacingVertical: 12,
    paddingX: 8,
  }, root);
  mm.fit();
  // expose for diagnostics
  window.__MM__ = mm;
</script>
</body>
</html>`;

// Safety check: never emit the known-bad selector (missing quotes)
if (html.includes('document.querySelector(#mindmap)')) {
  throw new Error('BUG: selector quotes missing');
}

fs.writeFileSync(outPath, html);
console.log(`OK: wrote ${outPath}`);

function escapeHtml(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
