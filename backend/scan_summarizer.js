// scan_summarizer.js
// Run after scan_template.js to produce a compressed summary of the scan log.
// Usage: node scan_summarizer.js <templateName>
// Output: backend/templates/<templateName>/scan_summary.txt
//
// Full log is preserved at scan_result.txt
// Summary is what you paste to Claude for config generation

const fs   = require('fs');
const path = require('path');

const templateName = process.argv[2];
if (!templateName) {
  console.error('Usage: node scan_summarizer.js <templateName>');
  process.exit(1);
}

const templateDir = path.resolve(__dirname, 'templates', templateName);
const fullLogPath = path.join(templateDir, 'scan_result.txt');
const summaryPath = path.join(templateDir, 'scan_summary.txt');

if (!fs.existsSync(fullLogPath)) {
  console.error('Scan result not found: ' + fullLogPath);
  console.error('Run scan_template.js first.');
  process.exit(1);
}

const raw   = fs.readFileSync(fullLogPath, 'utf8');
const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

// ── Parse lines into structured data ─────────────────────────────────────────

function parseFields(line) {
  const parts  = line.split('|');
  const type   = parts[0];
  const fields = { _type: type };
  for (let i = 1; i < parts.length; i++) {
    const idx = parts[i].indexOf(':');
    if (idx === -1) { fields[parts[i]] = true; continue; }
    fields[parts[i].substring(0, idx)] = parts[i].substring(idx + 1);
  }
  return fields;
}

// Buckets
const renderComps     = [];
const compMarkers     = [];
const footageItems    = [];
const textInjectables = [];
const imageInjectables= [];
const solidInjectables= [];
const exprControls    = [];
const shapeColors     = [];
const audioLayers     = [];
const solidColors     = [];
const positionMarkers = [];
const toggleGroups    = [];
const toggleLayers    = [];
const scenes          = [];
const mapMarkers      = [];
const mapAngles       = [];
const plugins         = [];
const essentialProps  = [];
const projectFootage  = [];
let   sceneContainer  = null;
let   sceneType       = null;
let   footageSummary  = null;
let   scanComplete    = false;

for (const line of lines) {
  if (!line || line.startsWith('===') || line.startsWith('--') || line.startsWith('//')) continue;
  if (line === 'SCAN_COMPLETE') { scanComplete = true; continue; }

  const f = parseFields(line);
  switch (f._type) {
    case 'RENDER_COMP':      renderComps.push(f);      break;
    case 'COMP_MARKER':      compMarkers.push(f);      break;
    case 'FOOTAGE_ITEM':     footageItems.push(f);     break;
    case 'FOOTAGE_SUMMARY':  footageSummary = f;       break;
    case 'TEXT_INJECT':      textInjectables.push(f);  break;
    case 'IMAGE_INJECT':     imageInjectables.push(f); break;
    case 'SOLID_INJECT':     solidInjectables.push(f); break;
    case 'EXPR_CONTROL':     exprControls.push(f);     break;
    case 'SHAPE_COLOR':      shapeColors.push(f);      break;
    case 'AUDIO_LAYER':      audioLayers.push(f);      break;
    case 'SOLID_COLOR':      solidColors.push(f);      break;
    case 'POSITION_MARKER':  positionMarkers.push(f);  break;
    case 'TOGGLE_GROUP':     toggleGroups.push(f);     break;
    case 'TOGGLE_LAYER':     toggleLayers.push(f);     break;
    case 'SCENE':            scenes.push(f);           break;
    case 'SCENE_CONTAINER':  sceneContainer = f;       break;
    case 'SCENE_TYPE':       sceneType = f;            break;
    case 'MAP_MARKERS':      mapMarkers.push(f);       break;
    case 'MAP_ANGLES':       mapAngles.push(f);        break;
    case 'PLUGIN':           plugins.push(f);          break;
    case 'ESSENTIAL_PROP':   essentialProps.push(f);   break;
    case 'PROJECT_FOOTAGE':  projectFootage.push(f);   break;
  }
}

// ── Build summary ─────────────────────────────────────────────────────────────

const out = [];

function sec(title) { out.push(''); out.push('══ ' + title + ' ══'); }
function line(s)    { out.push(s); }

