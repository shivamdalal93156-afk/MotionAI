/**
 * Aootra Config Wizard v2
 * Usage: node wizard.js "Template Name"
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const templateName = process.argv[2];
if (!templateName) { console.error('Usage: node wizard.js "Template Name"'); process.exit(1); }

const TEMPLATE_DIR = path.join(__dirname, 'templates', templateName);
const SCAN_FILE    = path.join(TEMPLATE_DIR, 'scan_result.txt');
const CONFIG_FILE  = path.join(TEMPLATE_DIR, 'config.json');

if (!fs.existsSync(SCAN_FILE)) {
  console.error('scan_result.txt not found at: ' + SCAN_FILE);
  process.exit(1);
}

// ─── PARSER ──────────────────────────────────────────────────────────────────

function parseKVLine(line) {
  const pipeIdx = line.indexOf('|');
  if (pipeIdx === -1) return null;
  const type = line.substring(0, pipeIdx);
  const obj  = { __type: type };
  for (const seg of line.substring(pipeIdx + 1).split('|')) {
    const c = seg.indexOf(':');
    if (c === -1) continue;
    obj[seg.substring(0, c)] = seg.substring(c + 1);
  }
  return obj;
}

function parseScanFile(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const KNOWN = new Set(['RENDER_COMP','SOLID_INJECT','TEXT_INJECT','IMAGE_INJECT','EXPR_CONTROL']);
  let renderComp = null;
  const solids = [], texts = [], images = [], exprControls = [], unknowns = [];

  for (const line of lines) {
    const p = parseKVLine(line);
    if (!p) continue;
    const t = p.__type;
    if      (t === 'RENDER_COMP')  { if (!renderComp) renderComp = p; }
    else if (t === 'SOLID_INJECT') solids.push(p);
    else if (t === 'TEXT_INJECT')  texts.push(p);
    else if (t === 'IMAGE_INJECT') images.push(p);
    else if (t === 'EXPR_CONTROL') exprControls.push(p);
    else if (!KNOWN.has(t))        unknowns.push(p);
  }
  return { renderComp, solids, texts, images, exprControls, unknowns, rawLines: lines };
}

function extractAepFile(rawLines) {
  for (const line of rawLines) {
    if (line.startsWith('RENDER_COMP|')) {
      const p = parseKVLine(line);
      if (p && p.aep) return path.basename(p.aep);
    }
  }
  return '';
}

// ─── CONFIDENCE COLORING ─────────────────────────────────────────────────────

const RED_IMAGE_SOURCES = [
  'Dirty','paper-crumpled','ScotchTape','Pushpin','knot','steam','sticker',
  'Clip','Dock','Table','Warehouse','Map_0','Newspaper','Palaroid','Cover',
  'Badge','BusinessCard','CD','Ticket','FloorPlan','WhileYouWereOut',
  'ParkingViolation','EnvelopePostal','Police-Flashing','Background_0'
];
const RED_SLIDER_EFFECTS = [
  'Effect - Dirty','Effect - Paper','Effect - Old','Horizontal Position',
  'Vertical Position','Scale','Film Noise','Police Flashing','Jalousie','Shade Color Intensity'
];
const GREEN_SOLID = /^(Photo_\d+|Placeholder|DELETE|FOOTAGE_\d+|Logo|Bg)$/i;

function getColor(item) {
  const t = item.__type;
  if (t === 'SOLID_INJECT') return GREEN_SOLID.test(item.layer || '') ? 'green' : 'yellow';
  if (t === 'IMAGE_INJECT') {
    const src = item.source || item.layer || '';
    return RED_IMAGE_SOURCES.some(kw => src.includes(kw)) ? 'red' : 'yellow';
  }
  if (t === 'TEXT_INJECT') {
    if (/^Help Numbering$/i.test(item.layer || '')) return 'red';
    if (item.val && /^\d+$/.test(item.val.trim())) return 'red';
    if (item.val && item.val.trim() && !/lorem\s+ipsum/i.test(item.val)) return 'green';
    return 'yellow';
  }
  if (t === 'EXPR_CONTROL') {
    const ct = (item.type || '').toLowerCase();
    if ((ct === 'color' || ct === 'solid_color') && (/settings/i.test(item.layer||'') || /color/i.test(item.effect||''))) return 'green';
    if (ct === 'slider' && RED_SLIDER_EFFECTS.includes(item.effect||'')) return 'red';
    return 'yellow';
  }
  return 'yellow';
}

function getBadge(item) {
  const t = item.__type;
  if (t === 'SOLID_INJECT') return 'PHOTO';
  if (t === 'TEXT_INJECT')  return 'TEXT';
  if (t === 'IMAGE_INJECT') return 'VIDEO';
  if (t === 'EXPR_CONTROL') {
    const ct = (item.type||'').toLowerCase();
    if (ct === 'color' || ct === 'solid_color') return 'COLOR';
    if (ct === 'slider')   return 'SLIDER';
    if (ct === 'checkbox') return 'CHECKBOX';
    return 'CONTROL';
  }
  return 'UNKNOWN';
}

function cleanLabel(s) {
  if (!s) return 'Unnamed';
  return String(s).replace(/_/g,' ').replace(/(\d+)$/,' $1').replace(/\s+/g,' ').trim();
}

// ─── BUILD LAYERS + DUPLICATE DETECTION ──────────────────────────────────────

function buildLayers(parsed) {
  const { solids, texts, images, exprControls, unknowns } = parsed;
  const layers = [];
  let id = 0;

  // TRUE DUPLICATE = same layerName + same comp (exact match on both)
  // Different comp = different scene = NOT a duplicate
  const seen = new Map(); // key: "layerName|||comp" -> first id

  function isDupe(layerName, comp, type) {
    const key = (layerName||'') + '|||' + (comp||'') + '|||' + type;
    if (seen.has(key)) return seen.get(key); // returns id of original
    seen.set(key, id);
    return false;
  }

  for (const s of solids) {
    const dupeOf = isDupe(s.layer, s.comp, 'SOLID');
    layers.push({ id:id++, __type:'SOLID_INJECT', comp:s.comp, layer:s.layer,
      compW:s.compW, compH:s.compH, slotW:s.slotW, slotH:s.slotH,
      maskShape:s.maskShape, cornerRadius:s.cornerRadius, absIn:s.absIn, absOut:s.absOut,
      color:getColor(s), badge:getBadge(s), defaultLabel:cleanLabel(s.layer),
      dupeOf: dupeOf !== false ? dupeOf : null });
  }
  for (const t of texts) {
    const dupeOf = isDupe(t.layer, t.comp, 'TEXT');
    layers.push({ id:id++, __type:'TEXT_INJECT', comp:t.comp, layer:t.layer,
      val:t.val, absIn:t.absIn, absOut:t.absOut,
      color:getColor(t), badge:getBadge(t), defaultLabel:cleanLabel(t.layer),
      dupeOf: dupeOf !== false ? dupeOf : null });
  }
  for (const img of images) {
    const dupeOf = isDupe(img.layer, img.comp, 'IMAGE');
    layers.push({ id:id++, __type:'IMAGE_INJECT', comp:img.comp, layer:img.layer,
      source:img.source, w:img.w, h:img.h, maskShape:img.maskShape, absIn:img.absIn, absOut:img.absOut,
      color:getColor(img), badge:getBadge(img), defaultLabel:cleanLabel(img.layer),
      dupeOf: dupeOf !== false ? dupeOf : null });
  }
  for (const ec of exprControls) {
    const dupeOf = isDupe(ec.effect||ec.layer, ec.comp, 'EXPR');
    layers.push({ id:id++, __type:'EXPR_CONTROL', comp:ec.comp, layer:ec.layer,
      effect:ec.effect, type:ec.type, value:ec.value, hasKeyframes:ec.hasKeyframes,
      color:getColor(ec), badge:getBadge(ec), defaultLabel:cleanLabel(ec.effect||ec.layer),
      dupeOf: dupeOf !== false ? dupeOf : null });
  }
  for (const u of unknowns) {
    const displayName = u.layer||u.name||u.effect||u.source||u.__type;
    layers.push({ id:id++, __type:'UNKNOWN', _rawType:u.__type, comp:u.comp||'',
      layer:displayName, _rawFields:JSON.stringify(u),
      color:'yellow', badge:'UNKNOWN', defaultLabel:cleanLabel(displayName), dupeOf:null });
  }

  // ── GROUPING ─────────────────────────────────────────────────────────────
  // Group by layerName only (NOT comp) — so Photo_01 in Scene_01 and Scene_02
  // appear together for human review, but remain separate config entries.
  // Key: normalized layer name
  const groupMap = new Map();
  for (const l of layers) {
    const gkey = (l.layer||'').toLowerCase().trim();
    if (!groupMap.has(gkey)) groupMap.set(gkey, []);
    groupMap.get(gkey).push(l.id);
  }
  // Attach groupId and groupSize to each layer
  let gid = 0;
  for (const [, members] of groupMap) {
    const groupId = members.length > 1 ? gid++ : null;
    for (const lid of members) {
      const l = layers.find(x => x.id === lid);
      l.groupId   = groupId;
      l.groupSize = members.length;
      l.groupMembers = members; // all layer ids in this group
    }
  }

  return layers;
}

// ─── CONFIG BUILDER ──────────────────────────────────────────────────────────

function makeKey(label, used) {
  let base = String(label||'item').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  if (!base) base = 'item';
  let key = base; let n = 1;
  while (used.has(key)) key = base + '_' + (++n);
  used.add(key);
  return key;
}

function buildConfig(renderComp, aepFile, selections, layers) {
  const used = new Set();
  const fps      = renderComp ? parseFloat(renderComp.fps) : 0;
  const duration = renderComp ? parseFloat(renderComp.dur) : 0;
  const res      = renderComp ? (renderComp.res||'1920x1080') : '1920x1080';
  const [rw, rh] = res.split('x').map(Number);
  const compName = renderComp ? renderComp.name : '';
  const imageLayers=[], textLayers=[], expressionControls=[];

  for (const sel of selections) {
    if (!sel.keep) continue;
    const layer = layers.find(l => l.id === sel.id);
    if (!layer) continue;
    // Skip true duplicates — original already included
    if (layer.dupeOf !== null) continue;
    const label = sel.label || layer.defaultLabel;
    const key   = makeKey(label, used);
    if (layer.__type === 'SOLID_INJECT') {
      imageLayers.push({ key, compName:layer.comp, layerName:layer.layer, type:'solid_replace', label,
        slotW:parseInt(layer.slotW)||0, slotH:parseInt(layer.slotH)||0,
        maskShape:layer.maskShape||'rectangle', cornerRadius:parseInt(layer.cornerRadius)||0,
        absIn:parseFloat(layer.absIn)||0, absOut:parseFloat(layer.absOut)||0 });
    } else if (layer.__type === 'IMAGE_INJECT') {
      imageLayers.push({ key, compName:layer.comp, layerName:layer.layer, type:'replace', label,
        absIn:parseFloat(layer.absIn)||0, absOut:parseFloat(layer.absOut)||0 });
    } else if (layer.__type === 'TEXT_INJECT') {
      textLayers.push({ key, compName:layer.comp, layerName:layer.layer, label,
        absIn:parseFloat(layer.absIn)||0, absOut:parseFloat(layer.absOut)||0 });
    } else if (layer.__type === 'EXPR_CONTROL') {
      expressionControls.push({ key, compName:layer.comp, layerName:layer.layer,
        effectName:layer.effect, type:layer.type, label, default:layer.value });
    }
  }
  return { name:templateName, aepFile, compName, fps, duration,
    resolution:{width:rw,height:rh}, imageLayers, textLayers, expressionControls };
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function buildHTML(layers, templateName) {
  const layersJSON = JSON.stringify(layers)
    .replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aootra Wizard — ${templateName}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0e0f11;--surface:#161719;--surface2:#1d1e21;--border:#2a2b2f;
  --text:#e8e9ec;--muted:#6b6e78;
  --green:#3dd68c;--green-dim:rgba(61,214,140,.12);
  --yellow:#f5c542;--yellow-dim:rgba(245,197,66,.10);
  --red:#f05252;--red-dim:rgba(240,82,82,.10);
  --blue:#4f9eff;--orange:#ff8c42;
  --mono:'IBM Plex Mono',monospace;--sans:'IBM Plex Sans',sans-serif;
}
body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh}

/* TOPBAR */
.topbar{position:sticky;top:0;z-index:100;background:var(--surface);border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;padding:10px 20px;gap:12px;flex-wrap:wrap}
.topbar-left{display:flex;align-items:center;gap:10px}
.logo{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.18em;color:var(--blue);
  background:rgba(79,158,255,.1);border:1px solid rgba(79,158,255,.25);padding:3px 8px;border-radius:4px}
