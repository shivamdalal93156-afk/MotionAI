/**
 * Aootra Wizard v2 — Scene-based config wizard for After Effects templates
 * Usage: node wizard.js "Template Name"
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

const templateName = process.argv[2];
if (!templateName) { console.error('Usage: node wizard.js "Template Name"'); process.exit(1); }

const templateDir = path.join(__dirname, 'templates', templateName);
const scanFile = path.join(templateDir, 'scan_result.txt');
if (!fs.existsSync(scanFile)) { console.error('scan_result.txt not found in', templateDir); process.exit(1); }

// ─────────────────────────────────────────────
// PARSER
// ─────────────────────────────────────────────

function parseFields(line) {
  const parts = line.split('|');
  const type = parts[0];
  const fields = {};
  for (let i = 1; i < parts.length; i++) {
    const idx = parts[i].indexOf(':');
    if (idx === -1) continue;
    fields[parts[i].slice(0, idx)] = parts[i].slice(idx + 1);
  }
  return { type, fields };
}

function parseScanFile() {
  const raw = fs.readFileSync(scanFile, 'utf8');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  let renderComp = null;
  let aepFile = null;
  const scenes = [];
  const rawLayers = [];

  for (const line of lines) {
    if (line.startsWith('aep:') || line.startsWith('AEP:')) {
      aepFile = line.split(':').slice(1).join(':').trim();
      continue;
    }
    const { type, fields } = parseFields(line);
    if (type === 'RENDER_COMP' && !renderComp) { renderComp = fields; continue; }
    if (type === 'SCENE') {
      scenes.push({ name: fields.block || fields.name || `Scene ${scenes.length + 1}`, mainIn: parseFloat(fields.mainIn || 0), mainOut: parseFloat(fields.mainOut || 0) });
      continue;
    }
    if (['SOLID_INJECT','TEXT_INJECT','IMAGE_INJECT','EXPR_CONTROL'].includes(type)) {
      rawLayers.push({ type, fields, line });
    }
  }

  return { renderComp, aepFile, scenes, rawLayers };
}

// ─────────────────────────────────────────────
// COLORING
// ─────────────────────────────────────────────

const GREEN_SOLID_KEYWORDS = ['photo','placeholder','delete','footage','logo','bg','image','room','exterior','interior'];
const RED_SOURCE_KEYWORDS = ['dirty','paper-crumpled','scotchtape','pushpin','knot','steam','sticker','clip','dock','table','warehouse','map_0','newspaper','palaroid','cover','badge','businesscard','cd','ticket','floorplan','whileyouwereout','parkingviolation','envelopepostal','police-flashing','background_0'];
const RED_EFFECT_KEYWORDS = ['horizontal position','vertical position','scale','effect - dirty','effect - paper','effect - old','film noise','police flashing','jalousie','shade color intensity','effect - vignette','effect - grayscale','effect - contrast','effect - saturation','effect - cold','helping numbers'];
const GREEN_COLOR_EFFECTS = ['color','colour','tint','fill'];

function getColor(type, fields) {
  if (type === 'SOLID_INJECT') {
    const ln = (fields.layer || '').toLowerCase();
    if (GREEN_SOLID_KEYWORDS.some(k => ln.includes(k))) return 'green';
    return 'yellow';
  }
  if (type === 'TEXT_INJECT') {
    const val = fields.val || '';
    if (/^\d+$/.test(val.trim())) return 'red';
    if (val.toLowerCase().includes('help numbering')) return 'red';
    if (val.length > 80) return 'red';
    if (val === val.toUpperCase() && val.length > 3 && /^[A-Z\s]+$/.test(val)) return 'red';
    return 'green';
  }
  if (type === 'IMAGE_INJECT') {
    const src = (fields.source || fields.layer || '').toLowerCase();
    if (RED_SOURCE_KEYWORDS.some(k => src.includes(k))) return 'red';
    return 'yellow';
  }
  if (type === 'EXPR_CONTROL') {
    const eff = (fields.effect || '').toLowerCase();
    if (RED_EFFECT_KEYWORDS.some(k => eff.includes(k))) return 'red';
    if (GREEN_COLOR_EFFECTS.some(k => eff.includes(k)) && fields.type === 'color') return 'green';
    return 'yellow';
  }
  return 'yellow';
}

function getDisplayType(type, fields) {
  if (type === 'SOLID_INJECT') return 'PHOTO';
  if (type === 'IMAGE_INJECT') return (fields.type === 'replace') ? 'VIDEO' : 'IMAGE';
  if (type === 'TEXT_INJECT') return 'TEXT';
  if (type === 'EXPR_CONTROL') {
    if (fields.type === 'color') return 'COLOR';
    if (fields.type === 'checkbox') return 'CHECK';
    return 'SLIDER';
  }
  return 'UNKNOWN';
}

// ─────────────────────────────────────────────
// SCENE ASSIGNMENT
// ─────────────────────────────────────────────

function assignScene(absIn, absOut, scenes, totalDur) {
  const layerDur = absOut - absIn;
  if (totalDur > 0 && layerDur / totalDur >= 0.80) return '__global__';
  if (scenes.length === 0) return '__global__';
  let bestScene = null, bestOverlap = -1;
  for (const s of scenes) {
    const overlap = Math.max(0, Math.min(absOut, s.mainOut) - Math.max(absIn, s.mainIn));
    if (overlap > bestOverlap) { bestOverlap = overlap; bestScene = s.name; }
  }
  return bestScene || '__global__';
}

// ─────────────────────────────────────────────
// KEY GENERATION
// ─────────────────────────────────────────────

function toKey(str) {
  if (!str) return 'unknown';
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function dedupeKeys(layers) {
  const counts = {};
  for (const l of layers) {
    const base = l.key;
    counts[base] = (counts[base] || 0) + 1;
    if (counts[base] > 1) l.key = `${base}_${String(counts[base]).padStart(2,'0')}`;
  }
  // Re-check: first occurrence should get _01 if there are dupes
  const seen = {};
  for (const l of layers) {
    const base = l.key.replace(/_\d+$/, '');
    if (!(base in seen)) seen[base] = [];
    seen[base].push(l);
  }
  for (const base in seen) {
    if (seen[base].length > 1) {
      seen[base].forEach((l, i) => { l.key = `${base}_${String(i+1).padStart(2,'0')}`; });
    }
  }
}

// ─────────────────────────────────────────────
// BUILD STATE
// ─────────────────────────────────────────────

function buildState() {
  const { renderComp, aepFile, scenes, rawLayers } = parseScanFile();
  const totalDur = parseFloat(renderComp?.dur || 0);

  // Deduplicate: same comp + same layerName
  const seen = new Set();
  const layers = [];
  let idCounter = 0;

  for (const { type, fields, line } of rawLayers) {
    const comp = fields.comp || '';
    const layerName = fields.layer || '';
    const dupKey = `${comp}::${layerName}`;
    if (seen.has(dupKey)) continue;
    seen.add(dupKey);

    const absIn = parseFloat(fields.absIn || 0);
    const absOut = parseFloat(fields.absOut || totalDur);
    const color = getColor(type, fields);
    const displayType = getDisplayType(type, fields);
    const sceneAssignment = assignScene(absIn, absOut, scenes, totalDur);
    const id = `layer_${idCounter++}`;

    // Auto label
    let defaultLabel = '';
    if (type === 'TEXT_INJECT') defaultLabel = fields.val || layerName;
    else if (type === 'EXPR_CONTROL') defaultLabel = fields.effect || layerName;
    else defaultLabel = layerName.replace(/[_\-]/g,' ').replace(/\b\w/g, c => c.toUpperCase());

    layers.push({ id, type, fields, comp, layerName, color, displayType, sceneAssignment, absIn, absOut, defaultLabel, key: toKey(layerName) });
  }

  dedupeKeys(layers);

  const meta = {
    name: templateName,
    aepFile: aepFile ? path.basename(aepFile) : '',
    compName: renderComp?.name || 'Main',
    fps: parseFloat(renderComp?.fps || 29.97),
    duration: totalDur,
    resolution: renderComp?.res ? { width: parseInt(renderComp.res.split('x')[0]), height: parseInt(renderComp.res.split('x')[1]) } : { width: 1920, height: 1080 }
  };

  // Default kept state
  const kept = {};
  const labels = {};
  for (const l of layers) {
    kept[l.id] = l.color === 'green';
    labels[l.id] = l.defaultLabel;
  }

  return { meta, scenes, layers, kept, labels };
}

const STATE = buildState();

// ─────────────────────────────────────────────
// CONFIG BUILDER
// ─────────────────────────────────────────────

function buildConfig(kept, labels) {
  const imageLayers = [], textLayers = [], expressionControls = [];

  for (const l of STATE.layers) {
    if (!kept[l.id]) continue;
    const label = labels[l.id] || l.defaultLabel;
    if (l.type === 'SOLID_INJECT') {
      imageLayers.push({ key: l.key, compName: l.comp, layerName: l.layerName, type: 'solid_replace', label, slotW: parseInt(l.fields.slotW||l.fields.compW||0), slotH: parseInt(l.fields.slotH||l.fields.compH||0), maskShape: l.fields.maskShape||'rectangle', cornerRadius: parseInt(l.fields.cornerRadius||0), absIn: l.absIn, absOut: l.absOut });
    } else if (l.type === 'IMAGE_INJECT') {
      imageLayers.push({ key: l.key, compName: l.comp, layerName: l.layerName, type: 'replace', label, width: parseInt(l.fields.w||0), height: parseInt(l.fields.h||0), absIn: l.absIn, absOut: l.absOut });
    } else if (l.type === 'TEXT_INJECT') {
      textLayers.push({ key: l.key, compName: l.comp, layerName: l.layerName, label, defaultValue: l.fields.val||'', absIn: l.absIn, absOut: l.absOut });
    } else if (l.type === 'EXPR_CONTROL') {
      expressionControls.push({ key: l.key, compName: l.comp, layerName: l.layerName, effectName: l.fields.effect||'', type: l.fields.type||'', label, default: l.fields.value||'' });
    }
  }

  return { ...STATE.meta, imageLayers, textLayers, expressionControls };
}

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

app.get('/api/state', (req, res) => {
  res.json({ meta: STATE.meta, scenes: STATE.scenes, layers: STATE.layers.length });
});

app.post('/api/toggle', (req, res) => {
  const { id, kept, label } = req.body;
  if (id in STATE.kept) {
    if (kept !== undefined) STATE.kept[id] = kept;
    if (label !== undefined) STATE.labels[id] = label;
  }
  res.json({ ok: true });
});

app.post('/save', (req, res) => {
  const { kept, labels } = req.body;
  Object.assign(STATE.kept, kept || {});
  Object.assign(STATE.labels, labels || {});
  const config = buildConfig(STATE.kept, STATE.labels);
  const outPath = path.join(templateDir, 'config.json');
  fs.writeFileSync(outPath, JSON.stringify(config, null, 2));
  res.json({ success: true, path: outPath });
});

// ─────────────────────────────────────────────
// HTML
// ─────────────────────────────────────────────

app.get('/', (req, res) => {
  const { meta, scenes, layers, kept, labels } = STATE;

  // Serialize data for client
  const clientData = JSON.stringify({ meta, scenes, layers, kept, labels });

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Aootra Wizard — ${meta.name}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#090909;--surface:#111;--surface2:#181818;--surface3:#1f1f1f;
  --border:#252525;--border2:#2e2e2e;
  --text:#e8e8e8;--text2:#888;--text3:#555;
  --green:#22c55e;--yellow:#eab308;--red:#ef4444;--blue:#3b82f6;
  --green-dim:rgba(34,197,94,.12);--yellow-dim:rgba(234,179,8,.10);--red-dim:rgba(239,68,68,.10);
  --radius:6px;--font:'IBM Plex Mono',monospace;
}
html{font-size:13px}
body{background:var(--bg);color:var(--text);font-family:var(--font);min-height:100vh;overflow-x:hidden}

/* TOP BAR */
#topbar{
  position:sticky;top:0;z-index:100;
  background:rgba(9,9,9,.95);backdrop-filter:blur(12px);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:12px;padding:0 16px;height:52px;
}
#topbar .logo{font-size:15px;font-weight:700;letter-spacing:-.5px;color:#fff;flex-shrink:0}
#topbar .logo span{color:var(--green)}
#topbar .tname{color:var(--text2);font-size:11px;flex-shrink:0;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#search{
  flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);
  color:var(--text);font-family:var(--font);font-size:12px;padding:6px 10px;outline:none;
  transition:border-color .15s;
}
#search:focus{border-color:var(--border2)}
.filter-btns{display:flex;gap:4px;flex-shrink:0}
.filter-btns button{
  background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);
  color:var(--text2);font-family:var(--font);font-size:11px;padding:4px 9px;cursor:pointer;
  transition:all .1s;
}
.filter-btns button:hover{border-color:var(--border2);color:var(--text)}
.filter-btns button.active{background:var(--surface3);border-color:#444;color:var(--text)}
#counter{color:var(--text2);font-size:11px;flex-shrink:0;white-space:nowrap}
#counter strong{color:var(--green)}
#save-btn{
  background:var(--green);color:#000;border:none;border-radius:var(--radius);
  font-family:var(--font);font-size:12px;font-weight:700;padding:7px 14px;cursor:pointer;
  flex-shrink:0;transition:opacity .15s;
}
#save-btn:hover{opacity:.85}
#save-btn:active{opacity:.7}