out.push('=== MOTIONAI SCAN SUMMARY v5.0 ===');
out.push('template: ' + templateName);
out.push('scan_complete: ' + scanComplete);

// ── Render comp ──────────────────────────────────────────────────────────────
sec('RENDER COMP');
const topRC = renderComps[0];
if (topRC) {
  line(`BEST_MATCH: "${topRC.name}" | ${topRC.res || (topRC.w+'x'+topRC.h)} | ${topRC.fps}fps | dur:${topRC.dur}s | confidence:${topRC.confidence}`);
  if (renderComps.length > 1) {
    line(`OTHER_CANDIDATES: ` + renderComps.slice(1).map(r => r.name).join(', '));
  }
}

// ── Plugins (critical — affects render compatibility) ───────────────────────
sec('THIRD PARTY PLUGINS');
if (plugins.length === 0) {
  line('NONE — all native AE effects');
} else {
  for (const p of plugins) {
    line(`PLUGIN: ${p.name} | matchName:${p.matchName} | vendor:${p.vendor}`);
  }
  line(`⚠ Template requires ${plugins.length} plugin(s) — must be installed on render machine`);
}

// ── Missing footage ──────────────────────────────────────────────────────────
sec('FOOTAGE STATUS');
const missingItems = footageItems.filter(f => f.missing === 'true');
const mediaItems   = footageItems.filter(f => f.isMedia === 'true');
line(`Total footage items: ${footageItems.length} | Media files: ${mediaItems.length} | MISSING: ${missingItems.length}`);
if (missingItems.length > 0) {
  line('⚠ MISSING FILES:');
  for (const m of missingItems) line(`  - ${m.name} (${m.w}x${m.h})`);
}

// ── Text injectables ─────────────────────────────────────────────────────────
sec('TEXT INJECTABLES');
line(`Count: ${textInjectables.length}`);
// Group by comp
const textByComp = {};
for (const t of textInjectables) {
  if (!textByComp[t.comp]) textByComp[t.comp] = [];
  textByComp[t.comp].push(t);
}
for (const comp in textByComp) {
  const layers = textByComp[comp];
  line(`  COMP: "${comp}" | ${layers.length} text layer(s):`);
  for (const t of layers) {
    line(`    LAYER: "${t.layer}" | val:"${t.val}" | font:${t.font||'?'} | size:${t.size||'?'} | align:${t.align||'?'} | animator:${t.hasAnimator} | absIn:${t.absIn} absOut:${t.absOut}`);
  }
}

// ── Image injectables ────────────────────────────────────────────────────────
sec('IMAGE INJECTABLES (replace / comp_inject)');
const compInjects   = imageInjectables.filter(i => i.type === 'comp_inject');
const replaceInjects = imageInjectables.filter(i => i.type === 'replace');
line(`comp_inject: ${compInjects.length} | replace: ${replaceInjects.length}`);

// Group comp_injects by dimensions
const compInjectGroups = {};
for (const ci of compInjects) {
  const key = `${ci.w}x${ci.h}`;
  if (!compInjectGroups[key]) compInjectGroups[key] = [];
  compInjectGroups[key].push(ci.comp);
}
for (const dim in compInjectGroups) {
  const comps = compInjectGroups[dim];
  line(`  COMP_INJECT ${dim} (ratio ${compInjects.find(c=>c.w+'x'+c.h===dim)?.ratio||'?'}): ${comps.length} slots → ${comps.slice(0,5).join(', ')}${comps.length>5?' ...+'+( comps.length-5)+' more':''}`);
}
for (const r of replaceInjects) {
  line(`  REPLACE: comp:"${r.comp}" layer:"${r.layer}" source:"${r.source}" ${r.w}x${r.h} ratio:${r.ratio} maskShape:${r.maskShape||'rectangle'} absIn:${r.absIn} absOut:${r.absOut}`);
}