.tname{font-family:var(--mono);font-size:13px;font-weight:500}
.topbar-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.counter{font-family:var(--mono);font-size:11px;color:var(--muted)}
.counter b{color:var(--green)}

/* SEARCH + FILTER */
.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.search-input{background:var(--surface2);border:1px solid var(--border);border-radius:5px;
  padding:5px 10px;font-family:var(--mono);font-size:11px;color:var(--text);width:200px;outline:none;transition:border-color .15s}
.search-input:focus{border-color:var(--blue)}
.filter-btn{background:var(--surface2);border:1px solid var(--border);border-radius:5px;
  padding:5px 10px;font-family:var(--mono);font-size:10px;color:var(--muted);cursor:pointer;
  letter-spacing:.05em;transition:all .12s}
.filter-btn.active{border-color:var(--blue);color:var(--blue);background:rgba(79,158,255,.1)}
.filter-btn:hover{border-color:var(--muted)}

/* BULK ACTIONS */
.bulk-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.bulk-btn{background:none;border:1px solid var(--border);border-radius:5px;padding:4px 12px;
  font-family:var(--mono);font-size:10px;color:var(--muted);cursor:pointer;letter-spacing:.04em;transition:all .12s}
.bulk-btn:hover{border-color:var(--text);color:var(--text)}
.bulk-btn.keep-all:hover{border-color:var(--green);color:var(--green)}
.bulk-btn.skip-all:hover{border-color:var(--red);color:var(--red)}
.btn-save{background:var(--green);color:#0a1a10;border:none;padding:7px 18px;border-radius:6px;
  font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.05em;cursor:pointer;transition:opacity .15s}
