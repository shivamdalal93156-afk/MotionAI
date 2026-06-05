'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// probe.js  —  Auto-generate config.json for any Aootra template
// Usage:  node backend/scripts/probe.js "Template Name"
// ─────────────────────────────────────────────────────────────────────────────

// Load .env from project root (two levels up from backend/scripts/)
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const fs    = require('fs');
const path  = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');

const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');
const TEMP_BASE     = path.resolve(__dirname, '..', 'temp_probe');
const AE_PATH       = process.env.AE_PATH;

function findAerender() {
  const candidates = [
    'C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files\\aerender.exe',
    'C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\aerender.exe',
    'C:\\Program Files\\Adobe\\Adobe After Effects 2024\\Support Files\\aerender.exe',
    'C:\\Program Files\\Adobe\\Adobe After Effects\\Support Files\\aerender.exe',
  ];
  if (process.env.AERENDER_PATH && fs.existsSync(process.env.AERENDER_PATH)) return process.env.AERENDER_PATH;
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Parse scan_result.txt
// ─────────────────────────────────────────────────────────────────────────────
function parseScan(templateName) {
  const scanPath = path.join(TEMPLATES_DIR, templateName, 'scan_result.txt');
  if (!fs.existsSync(scanPath)) { console.error(`ERROR: scan_result.txt not found at ${scanPath}`); process.exit(1); }

  const lines = fs.readFileSync(scanPath, 'utf8').split(/\r?\n/);

  function parseFields(line) {
    const parts = line.split('|');
    const obj   = {};
    for (let i = 1; i < parts.length; i++) {
      const idx = parts[i].indexOf(':');
      if (idx === -1) continue;
      obj[parts[i].substring(0, idx).trim()] = parts[i].substring(idx + 1).trim();
    }
    return obj;
  }

  let aepFile      = null;
  let renderComps  = [];
  let scenes       = [];
  let injectables  = [];
  let exprControls = [];
  let toggleLayers = {};
  let mapAngles    = null;
  let mapMarkers   = null;

  const EXPR_SKIP_EFFECTS = new Set([
    'Effect - Vignette 1', 'Effect - Vignette 2',
    'Horizontal Position', 'Vertical Position', 'Scale',
    'Effect - Dirty', 'Effect - Paper', 'Effect - Old', 'Effect - Grayscale',
    'Effect - Contrast', 'Effect - Saturation', 'Effect - Cold', 'Effect - Vignette',
    'Film Noise', 'Police Flashing', 'Jalousie', 'Shade Color Intensity', 'Helping Numbers',
  ]);
  const EXPR_KEEP_TYPES = new Set(['color', 'solid_color', 'checkbox']);

  for (const line of lines) {
    if (line.startsWith('aep:')) { aepFile = path.basename(line.substring(4).trim()); continue; }

    const type = line.split('|')[0];

    if (type === 'RENDER_COMP') {
      const f    = parseFields(line);
      const [w, h] = (f.res || '1920x1080').split('x').map(Number);
      renderComps.push({ name: f.name, dur: parseFloat(f.dur) || 0, fps: parseFloat(f.fps) || 30, width: w, height: h, score: parseInt(f.score) || 0 });
    }
    else if (type === 'SCENE') {
      const f = parseFields(line);
      scenes.push({ name: f.block, mainIn: parseFloat(f.mainIn) || 0, mainOut: parseFloat(f.mainOut) || 0 });
    }
    else if (type === 'TEXT_INJECT') {
      const f = parseFields(line);
      // Fix 3 — skip Help Numbering and single-digit placeholder layers
      const layerLower = (f.layer || '').toLowerCase();
      if (layerLower.includes('help') || layerLower.includes('numbering') || /^\d$/.test((f.val || '').trim())) continue;
      injectables.push({ injectType: 'TEXT', comp: f.comp, layer: f.layer, absIn: parseFloat(f.absIn) || 0, absOut: parseFloat(f.absOut) || 0, font: f.font, size: f.size });
    }
    else if (type === 'SOLID_INJECT') {
      const f = parseFields(line);
      injectables.push({ injectType: 'SOLID', comp: f.comp, layer: f.layer, slotW: parseInt(f.slotW) || parseInt(f.compW) || 1920, slotH: parseInt(f.slotH) || parseInt(f.compH) || 1080, maskShape: f.maskShape || 'rectangle', cornerRadius: parseInt(f.cornerRadius) || 0, absIn: parseFloat(f.absIn) || 0, absOut: parseFloat(f.absOut) || 0 });
    }
    else if (type === 'IMAGE_INJECT') {
      const f = parseFields(line);
      injectables.push({ injectType: 'IMAGE', imageType: f.type || 'replace', comp: f.comp, layer: f.layer, source: f.source, w: parseInt(f.w) || 1920, h: parseInt(f.h) || 1080, ratio: f.ratio, maskShape: f.maskShape || 'rectangle', absIn: parseFloat(f.absIn) || 0, absOut: parseFloat(f.absOut) || 0 });
    }
    else if (type === 'EXPR_CONTROL') {
      const f = parseFields(line);
      // Fix 4 — skip non-color/checkbox types and blocked effect names
      if (!EXPR_KEEP_TYPES.has(f.type))    continue;
      if (EXPR_SKIP_EFFECTS.has(f.effect)) continue;
      exprControls.push({ compName: f.comp, layerName: f.layer, effectName: f.effect, type: f.type, value: f.value, hasKeyframes: f.hasKeyframes === 'true' });
    }
    else if (type === 'TOGGLE_LAYER') {
      const f = parseFields(line);
      if (!toggleLayers[f.comp]) toggleLayers[f.comp] = [];
      toggleLayers[f.comp].push({ layer: f.layer, centerX: parseInt(f.centerX) || 0, centerY: parseInt(f.centerY) || 0, defaultVisible: f.defaultVisible === 'true' });
    }
    else if (type === 'MAP_ANGLES') {
      const f = parseFields(line);
      mapAngles = { comp: f.comp, layer: f.layer, angleX_at_pt01: parseFloat(f.angleX_at_pt01), angleY_at_pt01: parseFloat(f.angleY_at_pt01), angleX_at_pt02: parseFloat(f.angleX_at_pt02), angleY_at_pt02: parseFloat(f.angleY_at_pt02) };
    }
    else if (type === 'MAP_MARKERS') {
      const f = parseFields(line);
      mapMarkers = { point01Time: parseFloat(f.point01Time), point02Time: parseFloat(f.point02Time) };
    }
  }

  renderComps.sort((a, b) => b.score - a.score);
  const bestComp = renderComps[0];
  if (!bestComp) { console.error('ERROR: No RENDER_COMP found in scan_result.txt'); process.exit(1); }

  return { aepFile, bestComp, scenes, injectables, exprControls, toggleLayers, mapAngles, mapMarkers };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Generate probe inject.jsx
// ─────────────────────────────────────────────────────────────────────────────
function safeId(str, idx) { return 'v_' + String(str).replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20) + '_' + idx; }
function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function buildProbeJsx(templateName, injectables, aepPath, tempAepPath, logPath, probeImagePath) {
  const aepFwd    = aepPath.replace(/\\/g, '/');
  const tempFwd   = tempAepPath.replace(/\\/g, '/');
  const logFwd    = logPath.replace(/\\/g, '/');
  const imgFwd    = probeImagePath.replace(/\\/g, '/');
  const tplDirFwd = path.join(TEMPLATES_DIR, templateName).replace(/\\/g, '/');

  const textBlocks = injectables.filter(l => l.injectType === 'TEXT').map((l, i) => {
    const id = safeId(l.comp + l.layer, i);
    return `
  (function() {
    var comp_${id} = null;
    for (var c = 1; c <= app.project.numItems; c++) {
      var it = app.project.item(c);
      if (it instanceof CompItem && it.name === '${esc(l.comp)}') { comp_${id} = it; break; }
    }
    if (!comp_${id}) { probelog('PROBE_TEXT_FAIL: ${esc(l.comp)}.${esc(l.layer)} :: comp not found'); return; }
    for (var L = 1; L <= comp_${id}.numLayers; L++) {
      var lyr_${id} = comp_${id}.layer(L);
      if (lyr_${id}.name === '${esc(l.layer)}') {
        try {
          lyr_${id}.property('Source Text').setValue(new TextDocument('45677'));
          probelog('PROBE_TEXT_OK: ${esc(l.comp)}.${esc(l.layer)}');
        } catch(e_${id}) { probelog('PROBE_TEXT_FAIL: ${esc(l.comp)}.${esc(l.layer)} :: ' + e_${id}.toString()); }
        return;
      }
    }
    probelog('PROBE_TEXT_FAIL: ${esc(l.comp)}.${esc(l.layer)} :: layer not found');
  })();`;
  }).join('\n');

  const solidBlocks = injectables.filter(l => l.injectType === 'SOLID').map((l, i) => {
    const id = safeId('S' + l.comp + l.layer, i);
    return `
  (function() {
    var comp_${id} = null;
    for (var c = 1; c <= app.project.numItems; c++) {
      var it = app.project.item(c);
      if (it instanceof CompItem && it.name === '${esc(l.comp)}') { comp_${id} = it; break; }
    }
    if (!comp_${id}) { probelog('PROBE_SOLID_FAIL: ${esc(l.comp)}.${esc(l.layer)} :: comp not found'); return; }
    var imgFile_${id} = new File('${esc(imgFwd)}');
    var newFtg_${id};
    try { newFtg_${id} = app.project.importFile(new ImportOptions(imgFile_${id})); } catch(ie_${id}) {
      probelog('PROBE_SOLID_FAIL: ${esc(l.comp)}.${esc(l.layer)} :: import failed ' + ie_${id}.toString()); return;
    }
    var replaced_${id} = false;
    for (var L = 1; L <= comp_${id}.numLayers; L++) {
      var lyr_${id} = comp_${id}.layer(L);
      try {
        if (lyr_${id}.source instanceof FootageItem && lyr_${id}.source.name === '${esc(l.layer)}') {
          lyr_${id}.replaceSource(newFtg_${id}, false);
          probelog('PROBE_SOLID_OK: ${esc(l.comp)}.${esc(l.layer)}');
          replaced_${id} = true; break;
        }
      } catch(re_${id}) {}
    }
    if (!replaced_${id}) {
      for (var pi = 1; pi <= app.project.numItems; pi++) {
        var pItem_${id} = app.project.item(pi);
        if (pItem_${id} instanceof FootageItem && pItem_${id}.name === '${esc(l.layer)}') {
          try { pItem_${id}.replace(imgFile_${id}); probelog('PROBE_SOLID_OK: ${esc(l.comp)}.${esc(l.layer)}'); replaced_${id} = true; } catch(pe_${id}) { probelog('PROBE_SOLID_FAIL: ${esc(l.comp)}.${esc(l.layer)} :: ' + pe_${id}.toString()); }
          break;
        }
      }
    }
    if (!replaced_${id}) probelog('PROBE_SOLID_FAIL: ${esc(l.comp)}.${esc(l.layer)} :: layer not found');
  })();`;
  }).join('\n');

  const imageBlocks = injectables.filter(l => l.injectType === 'IMAGE').map((l, i) => {
    const id = safeId('I' + l.comp + l.layer, i);
    return `
  (function() {
    var imgFile_${id} = new File('${esc(imgFwd)}');
    var comp_${id} = null;
    for (var c = 1; c <= app.project.numItems; c++) {
      var it = app.project.item(c);
      if (it instanceof CompItem && it.name === '${esc(l.comp)}') { comp_${id} = it; break; }
    }
    if (!comp_${id}) { probelog('PROBE_IMAGE_FAIL: ${esc(l.comp)}.${esc(l.layer)} :: comp not found'); return; }
    try {
      var newFtg_${id} = app.project.importFile(new ImportOptions(imgFile_${id}));
      for (var L = 1; L <= comp_${id}.numLayers; L++) {
        var lyr_${id} = comp_${id}.layer(L);
        try {
          if (lyr_${id}.source instanceof FootageItem) {
            var isSolid_${id} = false;
            try { isSolid_${id} = (lyr_${id}.source.mainSource instanceof SolidSource); } catch(x_${id}) {}
            if (!isSolid_${id}) { lyr_${id}.replaceSource(newFtg_${id}, false); probelog('PROBE_IMAGE_OK: ${esc(l.comp)}.${esc(l.layer)}'); return; }
          }
        } catch(le_${id}) {}
      }
      probelog('PROBE_IMAGE_FAIL: ${esc(l.comp)}.${esc(l.layer)} :: no footage layer found');
    } catch(e_${id}) { probelog('PROBE_IMAGE_FAIL: ${esc(l.comp)}.${esc(l.layer)} :: ' + e_${id}.toString()); }
  })();`;
  }).join('\n');

  return `// Aootra probe.js — ExtendScript ES3
// Template: ${templateName}  Generated: ${new Date().toISOString()}

var _probeLog = new File('${logFwd}');
_probeLog.open('w');
function probelog(msg) { _probeLog.writeln(msg); }

try {
  var projFile = new File('${aepFwd}');
  if (!projFile.exists) { probelog('PROBE_FATAL: AEP not found at ${aepFwd}'); _probeLog.close(); app.quit(); }

  app.beginSuppressDialogs();
  app.open(projFile);
  probelog('PROBE_PROJECT_OPEN: ' + app.project.numItems + ' items');

  for (var ri = 1; ri <= app.project.numItems; ri++) {
    var rItem = app.project.item(ri);
    if (!(rItem instanceof FootageItem)) continue;
    if (!rItem.mainSource || rItem.mainSource.isMissing) {
      var rFile = new File('${tplDirFwd}/' + rItem.name);
      if (rFile.exists) { rItem.replace(rFile); }
    }
  }

  ${textBlocks}
  ${solidBlocks}
  ${imageBlocks}

  app.project.gpuAccelType = GpuAccelType.SOFTWARE;
  var tempFile = new File('${tempFwd}');
  app.project.save(tempFile);
  probelog('PROBE_SAVE_COMPLETE');
  _probeLog.close();
  app.endSuppressDialogs(false);
  app.quit();
} catch(globalErr) {
  probelog('PROBE_EXCEPTION: ' + globalErr.toString());
  try { app.endSuppressDialogs(false); } catch(x) {}
  _probeLog.close();
  app.quit();
}
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Spawn helper
// ─────────────────────────────────────────────────────────────────────────────
function spawnWithTimeout(exe, args, timeoutMs) {
  return new Promise((resolve) => {
    const cleanArgs = args.map(a => String(a).replace(/^"|"$/g, ''));
    const child = spawn(exe, cleanArgs, { shell: false, detached: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; try { child.kill('SIGKILL'); } catch {} resolve({ code: -1, stdout, stderr, timedOut: true }); }
    }, timeoutMs);
    child.on('close', code => { if (!done) { done = true; clearTimeout(timer); resolve({ code, stdout, stderr, timedOut: false }); } });
    child.on('error', err  => { if (!done) { done = true; clearTimeout(timer); resolve({ code: -1, stdout, stderr: err.message, timedOut: false }); } });
  });
}

function killAE() {
  try { require('child_process').execSync('taskkill /F /IM AfterFX.com /T', { stdio: 'pipe' }); } catch {}
  try { require('child_process').execSync('taskkill /F /IM AfterFX.exe /T', { stdio: 'pipe' }); } catch {}
  return new Promise(r => setTimeout(r, 3000));
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Read probe_log.txt
// ─────────────────────────────────────────────────────────────────────────────
function readProbeLog(logPath) {
  if (!fs.existsSync(logPath)) return { ok: {}, fails: [] };
  const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/);
  const ok = {}, fails = [];
  for (const line of lines) {
    if (line.startsWith('PROBE_TEXT_OK: '))  { ok[line.substring(15).trim()] = 'TEXT';  continue; }
    if (line.startsWith('PROBE_SOLID_OK: ')) { ok[line.substring(16).trim()] = 'SOLID'; continue; }
    if (line.startsWith('PROBE_IMAGE_OK: ')) { ok[line.substring(16).trim()] = 'IMAGE'; continue; }
    if (line.includes('_FAIL: '))            { fails.push(line.trim()); }
  }
  return { ok, fails };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Build config.json
// ─────────────────────────────────────────────────────────────────────────────

// Fix 1 — internal asset blocklist
const INTERNAL_NAMES = [
  'dirty', 'paper-crumpled', 'scotchtape', 'pushpin', 'steam.mp4',
  'police-flashing', 'sticker.png', 'background_0', 'cover.png',
  'badge.png', 'cd.png', 'clip.png', 'dock_', 'envelopepostal',
  'knot.png', 'palaroid.png', 'parkingviolation',
  'ticket_', 'whileyouwereout', 'table.png', 'table mask',
  'clotheshanger', 'newspaper-big.png', 'newspaper-small.png',
  'newspaper-tall.png', 'businesscard_', 'cover_02',
];
function isInternalAsset(layerName) {
  const lower = layerName.toLowerCase();
  return INTERNAL_NAMES.some(n => lower.includes(n));
}

function toKey(str) { return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function toLabel(str) { return str.replace(/^\d+\s*-\s*/, '').replace(/^Photo_/i, 'Photo ').replace(/^FOOTAGE_/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim(); }

function dedupeKeys(items, getKey) {
  const counts = {}, seen = {};
  for (const item of items) { const base = getKey(item).replace(/_\d+$/, ''); counts[base] = (counts[base] || 0) + 1; }
  return items.map(item => {
    const raw = getKey(item), base = raw.replace(/_\d+$/, '');
    if (counts[base] === 1) return raw;
    seen[base] = (seen[base] || 0) + 1;
    return `${base}_${String(seen[base]).padStart(2, '0')}`;
  });
}

// Fix 2 — scene assignment that handles precomp absOut > totalDur
function getSceneForLayer(absIn, absOut, scenes, totalDur) {
  // When absOut > totalDur the layer lives in a precomp that's longer than Main.
  // Overlap against the full clamped range is meaningless — every scene "overlaps"
  // the clamped [0, totalDur] window proportionally. Instead, pin the layer to the
  // scene that contains absIn (i.e. where it first appears in Main).
  if (absOut > totalDur) {
    if (scenes.length === 0) return null;
    // Find the scene whose window contains absIn
    for (const s of scenes) {
      if (absIn >= s.mainIn && absIn < s.mainOut) return s.name;
    }
    // absIn=0 (before the first scene) → use first scene
    return scenes[0].name;
  }

  // Normal case: layer lives entirely within Main comp duration.
  const span = absOut - absIn;
  if (span / totalDur >= 0.8) return 'global';
  if (scenes.length === 0) return null;

  let bestScene = null, bestOverlap = 0;
  for (const s of scenes) {
    const overlap = Math.max(0, Math.min(absOut, s.mainOut) - Math.max(absIn, s.mainIn));
    if (overlap > bestOverlap) { bestOverlap = overlap; bestScene = s.name; }
  }
  if (bestOverlap < 0.5 && span / totalDur >= 0.8) return 'global';
  return bestScene || scenes[0].name;
}

function buildConfig(templateName, scanData, okMap) {
  const { aepFile, bestComp, scenes, injectables, exprControls, toggleLayers, mapAngles, mapMarkers } = scanData;
  const totalDur = bestComp.dur;

  const confirmedInjectables = injectables.filter(l => okMap[`${l.comp}.${l.layer}`]);

  // image layers — Fix 1: skip internal assets
  const imageItems = confirmedInjectables.filter(l =>
    (l.injectType === 'SOLID' || l.injectType === 'IMAGE') && !isInternalAsset(l.layer)
  );
  const imageKeys = dedupeKeys(imageItems, l => toKey(l.layer));
  const imageLayers = imageItems.map((l, i) => {
    const scene = getSceneForLayer(l.absIn, l.absOut, scenes, totalDur);
    const type  = l.injectType === 'SOLID' ? 'solid_replace' : (l.imageType === 'replace' ? 'replace' : 'comp_inject');
    const obj   = { key: imageKeys[i], compName: l.comp, layerName: l.layer, type, label: toLabel(l.layer), absIn: l.absIn, absOut: l.absOut };
    if (l.slotW !== undefined)        obj.slotW        = l.slotW;
    if (l.slotH !== undefined)        obj.slotH        = l.slotH;
    if (l.maskShape)                  obj.maskShape    = l.maskShape;
    if (l.cornerRadius !== undefined) obj.cornerRadius = l.cornerRadius;
    if (scene)                        obj.scene        = scene;
    return obj;
  });

  // text layers
  const textItems = confirmedInjectables.filter(l => l.injectType === 'TEXT');
  const textKeys  = dedupeKeys(textItems, l => toKey(l.layer));
  const textLayers = textItems.map((l, i) => {
    const scene = getSceneForLayer(l.absIn, l.absOut, scenes, totalDur);
    const obj   = { key: textKeys[i], compName: l.comp, layerName: l.layer, label: toLabel(l.layer), absIn: l.absIn, absOut: l.absOut };
    if (scene) obj.scene = scene;
    return obj;
  });

  // expression controls — from scan only, not probe-tested
  const exprKeys = dedupeKeys(exprControls, ec => toKey(ec.effectName));
  const expressionControls = exprControls.map((ec, i) => ({
    key: exprKeys[i], compName: ec.compName, layerName: ec.layerName,
    effectName: ec.effectName, type: ec.type, label: toLabel(ec.effectName), default: ec.value,
  }));

  // scene map — Fix: only include keys for non-internal layers
  const sceneMap = {};
  for (const sc of scenes) sceneMap[sc.name] = { mainIn: sc.mainIn, mainOut: sc.mainOut, keys: [] };
  for (const il of imageLayers) {
    if (il.scene && il.scene !== 'global' && sceneMap[il.scene]) sceneMap[il.scene].keys.push(il.key);
  }
  for (const tl of textLayers) {
    if (tl.scene && tl.scene !== 'global' && sceneMap[tl.scene]) sceneMap[tl.scene].keys.push(tl.key);
  }

  const config = {
    name:       templateName,
    aepFile:    aepFile || `${templateName}.aep`,
    compName:   bestComp.name,
    fps:        bestComp.fps,
    duration:   bestComp.dur,
    resolution: { width: bestComp.width, height: bestComp.height },
  };

  if (mapMarkers) { config.point01Time = mapMarkers.point01Time; config.point02Time = mapMarkers.point02Time; }
  if (mapAngles)  { config.mapCalibration = { p1: { x: 0, y: 0, angleX: mapAngles.angleX_at_pt01, angleY: mapAngles.angleY_at_pt01 }, p2: { x: 0, y: 0, angleX: mapAngles.angleX_at_pt02, angleY: mapAngles.angleY_at_pt02 } }; }

  config.textLayers         = textLayers;
  config.imageLayers        = imageLayers;
  config.expressionControls = expressionControls;
  if (Object.keys(sceneMap).length > 0) config.sceneMap = sceneMap;

  const hasToggles = Object.keys(toggleLayers).length > 0;
  if (hasToggles && mapMarkers) {
    const firstToggleComp     = Object.keys(toggleLayers)[0];
    const countryCoordinates  = {};
    for (const entry of (toggleLayers[firstToggleComp] || [])) {
      const countryName = entry.layer.replace(/ Outlines$/, '').trim();
      countryCoordinates[countryName] = { x: entry.centerX, y: entry.centerY };
    }
    config.countryLayers = [
      { key: 'country_1', label: 'Country 1', compName: Object.keys(toggleLayers)[0] || 'Countries 01', angleControlComp: mapAngles ? mapAngles.comp : 'Main', angleControlLayer: mapAngles ? mapAngles.layer : 'Controller', angleXEffect: 'Angle X', angleYEffect: 'Angle Y', pointXSlider: 'Point 01 X Scale', pointYSlider: 'Point 01 Y Scale', pointTime: mapMarkers.point01Time },
      { key: 'country_2', label: 'Country 2', compName: Object.keys(toggleLayers)[1] || Object.keys(toggleLayers)[0] || 'Countries 02', angleControlComp: mapAngles ? mapAngles.comp : 'Main', angleControlLayer: mapAngles ? mapAngles.layer : 'Controller', angleXEffect: 'Angle X', angleYEffect: 'Angle Y', pointXSlider: 'Point 02 X Scale', pointYSlider: 'Point 02 Y Scale', pointTime: mapMarkers.point02Time },
    ];
    config.countryCoordinates = countryCoordinates;
  }

  return config;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const templateName = process.argv[2];
  if (!templateName) { console.error('Usage: node probe.js "Template Name"'); process.exit(1); }

  const templateDir = path.join(TEMPLATES_DIR, templateName);
  if (!fs.existsSync(templateDir)) { console.error(`ERROR: Template folder not found: ${templateDir}`); process.exit(1); }
  if (!AE_PATH || !fs.existsSync(AE_PATH)) { console.error('ERROR: AE_PATH not set or AfterFX.exe not found'); process.exit(1); }

  const aerenderPath = findAerender();
  if (!aerenderPath) { console.error('ERROR: aerender.exe not found'); process.exit(1); }

  console.log(`\nPROBE STARTING: ${templateName}`);
  console.log(`  AE:       ${AE_PATH}`);
  console.log(`  aerender: ${aerenderPath}`);

  const tempDir        = path.join(TEMP_BASE, templateName);
  fs.mkdirSync(tempDir, { recursive: true });

  const probeImagePath = path.join(tempDir, 'probe_test.jpg');
  const jsxPath        = path.join(tempDir, 'probe_inject.jsx');
  const tempAepPath    = path.join(tempDir, 'probe_project.aep');
  const probeLogPath   = path.join(tempDir, 'probe_log.txt');
  const renderOutPath  = path.join(tempDir, 'probe_output.mp4');

  // STEP 1
  console.log('\n[1/6] Parsing scan_result.txt...');
  const scanData = parseScan(templateName);
  const { bestComp, scenes, injectables, exprControls } = scanData;

  if (!scanData.aepFile) {
    const aepFiles = fs.readdirSync(templateDir).filter(f => f.endsWith('.aep'));
    if (aepFiles.length === 0) { console.error('ERROR: No .aep file found in template folder'); process.exit(1); }
    scanData.aepFile = aepFiles[0];
  }
  const fullAepPath = path.join(templateDir, scanData.aepFile);

  console.log(`  Render comp: ${bestComp.name} (${bestComp.width}x${bestComp.height}, ${bestComp.fps}fps, ${bestComp.dur.toFixed(1)}s)`);
  console.log(`  Scenes: ${scenes.length}  |  Candidates: ${injectables.length} (TEXT:${injectables.filter(l=>l.injectType==='TEXT').length} SOLID:${injectables.filter(l=>l.injectType==='SOLID').length} IMAGE:${injectables.filter(l=>l.injectType==='IMAGE').length})`);
  console.log(`  Expr controls: ${exprControls.length}`);

  // STEP 2
  console.log('\n[2/6] Creating probe image and inject.jsx...');
  await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 255, b: 255 } } }).jpeg().toFile(probeImagePath);
  const jsx = buildProbeJsx(templateName, injectables, fullAepPath, tempAepPath, probeLogPath, probeImagePath);
  fs.writeFileSync(jsxPath, jsx, 'utf8');
  console.log(`  JSX written: ${jsxPath}`);

  // STEP 3a — kill any leftover AE, then launch
  console.log('\n[3/6] Running AE injection (timeout 3min)...');
  await killAE();
  const aeResult = await spawnWithTimeout(AE_PATH, ['-r', jsxPath], 3 * 60 * 1000);
  console.log(`  AE exited ${aeResult.code}${aeResult.timedOut ? ' (TIMEOUT)' : ''}`);
  await killAE();

  // STEP 3b — aerender 1 frame
  let renderOk = false;
  if (fs.existsSync(tempAepPath)) {
    console.log('\n[4/6] Running aerender for 1 frame (timeout 3min)...');
    const arResult = await spawnWithTimeout(aerenderPath, ['-project', tempAepPath, '-comp', bestComp.name, '-output', renderOutPath, '-s', '1', '-e', '1', '-continueOnMissingFootage'], 3 * 60 * 1000);
    renderOk = arResult.code === 0;
    console.log(`  aerender exited ${arResult.code}${arResult.timedOut ? ' (TIMEOUT)' : ''}`);
  } else {
    console.warn('  SKIP aerender — probe AEP not created');
  }

  // STEP 4
  console.log('\n[5/6] Reading probe_log.txt...');
  if (!fs.existsSync(probeLogPath)) { console.error('ERROR: probe_log.txt not found — AE did not run or crashed immediately'); process.exit(1); }
  const { ok: okMap, fails } = readProbeLog(probeLogPath);
  console.log(`  Confirmed injectable: ${Object.keys(okMap).length}  |  Failed: ${fails.length}`);

  // STEP 5+6
  console.log('\n[6/6] Building config.json...');
  const config     = buildConfig(templateName, scanData, okMap);
  const configPath = path.join(templateDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

  const sceneType = scenes.length === 0 ? 'none'
    : scenes[0].name.toLowerCase().includes('camera') ? 'camera-based'
    : 'marker-based';

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROBE COMPLETE: ${templateName}
  Render comp: ${bestComp.name} (${bestComp.width}x${bestComp.height}, ${bestComp.fps}fps, ${bestComp.dur.toFixed(1)}s)
  Scenes detected: ${scenes.length} (${sceneType})
  Injectable layers found: ${Object.keys(okMap).length}
    - Images:              ${config.imageLayers.length}
    - Text:                ${config.textLayers.length}
    - Expression controls: ${config.expressionControls.length} (from scan, not probed)
  Render confirmed: ${renderOk ? 'YES ✓' : 'NO (config built from JSX log only)'}
  Config written to: ${configPath}
${fails.length > 0 ? '\n  FAILED injections (excluded from config):\n' + fails.map(f => '    - ' + f).join('\n') : '  No failed injections.'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Cleanup
  if (fails.length > 0) {
    for (const f of fs.readdirSync(tempDir)) {
      const fp = path.join(tempDir, f);
      if (fp !== probeLogPath) try { fs.rmSync(fp, { recursive: true, force: true }); } catch {}
    }
    console.log(`  Probe log kept: ${probeLogPath}`);
  } else {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(err => { console.error('PROBE ERROR:', err.message); process.exit(1); });