// ── Solid injectables ────────────────────────────────────────────────────────
sec('SOLID INJECTABLES (photo slots)');
line(`Count: ${solidInjectables.length}`);
// Group by solidW x solidH
const solidGroups = {};
for (const s of solidInjectables) {
  const key = `${s.solidW}x${s.solidH}_${s.maskShape}`;
  if (!solidGroups[key]) solidGroups[key] = [];
  solidGroups[key].push(s);
}
for (const key in solidGroups) {
  const group = solidGroups[key];
  const first = group[0];
  const comps = group.map(s => `${s.layer}@${s.comp}`);
  line(`  SLOT ${first.solidW}x${first.solidH} maskShape:${first.maskShape}${first.cornerRadius>0?' cornerRadius:'+first.cornerRadius:''} ratio:${first.ratio} → ${group.length} slot(s):`);
  for (const s of group) {
    line(`    - layer:"${s.layer}" comp:"${s.comp}" absIn:${s.absIn} absOut:${s.absOut}`);
  }
}

// ── Expression controls ──────────────────────────────────────────────────────
sec('EXPRESSION CONTROLS');
line(`Count: ${exprControls.length}`);
// Group by type
const exprByType = {};
for (const e of exprControls) {
  if (!exprByType[e.type]) exprByType[e.type] = [];
  exprByType[e.type].push(e);
}
for (const type in exprByType) {
  const controls = exprByType[type];
  line(`  TYPE: ${type} | count:${controls.length}`);
  for (const e of controls) {
    line(`    comp:"${e.comp}" layer:"${e.layer}" effect:"${e.effect}" value:${e.value} hasKeyframes:${e.hasKeyframes}`);
  }
}

// ── Shape layer colors ────────────────────────────────────────────────────────
sec('SHAPE LAYER COLORS');
if (shapeColors.length === 0) {
  line('None detected');
} else {
  line(`Count: ${shapeColors.length}`);
  // Dedupe by hex
  const uniqueHex = {};
  for (const s of shapeColors) {
    if (!uniqueHex[s.hex]) uniqueHex[s.hex] = [];
    uniqueHex[s.hex].push(`${s.type}@${s.layer}`);
  }
  for (const hex in uniqueHex) {
    line(`  ${hex} → used by: ${uniqueHex[hex].slice(0,3).join(', ')}${uniqueHex[hex].length>3?' ...+more':''}`);
  }
}

// ── Solid colors (brand) ─────────────────────────────────────────────────────
sec('SOLID COLORS (brand/accent)');
if (solidColors.length === 0) {
  line('None detected');
} else {
  for (const s of solidColors) {
    line(`  comp:"${s.comp}" layer:"${s.layer}" hex:${s.hex}`);
  }
}

// ── Audio layers ─────────────────────────────────────────────────────────────
sec('AUDIO LAYERS');
if (audioLayers.length === 0) {
  line('None');
} else {
  for (const a of audioLayers) {
    line(`  comp:"${a.comp}" layer:"${a.layer}" source:"${a.source}" in:${a.in} out:${a.out}`);
  }
}

// ── Position markers ─────────────────────────────────────────────────────────
sec('POSITION MARKERS');
if (positionMarkers.length === 0) {
  line('None detected');
} else {
  line(`Count: ${positionMarkers.length}`);
  for (const p of positionMarkers) {
    line(`  comp:"${p.comp}" layer:"${p.layer}" type:${p.layerType} pos:${p.x},${p.y} compSize:${p.compW}x${p.compH}`);
  }
}

// ── Toggle layers ─────────────────────────────────────────────────────────────
sec('TOGGLE LAYERS');
if (toggleGroups.length === 0) {
  line('None detected');
} else {
  for (const g of toggleGroups) {
    line(`  GROUP: comp:"${g.comp}" type:${g.type} count:${g.count}${g.prefix?' prefix:'+g.prefix:''}`);
    const groupLayers = toggleLayers.filter(t => t.comp === g.comp);
    for (const t of groupLayers) {
      line(`    LAYER: "${t.layer}" defaultVisible:${t.defaultVisible} centerX:${t.centerX} centerY:${t.centerY}`);
    }
  }
}

// ── Comp markers ─────────────────────────────────────────────────────────────
sec('COMP MARKERS');
if (compMarkers.length === 0) {
  line('None');
} else {
  const markersByComp = {};
  for (const m of compMarkers) {
    if (!markersByComp[m.comp]) markersByComp[m.comp] = [];
    markersByComp[m.comp].push(m);
  }
  for (const comp in markersByComp) {
    const ms = markersByComp[comp];
    line(`  comp:"${comp}" → ` + ms.map(m => `"${m.comment||m.chapter}"@${m.time}`).join(', '));
  }
}