.btn-save:hover{opacity:.85}

/* MAIN LAYOUT */
.layout{display:flex;height:calc(100vh - 60px)}
.list-panel{flex:1;overflow-y:auto;padding:16px 20px 60px}
.preview-panel{width:320px;flex-shrink:0;border-left:1px solid var(--border);
  background:var(--surface);overflow-y:auto;padding:16px}
.preview-title{font-family:var(--mono);font-size:10px;letter-spacing:.15em;text-transform:uppercase;
  color:var(--muted);margin-bottom:12px}
.preview-json{font-family:var(--mono);font-size:10px;color:#a8b1c0;white-space:pre-wrap;word-break:break-all;line-height:1.6}

/* SECTION */
.section-hdr{font-family:var(--mono);font-size:10px;letter-spacing:.15em;text-transform:uppercase;
  color:var(--muted);margin:20px 0 8px;display:flex;align-items:center;gap:10px}
.section-hdr::after{content:'';flex:1;height:1px;background:var(--border)}

/* GROUP */
.group-block{border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden}
.group-header{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);
  cursor:pointer;user-select:none;border-bottom:1px solid var(--border)}
.group-header:hover{background:#222327}
.group-label{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--text);flex:1}
.group-count{font-family:var(--mono);font-size:10px;color:var(--muted)}
.group-arrow{font-size:9px;color:var(--muted);transition:transform .2s}
.group-arrow.open{transform:rotate(90deg)}
.group-body{display:none}.group-body.open{display:block}
.group-bulk{display:flex;gap:6px;padding:6px 12px;background:#12131500;border-bottom:1px solid var(--border)}

/* CARD */
.card{display:flex;align-items:stretch;border-bottom:1px solid var(--border);transition:opacity .15s,background .12s}
.card:last-child{border-bottom:none}
.card.kept{background:rgba(61,214,140,.04)}
.card.skipped{opacity:.35}
.card.dupe{opacity:.25}
.strip{width:3px;flex-shrink:0}
.strip.green{background:var(--green)}.strip.yellow{background:var(--yellow)}.strip.red{background:var(--red)}
.card-body{flex:1;padding:10px 12px;min-width:0}
.row1{display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap}
.badge{font-family:var(--mono);font-size:9px;font-weight:600;letter-spacing:.1em;
  padding:2px 6px;border-radius:3px;flex-shrink:0}
.badge.PHOTO  {background:rgba(79,158,255,.15);color:var(--blue);border:1px solid rgba(79,158,255,.25)}
.badge.TEXT   {background:rgba(245,197,66,.12);color:var(--yellow);border:1px solid rgba(245,197,66,.22)}
.badge.VIDEO  {background:rgba(160,100,255,.12);color:#a064ff;border:1px solid rgba(160,100,255,.22)}
.badge.COLOR  {background:rgba(61,214,140,.12);color:var(--green);border:1px solid rgba(61,214,140,.22)}
.badge.SLIDER {background:rgba(240,82,82,.12);color:var(--red);border:1px solid rgba(240,82,82,.22)}
.badge.CHECKBOX{background:rgba(245,197,66,.12);color:var(--yellow);border:1px solid rgba(245,197,66,.22)}
.badge.CONTROL,.badge.UNKNOWN{background:var(--surface2);color:var(--muted);border:1px solid var(--border)}
.badge.DUPE   {background:rgba(255,140,66,.12);color:var(--orange);border:1px solid rgba(255,140,66,.25)}
.lname{font-family:var(--mono);font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row2{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.meta{font-family:var(--mono);font-size:10px;color:var(--muted)}
.meta b{color:#8b8e99;font-weight:500}
.comp-tag{font-family:var(--mono);font-size:10px;color:var(--blue);
  background:rgba(79,158,255,.08);border:1px solid rgba(79,158,255,.15);
  padding:1px 6px;border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.card-actions{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;
  gap:6px;padding:10px 12px;flex-shrink:0}
.btn-group{display:flex;gap:4px}
.btn-keep,.btn-skip{border:none;padding:5px 12px;border-radius:4px;font-family:var(--mono);
  font-size:10px;font-weight:600;letter-spacing:.04em;cursor:pointer;transition:all .12s}
.btn-keep{background:var(--green-dim);color:var(--green);border:1px solid rgba(61,214,140,.3)}
.btn-keep:hover,.btn-keep.active{background:var(--green);color:#0a1a10;border-color:var(--green)}
.btn-skip{background:var(--red-dim);color:var(--red);border:1px solid rgba(240,82,82,.3)}
.btn-skip:hover,.btn-skip.active{background:var(--red);color:#fff;border-color:var(--red)}
.label-area{padding:0 12px 8px 15px;display:none;gap:8px;align-items:center;flex-wrap:wrap}
.label-area.visible{display:flex}
.label-area label{font-family:var(--mono);font-size:9px;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;flex-shrink:0}
.label-input{background:var(--surface2);border:1px solid var(--border);border-radius:4px;
  padding:4px 8px;font-family:var(--mono);font-size:11px;color:var(--text);width:200px;outline:none;transition:border-color .15s}
.label-input:focus{border-color:var(--blue)}

/* DUPE WARNING */
.dupe-note{font-family:var(--mono);font-size:9px;color:var(--orange);padding:3px 12px 6px 15px}

/* TOAST */
.toast{position:fixed;bottom:24px;right:24px;background:var(--surface2);border:1px solid var(--border);
  border-radius:8px;padding:10px 18px;font-family:var(--mono);font-size:11px;color:var(--text);
  z-index:999;transform:translateY(16px);opacity:0;transition:all .22s ease;pointer-events:none}
.toast.show{transform:translateY(0);opacity:1}
.toast.success{border-color:var(--green);color:var(--green)}
.toast.error{border-color:var(--red);color:var(--red)}

/* EMPTY */
.empty{font-family:var(--mono);font-size:11px;color:var(--muted);padding:20px 0;text-align:center}
</style>
</head><body>

<div class="topbar">
  <div class="topbar-left">
    <div class="logo">AOOTRA</div>
    <div class="tname">${templateName}</div>
  </div>
  <div class="topbar-right">
    <div class="toolbar">
      <input class="search-input" id="search" placeholder="Search layers…" oninput="applyFilters()">
      <button class="filter-btn active" data-filter="all" onclick="setFilter('all',this)">All</button>
      <button class="filter-btn" data-filter="green" onclick="setFilter('green',this)">🟢 Green</button>
      <button class="filter-btn" data-filter="yellow" onclick="setFilter('yellow',this)">🟡 Yellow</button>
      <button class="filter-btn" data-filter="red" onclick="setFilter('red',this)">🔴 Red</button>
      <button class="filter-btn" data-filter="kept" onclick="setFilter('kept',this)">Kept</button>
      <button class="filter-btn" data-filter="skipped" onclick="setFilter('skipped',this)">Skipped</button>
    </div>
    <div class="bulk-bar">
      <button class="bulk-btn keep-all" onclick="bulkAll(true)">Keep All Visible</button>
      <button class="bulk-btn skip-all" onclick="bulkAll(false)">Skip All Visible</button>
    </div>
    <div class="counter"><b id="kept-count">0</b> / <span id="total-count">0</span> kept</div>
    <button class="btn-save" id="btn-save">Save Config</button>
  </div>
</div>

<div class="layout">
  <div class="list-panel" id="list-panel"></div>
  <div class="preview-panel">
    <div class="preview-title">Live Config Preview</div>
    <div class="preview-json" id="preview-json">{ }</div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
(function() {
  var LAYERS = ${layersJSON};
  var state  = {};
  var currentFilter = 'all';
  var currentSearch = '';

  // ── INIT STATE ─────────────────────────────────────────────────────────────
  LAYERS.forEach(function(l) {
    // Dupes auto-skipped. Green = keep. Yellow/red = skip by default.
    state[l.id] = {
      keep:  l.dupeOf === null && l.color === 'green',
      label: l.defaultLabel || ''
    };
  });

  // ── COUNTER ────────────────────────────────────────────────────────────────
  function updateCounter() {
    var kept = 0;
    LAYERS.forEach(function(l) { if (state[l.id].keep && l.dupeOf === null) kept++; });
    document.getElementById('kept-count').textContent = kept;
    document.getElementById('total-count').textContent = LAYERS.filter(function(l){ return l.dupeOf === null; }).length;
    updatePreview();
  }

  // ── FILTER ─────────────────────────────────────────────────────────────────
  window.setFilter = function(f, btn) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    applyFilters();
  };

  window.applyFilters = function() {
    currentSearch = document.getElementById('search').value.toLowerCase().trim();
    // Show/hide cards based on filter
    document.querySelectorAll('.card[data-id]').forEach(function(card) {
      var id    = parseInt(card.getAttribute('data-id'));
      var layer = LAYERS.find(function(l){ return l.id === id; });
      var s     = state[id];
      var show  = true;

      if (currentFilter === 'green')   show = layer.color === 'green';
      if (currentFilter === 'yellow')  show = layer.color === 'yellow';
      if (currentFilter === 'red')     show = layer.color === 'red';
      if (currentFilter === 'kept')    show = s.keep && layer.dupeOf === null;
      if (currentFilter === 'skipped') show = !s.keep || layer.dupeOf !== null;

      if (show && currentSearch) {
        var haystack = ((layer.layer||'') + ' ' + (layer.comp||'') + ' ' + (layer.effect||'')).toLowerCase();
        show = haystack.includes(currentSearch);
      }

      card.style.display = show ? '' : 'none';
    });

    // Hide group blocks where all cards are hidden
    document.querySelectorAll('.group-block').forEach(function(gb) {
      var cards = gb.querySelectorAll('.card[data-id]');
      var anyVisible = false;
      cards.forEach(function(c){ if (c.style.display !== 'none') anyVisible = true; });
      gb.style.display = anyVisible ? '' : 'none';
    });

    // Hide ungrouped cards in sections
    document.querySelectorAll('.card-wrap[data-id]').forEach(function(cw) {
      var inner = cw.querySelector('.card[data-id]');
      cw.style.display = inner && inner.style.display !== 'none' ? '' : 'none';
    });
  };

  // ── BULK ───────────────────────────────────────────────────────────────────
  window.bulkAll = function(keep) {
    document.querySelectorAll('.card[data-id]').forEach(function(card) {
      if (card.style.display === 'none') return;
      var id = parseInt(card.getAttribute('data-id'));
      var layer = LAYERS.find(function(l){ return l.id === id; });
      if (layer && layer.dupeOf !== null) return; // never toggle dupes
      setCardState(id, keep);
    });
    updateCounter();
  };

  // ── TOGGLE ─────────────────────────────────────────────────────────────────
  window.toggle = function(id, keep) {
    setCardState(id, keep);
    updateCounter();
  };

  function setCardState(id, keep) {
    state[id].keep = keep;
    var card = document.querySelector('.card[data-id="'+id+'"]');
    if (!card) return;
    card.className = 'card' + (keep ? ' kept' : ' skipped');
    var bk = card.querySelector('.btn-keep');
    var bs = card.querySelector('.btn-skip');
    if (bk) bk.className = 'btn-keep' + (keep ? ' active' : '');
    if (bs) bs.className = 'btn-skip' + (!keep ? ' active' : '');
    var area = document.getElementById('label-area-'+id);
    if (area) area.className = 'label-area' + (keep ? ' visible' : '');
  }

  // ── CARD BUILDER ───────────────────────────────────────────────────────────
  function addMeta(row, label, value) {
    var span = document.createElement('span');
    span.className = 'meta';
    var b = document.createElement('b');
    b.textContent = label;
    span.appendChild(b);
    span.appendChild(document.createTextNode(' ' + value));
    row.appendChild(span);
  }

  function createCard(layer) {
    var s  = state[layer.id];
    var id = layer.id;
    var isDupe = layer.dupeOf !== null;

    var card = document.createElement('div');
    card.className = 'card' + (isDupe ? ' dupe' : (s.keep ? ' kept' : ' skipped'));
    card.setAttribute('data-id', id);

    var strip = document.createElement('div');
    strip.className = 'strip ' + layer.color;
    card.appendChild(strip);

    var body = document.createElement('div');
    body.className = 'card-body';

    var row1 = document.createElement('div');
    row1.className = 'row1';

    var badge = document.createElement('span');
    badge.className = 'badge ' + layer.badge;
    badge.textContent = layer.badge;
    row1.appendChild(badge);

    if (isDupe) {
      var dupeBadge = document.createElement('span');
      dupeBadge.className = 'badge DUPE';
      dupeBadge.textContent = 'DUPE';
      dupeBadge.title = 'Exact duplicate of layer #' + layer.dupeOf + ' (same name + same comp). Auto-skipped.';
      row1.appendChild(dupeBadge);
    }

    var nameEl = document.createElement('span');
    nameEl.className = 'lname';
    nameEl.textContent = layer.layer || layer.effect || '—';
    row1.appendChild(nameEl);
    body.appendChild(row1);

    var row2 = document.createElement('div');
    row2.className = 'row2';

    var compTag = document.createElement('span');
    compTag.className = 'comp-tag';
    compTag.textContent = layer.comp || '—';
    compTag.title = layer.comp || '';
    row2.appendChild(compTag);

    if (layer.__type === 'SOLID_INJECT' || layer.__type === 'IMAGE_INJECT') {
      var w = layer.slotW || layer.w || layer.compW || '';
      var h = layer.slotH || layer.h || layer.compH || '';
      if (w && h) addMeta(row2, 'size', w + 'x' + h);
    }
    if (layer.__type === 'TEXT_INJECT' && layer.val) {
      var preview = layer.val.length > 36 ? layer.val.slice(0,36)+'…' : layer.val;
      addMeta(row2, 'val', '"' + preview + '"');
    }
    if (layer.__type === 'EXPR_CONTROL') {
      addMeta(row2, 'type', layer.type || '—');
      addMeta(row2, 'val', layer.value || '—');
    }
    body.appendChild(row2);
    card.appendChild(body);

    // actions — hidden for dupes
    if (!isDupe) {
      var actions = document.createElement('div');
      actions.className = 'card-actions';
      var btnGroup = document.createElement('div');
      btnGroup.className = 'btn-group';

      var btnKeep = document.createElement('button');
      btnKeep.className = 'btn-keep' + (s.keep ? ' active' : '');
      btnKeep.textContent = 'Keep';
      btnKeep.addEventListener('click', (function(lid){ return function(){ toggle(lid, true); }; })(id));

      var btnSkip = document.createElement('button');
      btnSkip.className = 'btn-skip' + (!s.keep ? ' active' : '');
      btnSkip.textContent = 'Skip';
      btnSkip.addEventListener('click', (function(lid){ return function(){ toggle(lid, false); }; })(id));

      btnGroup.appendChild(btnKeep);
      btnGroup.appendChild(btnSkip);
      actions.appendChild(btnGroup);
      card.appendChild(actions);
    }

    // Wrap card + label area
    var wrap = document.createElement('div');
    wrap.setAttribute('data-id', id);
    wrap.appendChild(card);

    if (!isDupe) {
      var labelArea = document.createElement('div');
      labelArea.className = 'label-area' + (s.keep ? ' visible' : '');
      labelArea.id = 'label-area-' + id;

      var lbl = document.createElement('label');
      lbl.textContent = 'Label';
      labelArea.appendChild(lbl);

      var input = document.createElement('input');
      input.className = 'label-input';
      input.type = 'text';
      input.value = s.label || '';
      input.placeholder = 'User-facing label…';
      input.addEventListener('input', (function(lid){ return function(){ state[lid].label = this.value; updatePreview(); }; })(id));
      labelArea.appendChild(input);
      wrap.appendChild(labelArea);
    } else {
      var dupeNote = document.createElement('div');
      dupeNote.className = 'dupe-note';
      dupeNote.textContent = '⚠ Exact duplicate (same layer + same comp) — excluded from config automatically';
      wrap.appendChild(dupeNote);
    }

    return wrap;
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  function render() {
    var panel = document.getElementById('list-panel');
    panel.innerHTML = '';

    // Group layers by groupId. ungrouped (groupId===null) rendered individually.
    var grouped   = {}; // groupId -> [layers]
    var ungrouped = [];

    LAYERS.forEach(function(l) {
      if (l.groupId !== null && l.groupId !== undefined) {
        if (!grouped[l.groupId]) grouped[l.groupId] = [];
        grouped[l.groupId].push(l);
      } else {
        ungrouped.push(l);
      }
    });

    // Render by color sections for ungrouped, groups inline
    // Actually: render groups first (sorted by color of first member), then ungrouped
    // For clarity: separate into green / yellow / red sections
    function colorOrder(l) { return l.color==='green'?0:l.color==='yellow'?1:2; }

    // Collect all "items" — each item is either a single layer or a group
    var items = [];

    // Add groups
    Object.keys(grouped).forEach(function(gid) {
      var members = grouped[gid];
      var primaryColor = members[0].color; // color of first member
      items.push({ type:'group', gid:gid, members:members, color:primaryColor });
    });

    // Add ungrouped singles
    ungrouped.forEach(function(l) {
      items.push({ type:'single', layer:l, color:l.color });
    });

    // Sort by color section
    items.sort(function(a,b) { return colorOrder({color:a.color}) - colorOrder({color:b.color}); });

    var lastColor = null;

    items.forEach(function(item) {
      // Section header
      if (item.color !== lastColor) {
        lastColor = item.color;
        var labels = { green:'🟢 Likely Editable', yellow:'🟡 Uncertain', red:'🔴 Internal' };
        var hdr = document.createElement('div');
        hdr.className = 'section-hdr';
        hdr.textContent = labels[item.color] || item.color;
        panel.appendChild(hdr);
      }

      if (item.type === 'group') {
        // Group block
        var gb = document.createElement('div');
        gb.className = 'group-block';

        var gh = document.createElement('div');
        gh.className = 'group-header';

        var arrow = document.createElement('span');
        arrow.className = 'group-arrow';
        arrow.textContent = '▶';
        gh.appendChild(arrow);

        var glabel = document.createElement('span');
        glabel.className = 'group-label';
        glabel.textContent = item.members[0].layer || '—';
        gh.appendChild(glabel);

        var gcnt = document.createElement('span');
        gcnt.className = 'group-count';
        var nonDupes = item.members.filter(function(m){ return m.dupeOf===null; });
        gcnt.textContent = nonDupes.length + ' scenes' + (item.members.length > nonDupes.length ? ', ' + (item.members.length-nonDupes.length) + ' dupes' : '');
        gh.appendChild(gcnt);
        gb.appendChild(gh);

        var gbody = document.createElement('div');
        gbody.className = 'group-body';

        // Group bulk bar
        var gbulk = document.createElement('div');
        gbulk.className = 'group-bulk';
        var bk = document.createElement('button');
        bk.className = 'bulk-btn keep-all';
        bk.textContent = 'Keep all in group';
        bk.addEventListener('click', (function(members){ return function(e){
          e.stopPropagation();
          members.forEach(function(m){ if(m.dupeOf===null) setCardState(m.id,true); });
          updateCounter();
        }; })(item.members));
        var bs = document.createElement('button');
        bs.className = 'bulk-btn skip-all';
        bs.textContent = 'Skip all in group';
        bs.addEventListener('click', (function(members){ return function(e){
          e.stopPropagation();
          members.forEach(function(m){ if(m.dupeOf===null) setCardState(m.id,false); });
          updateCounter();
        }; })(item.members));
        gbulk.appendChild(bk);
        gbulk.appendChild(bs);
        gbody.appendChild(gbulk);

        item.members.forEach(function(l) {
          gbody.appendChild(createCard(l));
        });
        gb.appendChild(gbody);

        // Toggle open/close
        gh.addEventListener('click', function() {
          var open = gbody.classList.toggle('open');
          arrow.className = 'group-arrow' + (open ? ' open' : '');
        });

        panel.appendChild(gb);

      } else {
        // Single card
        var wrap = document.createElement('div');
        wrap.className = 'card-wrap';
        wrap.setAttribute('data-id', item.layer.id);
        wrap.appendChild(createCard(item.layer));
        panel.appendChild(wrap);
      }
    });

    updateCounter();
  }

  // ── LIVE PREVIEW ───────────────────────────────────────────────────────────
  function updatePreview() {
    var kept = 0;
    var lines = ['{'];
    var imageLayers = [], textLayers = [], exprControls = [];

    LAYERS.forEach(function(l) {
      if (!state[l.id].keep || l.dupeOf !== null) return;
      kept++;
      var label = state[l.id].label || l.defaultLabel;
      if (l.__type === 'SOLID_INJECT' || l.__type === 'IMAGE_INJECT') {
        imageLayers.push('    { "label": "' + label + '", "comp": "' + (l.comp||'') + '", "layer": "' + (l.layer||'') + '" }');
      } else if (l.__type === 'TEXT_INJECT') {
        textLayers.push('    { "label": "' + label + '", "comp": "' + (l.comp||'') + '", "layer": "' + (l.layer||'') + '" }');
      } else if (l.__type === 'EXPR_CONTROL') {
        exprControls.push('    { "label": "' + label + '", "effect": "' + (l.effect||'') + '", "type": "' + (l.type||'') + '" }');
      }
    });

    lines.push('  "imageLayers": [');
    lines.push(imageLayers.slice(0,5).join(',') + (imageLayers.length>5 ? ',    // ...+'+(imageLayers.length-5)+' more' : ''));
    lines.push('  ],');
    lines.push('  "textLayers": [');
    lines.push(textLayers.slice(0,5).join(',') + (textLayers.length>5 ? ',    // ...+'+(textLayers.length-5)+' more' : ''));
    lines.push('  ],');
    lines.push('  "expressionControls": [');
    lines.push(exprControls.slice(0,5).join(',') + (exprControls.length>5 ? ',    // ...+'+(exprControls.length-5)+' more' : ''));
    lines.push('  ]');
    lines.push('}');

    document.getElementById('preview-json').textContent = lines.join('');
    document.getElementById('kept-count').textContent = kept;
  }

  // ── SAVE ───────────────────────────────────────────────────────────────────
  async function saveConfig() {
    var selections = LAYERS.map(function(l) {
      return { id:l.id, keep:state[l.id].keep, label:state[l.id].label };
    });
    try {
      var resp = await fetch('/save', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ selections:selections })
      });
      var json = await resp.json();
      showToast(json.ok ? '✓ Saved → ' + json.path : '✗ ' + (json.error||'error'),
                json.ok ? 'success' : 'error');
    } catch(e) { showToast('Network error: '+e.message,'error'); }
  }

  function showToast(msg, type) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show '+(type||'');
    setTimeout(function(){ t.className='toast'; }, 3500);
  }

  document.getElementById('btn-save').addEventListener('click', saveConfig);
  render();
})();
</script>
</body></html>`;
}

// ─── SERVER ───────────────────────────────────────────────────────────────────

const content  = fs.readFileSync(SCAN_FILE, 'utf8');
const parsed   = parseScanFile(content);
const layers   = buildLayers(parsed);
const aepFile  = extractAepFile(parsed.rawLines);

const app = express();
app.use(express.json());

app.get('/', (_req, res) => res.send(buildHTML(layers, templateName)));

app.post('/save', (req, res) => {
  try {
    const config = buildConfig(parsed.renderComp, aepFile, req.body.selections, layers);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    res.json({ ok:true, path:CONFIG_FILE });
  } catch(e) {
    res.json({ ok:false, error:e.message });
  }
});

const PORT = 3333;
app.listen(PORT, () => {
  console.log('\n  Aootra Config Wizard v2');
  console.log('  Template : ' + templateName);
  console.log('  Layers   : ' + layers.length + ' total');
  console.log('  Dupes    : ' + layers.filter(l=>l.dupeOf!==null).length + ' auto-skipped');
  console.log('  URL      : http://localhost:' + PORT + '\n');
  exec('start http://localhost:' + PORT);
});