/* LAYOUT */
#main{display:flex;height:calc(100vh - 52px)}
#left{flex:1;overflow-y:auto;padding:12px 0}
#right{width:340px;flex-shrink:0;border-left:1px solid var(--border);overflow-y:auto;background:var(--surface)}

/* SCENE SECTION */
.scene-section{margin:0 12px 6px}
.scene-header{
  display:flex;align-items:center;gap:8px;padding:8px 10px;
  background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);
  cursor:pointer;user-select:none;transition:background .1s;
}
.scene-header:hover{background:var(--surface3)}
.scene-arrow{color:var(--text3);font-size:10px;transition:transform .15s;flex-shrink:0}
.scene-header.open .scene-arrow{transform:rotate(90deg)}
.scene-name{font-size:12px;font-weight:600;color:var(--text);flex:1}
.scene-time{font-size:10px;color:var(--text3)}
.scene-count{font-size:10px;background:var(--surface3);border:1px solid var(--border);border-radius:4px;padding:1px 6px;color:var(--text2)}
.scene-body{display:none;padding:4px 0 0}
.scene-body.open{display:block}

/* CARDS */
.card{
  display:flex;align-items:center;gap:8px;
  padding:8px 10px;margin:2px 0;
  background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  transition:border-color .1s,opacity .15s;min-height:44px;
}
.card.kept{border-left:2px solid var(--green)}
.card.skipped{opacity:.45}
.card.hidden{display:none}
.color-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.dot-green{background:var(--green)}
.dot-yellow{background:var(--yellow)}
.dot-red{background:var(--red)}
.type-badge{
  font-size:9px;font-weight:700;letter-spacing:.5px;padding:2px 5px;border-radius:3px;flex-shrink:0;
}
.badge-PHOTO{background:rgba(59,130,246,.2);color:#60a5fa}
.badge-TEXT{background:rgba(168,85,247,.2);color:#c084fc}
.badge-VIDEO{background:rgba(234,179,8,.15);color:#fbbf24}
.badge-IMAGE{background:rgba(234,179,8,.15);color:#fbbf24}
.badge-COLOR{background:rgba(239,68,68,.15);color:#f87171}
.badge-SLIDER{background:rgba(34,197,94,.12);color:#4ade80}
.badge-CHECK{background:rgba(34,197,94,.12);color:#4ade80}
.badge-UNKNOWN{background:rgba(255,255,255,.08);color:#888}
.card-main{flex:1;min-width:0}
.card-primary{font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-primary .val-text{color:#c084fc;font-style:italic}
.card-secondary{font-size:10px;color:var(--text3);margin-top:1px}
.color-swatch{display:inline-block;width:12px;height:12px;border-radius:2px;vertical-align:middle;margin-right:4px;border:1px solid rgba(255,255,255,.1)}
.card-actions{display:flex;gap:4px;flex-shrink:0;align-items:center}
.btn-keep,.btn-skip{
  font-family:var(--font);font-size:10px;font-weight:700;
  border-radius:4px;padding:3px 8px;cursor:pointer;border:1px solid;
  transition:all .1s;white-space:nowrap;
}
.btn-keep{background:transparent;border-color:var(--border2);color:var(--text2)}
.btn-keep.active{background:var(--green-dim);border-color:var(--green);color:var(--green)}
.btn-skip{background:transparent;border-color:var(--border2);color:var(--text2)}
.btn-skip.active{background:var(--red-dim);border-color:var(--red);color:var(--red)}
.label-input{
  font-family:var(--font);font-size:11px;background:var(--surface2);
  border:1px solid var(--border2);border-radius:4px;color:var(--text);
  padding:3px 7px;width:130px;outline:none;transition:border-color .1s;
}
.label-input:focus{border-color:#555}

/* BULK ACTIONS */
.bulk-bar{display:flex;gap:6px;padding:4px 0 6px}
.bulk-btn{
  font-family:var(--font);font-size:10px;background:var(--surface2);
  border:1px solid var(--border);border-radius:4px;color:var(--text2);
  padding:3px 8px;cursor:pointer;transition:all .1s;
}
.bulk-btn:hover{border-color:var(--border2);color:var(--text)}

/* RED SECTION */
.red-section{margin:0 12px 12px;border:1px solid rgba(239,68,68,.2);border-radius:var(--radius)}
.red-section-header{
  display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;
  background:rgba(239,68,68,.05);border-radius:var(--radius);user-select:none;
}
.red-section-body{display:none;padding:4px 8px 8px}
.red-section-body.open{display:block}

/* SEARCH RESULTS */
#search-results{display:none;padding:8px 12px}
.search-result-card{
  display:flex;align-items:center;gap:8px;padding:8px 10px;
  background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  margin:2px 0;
}
.scene-tag{font-size:9px;background:var(--surface3);border:1px solid var(--border);
  border-radius:3px;padding:1px 5px;color:var(--text2);flex-shrink:0}

/* RIGHT PANEL */
#right-header{padding:10px 12px;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text2);letter-spacing:1px}
#config-preview{
  padding:12px;font-size:10px;line-height:1.6;white-space:pre;overflow-x:auto;
  color:#888;font-family:'IBM Plex Mono',monospace;
}
#config-preview .k{color:#60a5fa}
#config-preview .s{color:#4ade80}
#config-preview .n{color:#fb923c}
#config-preview .b{color:#f472b6}

/* TOAST */
#toast{
  position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(80px);
  background:#22c55e;color:#000;font-family:var(--font);font-size:12px;font-weight:700;
  padding:10px 20px;border-radius:6px;z-index:999;transition:transform .2s ease;pointer-events:none;
}
#toast.show{transform:translateX(-50%) translateY(0)}

/* GLOBAL LABEL */
.section-label{font-size:10px;font-weight:700;letter-spacing:1px;color:var(--text3);padding:6px 10px 2px;text-transform:uppercase}
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body>

<div id="topbar">
  <div class="logo">ao<span>otr</span>a</div>
  <div class="tname">${meta.name}</div>
  <input id="search" type="text" placeholder="Search layers, values, comps...">
  <div class="filter-btns">
    <button data-filter="all" class="active">All</button>
    <button data-filter="green">🟢</button>
    <button data-filter="yellow">🟡</button>
    <button data-filter="red">🔴</button>
    <button data-filter="kept">Kept</button>
    <button data-filter="skipped">Skipped</button>
  </div>
  <div id="counter"><strong>0</strong> / 0 kept</div>
  <button id="save-btn">Save Config</button>
</div>

<div id="main">
  <div id="left">
    <div id="scene-list"></div>
    <div id="search-results"></div>
  </div>
  <div id="right">
    <div id="right-header">CONFIG PREVIEW</div>
    <div id="config-preview">...</div>
  </div>
</div>

<div id="toast">✓ Config saved</div>

<script>
const DATA = ${clientData};

// Mutable state
const kept = Object.assign({}, DATA.kept);
const labels = Object.assign({}, DATA.labels);
let currentFilter = 'all';
let searchQuery = '';

const allLayers = DATA.layers;
const scenes = DATA.scenes;

// ── HELPERS ──────────────────────────────────────
function getCardClass(layer) {
  const k = kept[layer.id];
  let cls = 'card';
  if (k) cls += ' kept';
  else cls += ' skipped';
  return cls;
}

function shouldShowCard(layer) {
  if (layer.color === 'red') return false; // handled in red section
  if (currentFilter === 'green' && layer.color !== 'green') return false;
  if (currentFilter === 'yellow' && layer.color !== 'yellow') return false;
  if (currentFilter === 'red' && layer.color !== 'red') return false;
  if (currentFilter === 'kept' && !kept[layer.id]) return false;
  if (currentFilter === 'skipped' && kept[layer.id]) return false;
  return true;
}

function colorDotClass(color) {
  if (color === 'green') return 'color-dot dot-green';
  if (color === 'yellow') return 'color-dot dot-yellow';
  return 'color-dot dot-red';
}

function primaryText(layer) {
  const f = layer.fields;
  if (layer.displayType === 'TEXT') return '"' + (f.val||layer.layerName).slice(0,60) + '"';
  if (layer.displayType === 'COLOR') return (f.value||'');
  if (layer.displayType === 'PHOTO') return (f.slotW||f.compW||'?') + '×' + (f.slotH||f.compH||'?');
  if (layer.displayType === 'IMAGE' || layer.displayType === 'VIDEO') return (f.w||'?') + '×' + (f.h||'?') + ' — ' + (f.source||layer.layerName).slice(0,30);
  return (f.effect || layer.layerName).slice(0,50);
}

function secondaryText(layer) {
  return layer.comp + (layer.absIn !== undefined ? '  ·  ' + layer.absIn.toFixed(1) + 's–' + layer.absOut.toFixed(1) + 's' : '');
}

// ── CARD DOM ──────────────────────────────────────
function createCard(layer) {
  const card = document.createElement('div');
  card.className = getCardClass(layer);
  card.dataset.id = layer.id;
  card.dataset.color = layer.color;

  const dot = document.createElement('div');
  dot.className = colorDotClass(layer.color);

  const badge = document.createElement('div');
  badge.className = 'type-badge badge-' + layer.displayType;
  badge.textContent = layer.displayType;

  const main = document.createElement('div');
  main.className = 'card-main';

  const primary = document.createElement('div');
  primary.className = 'card-primary';

  if (layer.displayType === 'COLOR' && layer.fields.value) {
    const swatch = document.createElement('span');
    swatch.className = 'color-swatch';
    swatch.style.background = layer.fields.value;
    primary.appendChild(swatch);
    primary.appendChild(document.createTextNode(layer.fields.value + ' — ' + (layer.fields.effect||'').slice(0,40)));
  } else if (layer.displayType === 'TEXT') {
    const span = document.createElement('span');
    span.className = 'val-text';
    span.textContent = primaryText(layer);
    primary.appendChild(span);
  } else {
    primary.textContent = primaryText(layer);
  }

  const secondary = document.createElement('div');
  secondary.className = 'card-secondary';
  secondary.textContent = secondaryText(layer);

  main.appendChild(primary);
  main.appendChild(secondary);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const labelInput = document.createElement('input');
  labelInput.className = 'label-input';
  labelInput.value = labels[layer.id] || layer.defaultLabel || '';
  labelInput.placeholder = 'Label...';
  labelInput.style.display = kept[layer.id] ? 'block' : 'none';
  labelInput.addEventListener('input', () => {
    labels[layer.id] = labelInput.value;
    updatePreview();
  });

  const btnKeep = document.createElement('button');
  btnKeep.className = 'btn-keep' + (kept[layer.id] ? ' active' : '');
  btnKeep.textContent = 'Keep';
  btnKeep.addEventListener('click', () => {
    kept[layer.id] = true;
    card.className = 'card kept';
    if (layer.color === 'red') card.className += ' skipped'; // kept override for red still dim
    card.classList.remove('skipped');
    card.classList.add('kept');
    btnKeep.classList.add('active');
    btnSkip.classList.remove('active');
    labelInput.style.display = 'block';
    updateCounter();
    updatePreview();
    applyFilter();
  });

  const btnSkip = document.createElement('button');
  btnSkip.className = 'btn-skip' + (!kept[layer.id] ? ' active' : '');
  btnSkip.textContent = 'Skip';
  btnSkip.addEventListener('click', () => {
    kept[layer.id] = false;
    card.classList.remove('kept');
    card.classList.add('skipped');
    btnSkip.classList.add('active');
    btnKeep.classList.remove('active');
    labelInput.style.display = 'none';
    updateCounter();
    updatePreview();
    applyFilter();
  });

  actions.appendChild(labelInput);
  actions.appendChild(btnKeep);
  actions.appendChild(btnSkip);

  card.appendChild(dot);
  card.appendChild(badge);
  card.appendChild(main);
  card.appendChild(actions);

  return card;
}

// ── SCENE ACCORDION ──────────────────────────────
function buildSceneList() {
  const container = document.getElementById('scene-list');
  container.innerHTML = '';

  // Global layers
  const globalLayers = allLayers.filter(l => l.sceneAssignment === '__global__' && l.color !== 'red');
  if (globalLayers.length > 0) {
    const sec = buildSection('Global — All Scenes', null, globalLayers, true);
    container.appendChild(sec);
  }

  // Per-scene
  const sceneNames = [...new Set(allLayers.filter(l => l.sceneAssignment !== '__global__' && l.color !== 'red').map(l => l.sceneAssignment))];
  for (const sn of sceneNames) {
    const sceneLayers = allLayers.filter(l => l.sceneAssignment === sn && l.color !== 'red');
    if (!sceneLayers.length) continue;
    const sceneObj = scenes.find(s => s.name === sn);
    const timeStr = sceneObj ? sceneObj.mainIn.toFixed(1) + 's — ' + sceneObj.mainOut.toFixed(1) + 's' : '';
    const sec = buildSection(sn, timeStr, sceneLayers, false);
    container.appendChild(sec);
  }

  // Red / internal section
  const redLayers = allLayers.filter(l => l.color === 'red');
  if (redLayers.length > 0) {
    const redSec = document.createElement('div');
    redSec.className = 'red-section';

    const redHeader = document.createElement('div');
    redHeader.className = 'red-section-header';
    redHeader.innerHTML = '<span style="color:var(--red);font-size:11px;font-weight:700">▶</span><span style="font-size:11px;color:#888">Internal / Skip ('+redLayers.length+' layers)</span>';

    const redBody = document.createElement('div');
    redBody.className = 'red-section-body';
    for (const l of redLayers) redBody.appendChild(createCard(l));

    redHeader.addEventListener('click', () => {
      const open = redBody.classList.toggle('open');
      redHeader.querySelector('span').style.transform = open ? 'rotate(90deg)' : '';
    });

    redSec.appendChild(redHeader);
    redSec.appendChild(redBody);
    container.appendChild(redSec);
  }
}

function buildSection(name, timeStr, layers, isOpen) {
  const wrap = document.createElement('div');
  wrap.className = 'scene-section';

  const header = document.createElement('div');
  header.className = 'scene-header' + (isOpen ? ' open' : '');

  const arrow = document.createElement('span');
  arrow.className = 'scene-arrow';
  arrow.textContent = '▶';

  const nameEl = document.createElement('span');
  nameEl.className = 'scene-name';
  nameEl.textContent = name;

  const countEl = document.createElement('span');
  countEl.className = 'scene-count';
  countEl.dataset.section = name;

  const bulkKeep = document.createElement('button');
  bulkKeep.className = 'bulk-btn';
  bulkKeep.textContent = 'Keep all';

  const bulkSkip = document.createElement('button');
  bulkSkip.className = 'bulk-btn';
  bulkSkip.textContent = 'Skip all';

  if (timeStr) {
    const timeEl = document.createElement('span');
    timeEl.className = 'scene-time';
    timeEl.textContent = timeStr;
    header.appendChild(arrow);
    header.appendChild(nameEl);
    header.appendChild(timeEl);
  } else {
    header.appendChild(arrow);
    header.appendChild(nameEl);
  }
  header.appendChild(countEl);

  const body = document.createElement('div');
  body.className = 'scene-body' + (isOpen ? ' open' : '');

  const bulkBar = document.createElement('div');
  bulkBar.className = 'bulk-bar';
  bulkBar.style.padding = '0 0 4px';

  bulkKeep.addEventListener('click', (e) => {
    e.stopPropagation();
    for (const l of layers) { kept[l.id] = true; }
    rebuildCards(body, layers);
    updateCounter(); updatePreview();
  });
  bulkSkip.addEventListener('click', (e) => {
    e.stopPropagation();
    for (const l of layers) { kept[l.id] = false; }
    rebuildCards(body, layers);
    updateCounter(); updatePreview();
  });

  bulkBar.appendChild(bulkKeep);
  bulkBar.appendChild(bulkSkip);
  body.appendChild(bulkBar);

  for (const l of layers) body.appendChild(createCard(l));

  header.addEventListener('click', () => {
    const open = body.classList.toggle('open');
    header.classList.toggle('open', open);
  });

  wrap.appendChild(header);
  wrap.appendChild(body);

  updateSectionCount(countEl, layers);
  return wrap;
}

function rebuildCards(body, layers) {
  // Remove existing cards (keep bulk bar)
  const bulkBar = body.querySelector('.bulk-bar');
  body.innerHTML = '';
  if (bulkBar) body.appendChild(bulkBar);
  for (const l of layers) body.appendChild(createCard(l));
}

function updateSectionCount(el, layers) {
  const k = layers.filter(l => kept[l.id]).length;
  el.textContent = k + '/' + layers.length;
}

// ── COUNTER ──────────────────────────────────────
function updateCounter() {
  const total = allLayers.filter(l => l.color !== 'red').length;
  const kCount = allLayers.filter(l => l.color !== 'red' && kept[l.id]).length;
  document.getElementById('counter').innerHTML = '<strong>' + kCount + '</strong> / ' + total + ' kept';

  // Update per-section counts
  document.querySelectorAll('.scene-count[data-section]').forEach(el => {
    const sn = el.dataset.section;
    const sec = sn === 'Global — All Scenes' ? '__global__' : sn;
    const secLayers = allLayers.filter(l => l.sceneAssignment === sec && l.color !== 'red');
    const k = secLayers.filter(l => kept[l.id]).length;
    el.textContent = k + '/' + secLayers.length;
  });
}

// ── FILTER ───────────────────────────────────────
function applyFilter() {
  document.querySelectorAll('.card').forEach(card => {
    const id = card.dataset.id;
    const layer = allLayers.find(l => l.id === id);
    if (!layer) return;
    if (currentFilter === 'all') { card.classList.remove('hidden'); return; }
    if (currentFilter === 'green') card.classList.toggle('hidden', layer.color !== 'green');
    else if (currentFilter === 'yellow') card.classList.toggle('hidden', layer.color !== 'yellow');
    else if (currentFilter === 'red') card.classList.toggle('hidden', layer.color !== 'red');
    else if (currentFilter === 'kept') card.classList.toggle('hidden', !kept[layer.id]);
    else if (currentFilter === 'skipped') card.classList.toggle('hidden', !!kept[layer.id]);
  });
}

// ── SEARCH ───────────────────────────────────────
function doSearch(q) {
  searchQuery = q.toLowerCase().trim();
  const sceneList = document.getElementById('scene-list');
  const searchResults = document.getElementById('search-results');

  if (!searchQuery) {
    sceneList.style.display = '';
    searchResults.style.display = 'none';
    searchResults.innerHTML = '';
    return;
  }

  sceneList.style.display = 'none';
  searchResults.style.display = 'block';
  searchResults.innerHTML = '';

  const matches = allLayers.filter(l => {
    const f = l.fields;
    return (l.layerName||'').toLowerCase().includes(searchQuery) ||
      (f.val||'').toLowerCase().includes(searchQuery) ||
      (l.comp||'').toLowerCase().includes(searchQuery) ||
      (f.effect||'').toLowerCase().includes(searchQuery) ||
      (f.source||'').toLowerCase().includes(searchQuery);
  });

  if (!matches.length) {
    searchResults.textContent = 'No results.';
    return;
  }

  for (const l of matches) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0';
    const tag = document.createElement('span');
    tag.className = 'scene-tag';
    tag.textContent = l.sceneAssignment === '__global__' ? 'Global' : l.sceneAssignment;
    wrap.appendChild(tag);
    wrap.appendChild(createCard(l));
    searchResults.appendChild(wrap);
  }
}

// ── CONFIG PREVIEW ───────────────────────────────
function syntaxHighlight(json) {
  return json
    .replace(/("[\w]+")\s*:/g, '<span class="k">$1</span>:')
    .replace(/:\s*(".*?")/g, ': <span class="s">$1</span>')
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="n">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="b">$1</span>');
}

function buildConfigFromState() {
  const imageLayers=[], textLayers=[], expressionControls=[];
  const usedKeys = {};

  function uniqueKey(base) {
    if (!usedKeys[base]) { usedKeys[base]=1; return base; }
    return base + '_' + String(++usedKeys[base]).padStart(2,'0');
  }

  for (const l of allLayers) {
    if (!kept[l.id]) continue;
    const label = labels[l.id] || l.defaultLabel || l.layerName;
    const f = l.fields;
    const key = uniqueKey(l.key);

    if (l.type === 'SOLID_INJECT') {
      imageLayers.push({key, compName:l.comp, layerName:l.layerName, type:'solid_replace', label,
        slotW:parseInt(f.slotW||f.compW||0), slotH:parseInt(f.slotH||f.compH||0),
        maskShape:f.maskShape||'rectangle', cornerRadius:parseInt(f.cornerRadius||0),
        absIn:l.absIn, absOut:l.absOut});
    } else if (l.type === 'IMAGE_INJECT') {
      imageLayers.push({key, compName:l.comp, layerName:l.layerName, type:'replace', label,
        width:parseInt(f.w||0), height:parseInt(f.h||0), absIn:l.absIn, absOut:l.absOut});
    } else if (l.type === 'TEXT_INJECT') {
      textLayers.push({key, compName:l.comp, layerName:l.layerName, label,
        defaultValue:f.val||'', absIn:l.absIn, absOut:l.absOut});
    } else if (l.type === 'EXPR_CONTROL') {
      expressionControls.push({key, compName:l.comp, layerName:l.layerName,
        effectName:f.effect||'', type:f.type||'', label, default:f.value||''});
    }
  }

  return {...DATA.meta, imageLayers, textLayers, expressionControls};
}

function updatePreview() {
  const config = buildConfigFromState();
  const json = JSON.stringify(config, null, 2);
  document.getElementById('config-preview').innerHTML = syntaxHighlight(json);
}

// ── SAVE ─────────────────────────────────────────
document.getElementById('save-btn').addEventListener('click', async () => {
  const res = await fetch('/save', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({kept, labels})
  });
  const data = await res.json();
  if (data.success) {
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(()=>toast.classList.remove('show'), 2500);
  }
});

// ── FILTER BUTTONS ───────────────────────────────
document.querySelectorAll('.filter-btns button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btns button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    applyFilter();
  });
});

// ── SEARCH INPUT ─────────────────────────────────
document.getElementById('search').addEventListener('input', e => doSearch(e.target.value));

// ── INIT ─────────────────────────────────────────
buildSceneList();
updateCounter();
updatePreview();
</script>
</body>
</html>`);
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
app.listen(3333, () => {
  const { layers, kept } = STATE;
  const total = layers.length;
  const kCount = Object.values(kept).filter(Boolean).length;
  console.log(`\nAootra Wizard v2 — "${templateName}"`);
  console.log(`Layers: ${total} total | ${kCount} auto-kept`);
  console.log(`Scenes: ${STATE.scenes.length} detected`);
  console.log(`\nServer: http://localhost:3333`);
  exec('start http://localhost:3333');
});