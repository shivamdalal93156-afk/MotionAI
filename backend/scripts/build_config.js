'use strict';

/**
 * build_config.js — Generates config.json from scan_result.txt + gemini_report.txt
 * Usage: node backend/scripts/build_config.js "Template Name"
 *
 * How it works:
 *   1. Parse scan_result.txt — gets ALL injectable layers with technical data
 *   2. Parse gemini_report.txt — gets what user actually changes (natural language)
 *   3. Cross-reference: keep only layers Gemini confirms are user-facing
 *   4. Apply smart filters for anything Gemini didn't mention
 *   5. Write config.json
 *
 * If gemini_report.txt doesn't exist — falls back to smart scan-only mode
 * (uses layer naming patterns + size filters to guess user-facing layers)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');

// ── CLI ────────────────────────────────────────────────────────────────────────
const templateName = process.argv[2];
if (!templateName) {
  console.error('Usage: node backend/scripts/build_config.js "Template Name"');
  process.exit(1);
}

// ── Paths ──────────────────────────────────────────────────────────────────────
const BACKEND_DIR   = path.resolve(__dirname, '..');
const TEMPLATE_DIR  = path.join(BACKEND_DIR, 'templates', templateName);
const SCAN_FILE     = path.join(TEMPLATE_DIR, 'scan_result.txt');
const GEMINI_FILE   = path.join(TEMPLATE_DIR, 'gemini_report.txt');
const CONFIG_OUT    = path.join(TEMPLATE_DIR, 'config.json');

// ── Internal asset blocklist ───────────────────────────────────────────────────
// Layer/comp names containing these are NEVER user-facing
const INTERNAL_NAME_PATTERNS = [
  'dirty', 'paper-crumpled', 'scotchtape', 'pushpin', 'steam',
  'police-flashing', 'sticker.png', 'background_0', 'badge.png',
  'cd.png', 'clip.png', 'dock_', 'envelopepostal', 'floorplan',
  'knot.png', 'map_0', 'palaroid.png', 'parkingviolation',
  'ticket_', 'warehouse', 'whileyouwereout', 'table.png', 'table mask',
  'clotheshanger', 'newspaper-big.png', 'newspaper-small.png',
  'newspaper-tall.png', 'businesscard_', 'cover_02', 'cover.png',
  'adjustment layer', 'corr_', '_corr', 'photo_position',
  'logo_scale', 'logo_mask', 'background_mask', 'black frame',
  'glass ', 'vignette', 'fade out', 'noise', 'shade',
];

// Text layer values that are clearly internal
const INTERNAL_TEXT_VALUES = [
  /^\d{1,2}$/, // single/double digit numbers (help numbering)
  /^help numbering$/i,
  /lorem ipsum/i,
  /sed ut perspiciatis/i,
  /excepteur sint/i,
  /nemo enim/i,
  /at vero eos/i,
  /itaque earum/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function parsePipeFields(line) {
  const parts = line.split('|');
  const result = {};
  for (let i = 1; i < parts.length; i++) {
    const idx = parts[i].indexOf(':');
    if (idx === -1) continue;
    result[parts[i].slice(0, idx).trim()] = parts[i].slice(idx + 1).trim();
  }
  return result;
}

function num(v) { return parseFloat(v) || 0; }

function toKey(s) {
  return s
    .replace(/^(\d+\s*[-–]\s*)/, '')
    .replace(/^(Photo_|FOOTAGE_|IMG_|DELETE)/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'layer';
}

function toLabel(s) {
  return s
    .replace(/^(\d+\s*[-–]\s*)/, '')
    .replace(/_(\d+)$/, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function dedupeKeys(items, field) {
  function base(k) { return k.replace(/_\d+$/, ''); }
  const seen = {};
  for (const it of items) { const b = base(it[field]); seen[b] = (seen[b] || 0) + 1; }
  const dupes = new Set(Object.keys(seen).filter(k => seen[k] > 1));
  const counters = {};
  for (const it of items) {
    const b = base(it[field]);
    if (dupes.has(b)) {
      counters[b] = (counters[b] || 0) + 1;
      it[field] = `${b}_${String(counters[b]).padStart(2, '0')}`;
    }
  }
}

function isInternalByName(name) {
  const lower = (name || '').toLowerCase();
  return INTERNAL_NAME_PATTERNS.some(p => lower.includes(p));
}

function isInternalTextValue(val) {
  return INTERNAL_TEXT_VALUES.some(p => p instanceof RegExp ? p.test(val) : val === p);
}

function getSceneForLayer(absIn, absOut, scenes, totalDur) {
  const effectiveOut = Math.min(absOut, totalDur);
  const effectiveIn  = Math.min(absIn, totalDur);
  if (totalDur > 0 && (effectiveOut - effectiveIn) / totalDur >= 0.85) return 'global';
  if (scenes.length === 0) return null;
  let bestScene = null, bestOverlap = 0;
  for (const s of scenes) {
    const overlap = Math.max(0, Math.min(effectiveOut, s.mainOut) - Math.max(effectiveIn, s.mainIn));
    if (overlap > bestOverlap) { bestOverlap = overlap; bestScene = s.name; }
  }
  return bestScene || scenes[0].name;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — PARSE scan_result.txt
// ─────────────────────────────────────────────────────────────────────────────

function parseScan() {
  if (!fs.existsSync(SCAN_FILE)) {
    console.error(`ERROR: scan_result.txt not found at ${SCAN_FILE}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(SCAN_FILE, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);

  let aepFile    = null;
  let renderComp = null;
  const scenes       = [];
  const textLayers   = [];
  const imageLayers  = [];  // IMAGE_INJECT
  const solidLayers  = [];  // SOLID_INJECT
  const exprControls = [];
  const toggleLayers = [];
  let mapAngles  = null;
  let mapMarkers = null;

  // Track seen comp+layer combos to deduplicate
  const seen = new Set();

  for (const line of lines) {
    if (line.toLowerCase().startsWith('aep:')) {
      aepFile = path.basename(line.slice(4).trim());
      continue;
    }

    if (line.startsWith('RENDER_COMP|')) {
      const f = parsePipeFields(line);
      const score = parseInt(f.score, 10) || 0;
      if (!renderComp || score > (renderComp.score || 0)) {
        const [w, h] = (f.res || '1920x1080').split('x').map(Number);
        renderComp = { name: f.name, dur: num(f.dur), fps: num(f.fps), width: w, height: h, score };
      }
      continue;
    }

    if (line.startsWith('SCENE|')) {
      const f = parsePipeFields(line);
      if (f.block) scenes.push({ name: f.block, mainIn: num(f.mainIn), mainOut: num(f.mainOut) });
      continue;
    }

    if (line.startsWith('TEXT_INJECT|')) {
      const f = parsePipeFields(line);
      const uid = `TEXT:${f.comp}:${f.layer}`;
      if (seen.has(uid)) continue;
      seen.add(uid);
      textLayers.push({
        comp: f.comp, layer: f.layer, val: f.val,
        absIn: num(f.absIn), absOut: num(f.absOut)
      });
      continue;
    }

    if (line.startsWith('SOLID_INJECT|')) {
      const f = parsePipeFields(line);
      const uid = `SOLID:${f.comp}:${f.layer}`;
      if (seen.has(uid)) continue;
      seen.add(uid);
      solidLayers.push({
        comp: f.comp, layer: f.layer,
        slotW: num(f.slotW || f.solidW), slotH: num(f.slotH || f.solidH),
        maskShape: f.maskShape || 'rectangle', cornerRadius: num(f.cornerRadius),
        absIn: num(f.absIn), absOut: num(f.absOut)
      });
      continue;
    }

    if (line.startsWith('IMAGE_INJECT|')) {
      const f = parsePipeFields(line);
      const uid = `IMAGE:${f.comp}:${f.layer}`;
      if (seen.has(uid)) continue;
      seen.add(uid);
      imageLayers.push({
        comp: f.comp, layer: f.layer, source: f.source,
        imageType: f.type || 'replace',
        w: num(f.w), h: num(f.h),
        maskShape: f.maskShape || 'rectangle',
        absIn: num(f.absIn), absOut: num(f.absOut)
      });
      continue;
    }

    if (line.startsWith('EXPR_CONTROL|')) {
      const f = parsePipeFields(line);
      // Skip sliders and internal controls
      const skipEffects = new Set([
        'horizontal position', 'vertical position', 'scale',
        'effect - dirty', 'effect - paper', 'effect - old',
        'effect - grayscale', 'effect - contrast', 'effect - saturation',
        'effect - cold', 'effect - vignette', 'effect - vignette 1',
        'effect - vignette 2', 'film noise', 'police flashing',
        'jalousie', 'shade color intensity', 'helping numbers',
        'blur', 'background start', 'background end',
        'background start 2', 'name box start', 'name box end',
        'menu box start', 'menu box end', 'info box start', 'info box end',
        'description box start', 'description box end',
        'info panel start', 'info panel end',
      ]);
      const effectLower = (f.effect || '').toLowerCase();
      if (f.type === 'slider' && !effectLower.includes('color')) continue;
      if (skipEffects.has(effectLower)) continue;
      if (f.type === 'color' || f.type === 'solid_color' || f.type === 'checkbox') {
        exprControls.push({
          comp: f.comp, layer: f.layer,
          effectName: f.effect, type: f.type, value: f.value
        });
      }
      continue;
    }

    if (line.startsWith('TOGGLE_LAYER|')) {
      const f = parsePipeFields(line);
      toggleLayers.push({
        comp: f.comp, layer: f.layer,
        defaultVisible: f.defaultVisible === 'true',
        type: f.type,
        centerX: num(f.centerX), centerY: num(f.centerY)
      });
      continue;
    }

    if (line.startsWith('MAP_ANGLES|')) {
      const f = parsePipeFields(line);
      mapAngles = {
        comp: f.comp, layer: f.layer,
        angleX_at_pt01: num(f.angleX_at_pt01), angleY_at_pt01: num(f.angleY_at_pt01),
        angleX_at_pt02: num(f.angleX_at_pt02), angleY_at_pt02: num(f.angleY_at_pt02)
      };
      continue;
    }

    if (line.startsWith('MAP_MARKERS|')) {
      const f = parsePipeFields(line);
      mapMarkers = { point01Time: num(f.point01Time), point02Time: num(f.point02Time) };
      continue;
    }
  }

  // Fallback AEP detection
  if (!aepFile) {
    const found = fs.readdirSync(TEMPLATE_DIR).filter(f => f.toLowerCase().endsWith('.aep'));
    aepFile = found[0] || null;
  }

  if (!renderComp) {
    console.error('ERROR: No RENDER_COMP found in scan_result.txt');
    process.exit(1);
  }

  return { aepFile, renderComp, scenes, textLayers, imageLayers, solidLayers, exprControls, toggleLayers, mapAngles, mapMarkers };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — PARSE gemini_report.txt (optional)
// Returns a GeminiContext object with signals about what's user-facing
// ─────────────────────────────────────────────────────────────────────────────

function parseGemini() {
  if (!fs.existsSync(GEMINI_FILE)) {
    console.log('  gemini_report.txt not found — using scan-only mode');
    return null;
  }

  const text = fs.readFileSync(GEMINI_FILE, 'utf8').toLowerCase();

  // Extract signals from Gemini's natural language description
  const ctx = {
    hasBackgroundImages: false,
    hasLogo:             false,
    hasIcons:            false,
    hasColors:           false,
    hasText:             false,
    hasAudio:            false,
    // Specific text types mentioned
    mentionsPhone:       false,
    mentionsEmail:       false,
    mentionsWebsite:     false,
    mentionsAddress:     false,
    mentionsPrice:       false,
    mentionsTitle:       false,
    mentionsRooms:       false,
    mentionsDescription: false,
    mentionsName:        false,
    mentionsSurname:     false,
    mentionsLogo:        false,
    // Raw text for keyword matching
    raw: text
  };

  if (/background|photo|image|footage|placeholder/.test(text))  ctx.hasBackgroundImages = true;
  if (/logo/.test(text))                                        ctx.hasLogo = true;
  if (/icon/.test(text))                                        ctx.hasIcons = true;
  if (/color|colour/.test(text))                                ctx.hasColors = true;
  if (/text|title|heading/.test(text))                          ctx.hasText = true;
  if (/audio|music|sound/.test(text))                           ctx.hasAudio = true;
  if (/phone|tel\./.test(text))                                 ctx.mentionsPhone = true;
  if (/email|mail|@/.test(text))                                ctx.mentionsEmail = true;
  if (/website|www\./.test(text))                               ctx.mentionsWebsite = true;
  if (/address|street|city/.test(text))                         ctx.mentionsAddress = true;
  if (/price|cost|\$|sale/.test(text))                          ctx.mentionsPrice = true;
  if (/main title|property title|central title|heading/.test(text)) ctx.mentionsTitle = true;
  if (/room|bedroom|bathroom|kitchen|living/.test(text))        ctx.mentionsRooms = true;
  if (/description|detail/.test(text))                          ctx.mentionsDescription = true;
  if (/name|visitor|badge/.test(text))                          ctx.mentionsName = true;
  if (/logo text|company name/.test(text))                      ctx.mentionsLogo = true;

  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — FILTER: decide what's user-facing
// Uses Gemini context + scan data + smart rules
// ─────────────────────────────────────────────────────────────────────────────

function shouldIncludeText(layer, gemini) {
  const layerLower = (layer.layer || '').toLowerCase();
  const valLower   = (layer.val  || '').toLowerCase();
  const compLower  = (layer.comp || '').toLowerCase();

  // Always skip internal by name
  if (isInternalByName(layer.layer)) return false;
  if (isInternalByName(layer.comp))  return false;

  // Always skip internal values
  if (isInternalTextValue(layer.val)) return false;

  // Skip very long lorem ipsum / placeholder text (>150 chars that look like filler)
  if (layer.val && layer.val.length > 150 && /lorem|perspiciatis|excepteur|nemo enim|vero eos|itaque/i.test(layer.val)) return false;

  // If no Gemini context, use scan-only heuristics
  if (!gemini) {
    // Keep text in comps named with numbers (01 -, 02 - etc) — these are usually user-facing
    if (/^\d+\s*[-–]/.test(layer.comp)) return true;
    // Keep text with human-readable values
    if (layer.val && layer.val.length > 2 && layer.val.length < 100) return true;
    return false;
  }

  // Gemini-guided filtering
  if (gemini.mentionsPhone    && /phone|tel/.test(layerLower + valLower + compLower)) return true;
  if (gemini.mentionsEmail    && /mail|email/.test(layerLower + valLower + compLower)) return true;
  if (gemini.mentionsWebsite  && /website|www/.test(layerLower + valLower + compLower)) return true;
  if (gemini.mentionsAddress  && /address|adress|street|city/.test(layerLower + valLower + compLower)) return true;
  if (gemini.mentionsPrice    && /price|sale|cost/.test(layerLower + valLower + compLower)) return true;
  if (gemini.mentionsTitle    && /title|main|centre|center|logo/.test(layerLower + compLower)) return true;
  if (gemini.mentionsRooms    && /room|exterior|bedroom|bathroom|kitchen|pool|garage/.test(layerLower + valLower + compLower)) return true;
  if (gemini.mentionsDescription && /description/.test(layerLower + compLower)) return true;
  if (gemini.mentionsName     && /name|surname|visitor/.test(layerLower)) return true;

  // Numbered comp pattern (03 - EXTERIOR, 04 - ROOM_1 etc) — always user-facing
  if (/^\d+\s*[-–]/.test(layer.comp)) return true;

  // Short human-readable values in non-internal comps
  if (layer.val && layer.val.length > 2 && layer.val.length < 80 && !isInternalByName(layer.comp)) return true;

  return false;
}

function shouldIncludeSolid(layer, gemini) {
  const layerLower = (layer.layer || '').toLowerCase();
  const compLower  = (layer.comp  || '').toLowerCase();

  if (isInternalByName(layer.layer)) return false;
  if (isInternalByName(layer.comp))  return false;

  // Named DELETE = user placeholder slot
  if (layer.layer === 'DELETE') return true;

  // Named Photo_XX = definitely user slot
  if (/^photo_/i.test(layer.layer)) return true;

  // Named FOOTAGE_XX = user slot
  if (/^footage_/i.test(layer.layer)) return true;

  // Skip tiny correction/logo-scale solids (slotW/H < 200)
  if (layer.slotW < 200 && layer.slotH < 200) return false;

  return true;
}

function shouldIncludeImage(layer, gemini) {
  const layerLower = (layer.layer  || '').toLowerCase();
  const compLower  = (layer.comp   || '').toLowerCase();
  const srcLower   = (layer.source || '').toLowerCase();

  if (isInternalByName(layer.layer))  return false;
  if (isInternalByName(layer.comp))   return false;
  if (isInternalByName(layer.source)) return false;

  // LOGO comp = user-facing if Gemini mentions logo
  if (compLower === 'logo' && gemini && gemini.hasLogo) return true;
  if (compLower === 'logo') return true; // always include logo

  // comp_inject type with empty comp = user slot
  if (layer.imageType === 'comp_inject') return true;

  return false;
}

function shouldIncludeExpr(ctrl, gemini) {
  if (!gemini) return true; // no Gemini = include all filtered exprs
  if (!gemini.hasColors) return false; // Gemini didn't mention colors

  // In real estate, master color controls are user-facing
  const effectLower = (ctrl.effectName || '').toLowerCase();

  // Skip per-comp internal colors
  if (/name box|menu box|info box|description box|info panel|background start|background end/.test(effectLower)) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — BUILD config.json
// ─────────────────────────────────────────────────────────────────────────────

function buildConfig(scan, gemini) {
  const { aepFile, renderComp, scenes, textLayers, imageLayers, solidLayers, exprControls, toggleLayers, mapAngles, mapMarkers } = scan;
  const totalDur = renderComp.dur;

  // ── Text layers ──────────────────────────────────────────────────────────────
  const filteredText = textLayers.filter(l => shouldIncludeText(l, gemini));
  const outText = filteredText.map(l => {
    const scene = getSceneForLayer(l.absIn, l.absOut, scenes, totalDur);
    return {
      key:       toKey(l.layer),
      compName:  l.comp,
      layerName: l.layer,
      label:     toLabel(l.layer),
      absIn:     l.absIn,
      absOut:    l.absOut,
      scene:     scene || renderComp.name
    };
  });
  dedupeKeys(outText, 'key');

  // ── Image layers (SOLID + IMAGE) ─────────────────────────────────────────────
  const outImages = [];

  // Solids
  for (const l of solidLayers) {
    if (!shouldIncludeSolid(l, gemini)) continue;
    const scene = getSceneForLayer(l.absIn, l.absOut, scenes, totalDur);
    outImages.push({
      key:          toKey(l.layer),
      compName:     l.comp,
      layerName:    l.layer,
      type:         'solid_replace',
      label:        toLabel(l.layer),
      slotW:        l.slotW,
      slotH:        l.slotH,
      maskShape:    l.maskShape,
      cornerRadius: l.cornerRadius,
      absIn:        l.absIn,
      absOut:       l.absOut,
      scene:        scene || renderComp.name
    });
  }

  // Images
  for (const l of imageLayers) {
    if (!shouldIncludeImage(l, gemini)) continue;
    const scene = getSceneForLayer(l.absIn, l.absOut, scenes, totalDur);
    outImages.push({
      key:       toKey(l.layer),
      compName:  l.comp,
      layerName: l.layer,
      type:      l.imageType === 'comp_inject' ? 'comp_inject' : 'replace',
      label:     toLabel(l.layer),
      absIn:     l.absIn,
      absOut:    l.absOut,
      scene:     scene || renderComp.name
    });
  }

  dedupeKeys(outImages, 'key');

  // ── Expression controls ──────────────────────────────────────────────────────
  const outExprs = exprControls
    .filter(ec => shouldIncludeExpr(ec, gemini))
    .map(ec => ({
      key:        toKey(ec.effectName),
      compName:   ec.comp,
      layerName:  ec.layer,
      effectName: ec.effectName,
      type:       ec.type,
      label:      toLabel(ec.effectName),
      default:    ec.value
    }));
  dedupeKeys(outExprs, 'key');

  // ── Icon/toggle layers ───────────────────────────────────────────────────────
  // For templates with SLIDE_IN_ICON pattern — expose icon choices
  let iconGroups = null;
  if (toggleLayers.length > 0 && gemini && gemini.hasIcons) {
    // Group toggles by comp
    const byComp = {};
    for (const tl of toggleLayers) {
      if (!byComp[tl.comp]) byComp[tl.comp] = [];
      byComp[tl.comp].push(tl);
    }

    // Get unique icon names from first group
    const firstComp = Object.keys(byComp)[0];
    const iconOptions = byComp[firstComp].map(tl => tl.layer);

    // Find which comps are icon slots (SLIDE_IN_ICON or SCENE_01_ICON pattern)
    const iconSlotComps = [...new Set(toggleLayers.map(tl => tl.comp))];

    iconGroups = {
      iconOptions,   // e.g. ['GUEST HOUSE', 'SECURITY', 'POOL', ...]
      iconSlots: iconSlotComps.filter(c => /slide_in_icon|scene_\d+_icon/i.test(c))
        .map(c => ({ compName: c, key: toKey(c), label: toLabel(c) }))
    };
  }

  // ── Scene map ────────────────────────────────────────────────────────────────
  const sceneMap = {};
  if (scenes.length > 0) {
    for (const s of scenes) sceneMap[s.name] = { mainIn: s.mainIn, mainOut: s.mainOut, keys: [] };
  } else {
    sceneMap[renderComp.name] = { mainIn: 0, mainOut: totalDur, keys: [] };
  }
  for (const l of [...outText, ...outImages]) {
    if (l.scene && l.scene !== 'global' && sceneMap[l.scene]) {
      sceneMap[l.scene].keys.push(l.key);
    }
  }

  // ── Assemble config ──────────────────────────────────────────────────────────
  const config = {
    name:       templateName,
    aepFile:    aepFile || `${templateName}.aep`,
    compName:   renderComp.name,
    fps:        renderComp.fps,
    duration:   renderComp.dur,
    resolution: { width: renderComp.width, height: renderComp.height },
    textLayers:         outText,
    imageLayers:        outImages,
    expressionControls: outExprs,
    sceneMap
  };

  if (iconGroups) config.iconGroups = iconGroups;

  if (mapAngles)  config.mapAngles  = mapAngles;
  if (mapMarkers) config.mapMarkers = mapMarkers;

  // Country layers for map templates
  if (toggleLayers.length > 0 && mapMarkers) {
    const countryCoordinates = {};
    for (const tl of toggleLayers) {
      const name = tl.layer.replace(/\s*Outlines?\s*$/i, '').trim();
      if (name) countryCoordinates[name] = { x: tl.centerX, y: tl.centerY };
    }
    config.countryCoordinates = countryCoordinates;
  }

  return config;
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT
// ─────────────────────────────────────────────────────────────────────────────

function printReport(config, hasGemini) {
  const solidCt   = config.imageLayers.filter(l => l.type === 'solid_replace').length;
  const replaceCt = config.imageLayers.filter(l => l.type === 'replace').length;
  const compCt    = config.imageLayers.filter(l => l.type === 'comp_inject').length;
  const sceneCt   = Object.keys(config.sceneMap).length;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`CONFIG BUILT: ${templateName}`);
  console.log(`  Mode         : ${hasGemini ? 'Gemini + Scan (hybrid)' : 'Scan only (no gemini_report.txt)'}`);
  console.log(`  Render comp  : ${config.compName} (${config.resolution.width}x${config.resolution.height}, ${config.fps}fps, ${config.duration.toFixed(1)}s)`);
  console.log(`  Scenes       : ${sceneCt}`);
  console.log(`  Text layers  : ${config.textLayers.length}`);
  if (solidCt)   console.log(`  Images       : ${solidCt} solid_replace`);
  if (replaceCt) console.log(`  Images       : ${replaceCt} replace`);
  if (compCt)    console.log(`  Images       : ${compCt} comp_inject`);
  console.log(`  Expr controls: ${config.expressionControls.length}`);
  if (config.iconGroups) {
    console.log(`  Icon options : ${config.iconGroups.iconOptions.length} (${config.iconGroups.iconSlots.length} slots)`);
  }
  console.log(`  Config out   : ${CONFIG_OUT}`);
  console.log('─'.repeat(60));

  // Print summary of what's in config
  if (config.textLayers.length > 0) {
    console.log('\n  TEXT LAYERS:');
    for (const l of config.textLayers) {
      console.log(`    [${l.scene}] ${l.label} (${l.compName})`);
    }
  }
  if (config.imageLayers.length > 0) {
    console.log('\n  IMAGE LAYERS:');
    for (const l of config.imageLayers) {
      console.log(`    [${l.scene}] ${l.label} — ${l.type} (${l.compName})`);
    }
  }
  if (config.expressionControls.length > 0) {
    console.log('\n  COLORS/CONTROLS:');
    for (const ec of config.expressionControls) {
      console.log(`    ${ec.label} = ${ec.default} (${ec.compName})`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log(`\nBUILD CONFIG: "${templateName}"`);

  if (!fs.existsSync(TEMPLATE_DIR)) {
    console.error(`ERROR: Template folder not found: ${TEMPLATE_DIR}`);
    process.exit(1);
  }

  // Step 1: Parse scan
  console.log('  Parsing scan_result.txt...');
  const scan = parseScan();
  console.log(`  Scan: ${scan.textLayers.length} text, ${scan.solidLayers.length} solid, ${scan.imageLayers.length} image, ${scan.exprControls.length} expr`);

  // Step 2: Parse Gemini (optional)
  console.log('  Parsing gemini_report.txt...');
  const gemini = parseGemini();
  if (gemini) {
    console.log(`  Gemini: bg=${gemini.hasBackgroundImages} logo=${gemini.hasLogo} icons=${gemini.hasIcons} colors=${gemini.hasColors}`);
  }

  // Step 3+4: Filter and build
  console.log('  Building config...');
  const config = buildConfig(scan, gemini);

  // Write
  fs.writeFileSync(CONFIG_OUT, JSON.stringify(config, null, 2), 'utf8');

  // Report
  printReport(config, !!gemini);
}

main();