// ── Essential properties ─────────────────────────────────────────────────────
sec('ESSENTIAL PROPERTIES (MOGRT controls)');
if (essentialProps.length === 0) {
  line('None — template does not use Essential Properties');
} else {
  line(`Count: ${essentialProps.length}`);
  for (const e of essentialProps) {
    line(`  comp:"${e.comp}" layer:"${e.layer}" effect:"${e.effect||''}" prop:"${e.prop}" type:${e.type}`);
  }
}

// ── Scene structure ───────────────────────────────────────────────────────────
sec('SCENE STRUCTURE');
if (!sceneContainer) {
  line('Not detected');
} else {
  line(`Container: "${sceneContainer.name}" dur:${sceneContainer.dur}`);
  if (sceneType) line(`Type: ${sceneType._type}|${sceneType.camera_based||'precomp_based'} count:${sceneType.count||scenes.length}`);
  line(`Total scenes: ${scenes.length}`);
  for (const s of scenes) {
    line(`  SCENE: "${s.block}" in:${s.mainIn} out:${s.mainOut} dur:${s.dur}s footage:${s.footageCount||0} textLayers:${s.textLayers||''}`);
  }
}

// ── Map calibration ──────────────────────────────────────────────────────────
if (mapMarkers.length > 0) {
  sec('MAP CALIBRATION');
  for (const m of mapMarkers) {
    line(`  comp:"${m.comp}" point01:${m.point01Time}s point02:${m.point02Time}s`);
  }
  for (const a of mapAngles) {
    line(`  comp:"${a.comp}" layer:"${a.layer}"`);
    line(`    pt01 → angleX:${a.angleX_at_pt01} angleY:${a.angleY_at_pt01}`);
    line(`    pt02 → angleX:${a.angleX_at_pt02} angleY:${a.angleY_at_pt02}`);
  }
}

// ── Project level footage ─────────────────────────────────────────────────────
sec('PROJECT LEVEL FOOTAGE (potential project_replace candidates)');
if (projectFootage.length === 0) {
  line('None');
} else {
  for (const p of projectFootage) {
    line(`  id:${p.id} name:"${p.name}" ${p.w}x${p.h} instances:${p.instances} missing:${p.missing}`);
  }
}

// ── Summary stats ─────────────────────────────────────────────────────────────
sec('SUMMARY STATS');
line(`Text injectables:    ${textInjectables.length}`);
line(`Image injectables:   ${imageInjectables.length} (comp_inject:${compInjects.length} replace:${replaceInjects.length})`);
line(`Solid injectables:   ${solidInjectables.length}`);
line(`Expression controls: ${exprControls.length} (color:${exprControls.filter(e=>e.type==='color').length} checkbox:${exprControls.filter(e=>e.type==='checkbox').length} slider:${exprControls.filter(e=>e.type==='slider').length} angle:${exprControls.filter(e=>e.type==='angle').length})`);
line(`Shape colors:        ${shapeColors.length}`);
line(`Solid colors:        ${solidColors.length}`);
line(`Audio layers:        ${audioLayers.length}`);
line(`Toggle groups:       ${toggleGroups.length} (${toggleLayers.length} layers)`);
line(`Position markers:    ${positionMarkers.length}`);
line(`Scenes:              ${scenes.length}`);
line(`Third party plugins: ${plugins.length}`);
line(`Essential props:     ${essentialProps.length}`);
line(`Missing footage:     ${missingItems.length}`);
line('');
line(`SCAN_COMPLETE: ${scanComplete}`);

// ── Write output ──────────────────────────────────────────────────────────────
const summaryText = out.join('\n');
fs.writeFileSync(summaryPath, summaryText, 'utf8');

console.log('');
console.log('=== SCAN SUMMARY WRITTEN ===');
console.log('Summary: ' + summaryPath);
console.log('Full log: ' + fullLogPath);
console.log('');
console.log('Summary size: ' + Math.round(summaryText.length / 1024) + 'KB');
console.log('Full log size: ' + Math.round(fs.statSync(fullLogPath).size / 1024 || fs.statSync(fullLogPath).size / 1024) + 'KB');
console.log('');
console.log('Paste scan_summary.txt to Claude to generate config.json');
console.log('');

// Print summary to console too for quick check
console.log(summaryText);