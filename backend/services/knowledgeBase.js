'use strict';

const fs   = require('fs');
const path = require('path');

const KB_PATH = path.resolve(__dirname, '..', 'knowledge_base.json');

// ─── Load / Save ─────────────────────────────────────────────────────────────

function loadKB() {
  if (!fs.existsSync(KB_PATH)) {
    return {
      _meta: { version: '1.1', lastUpdated: null, totalTemplates: 0 },
      solidPatterns:      [],
      imagePatterns:      [],
      textPatterns:       [],
      expressionPatterns: [],
      skipPatterns:       [],
      templates:          {}
    };
  }
  return JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
}

function saveKB(kb) {
  kb._meta.lastUpdated    = new Date().toISOString();
  kb._meta.totalTemplates = Object.keys(kb.templates).length;
  fs.writeFileSync(KB_PATH, JSON.stringify(kb, null, 2), 'utf8');
}

// ─── Name abstractors ─────────────────────────────────────────────────────────

function abstractLayerName(name) {
  if (!name) return '';
  return name
    .replace(/_\d+/g, '_XX')
    .replace(/\d+$/,  'XX');
}

function abstractCompName(name) {
  if (!name) return '';
  return name
    .replace(/^\d+\s*-\s*/, 'XX - ')
    .replace(/_\d+/g, '_XX')
    .replace(/\d+$/,  'XX');
}

// ─── Pattern key helpers ──────────────────────────────────────────────────────

function solidKey(p) { return `${p.layerNamePattern}||${p.compPattern}||${p.type}`; }
function imageKey(p) { return `${p.layerNamePattern}||${p.type}`; }
function exprKey(p)  { return `${p.layerNamePattern}||${p.compPattern}`; }
function textKey(p)  { return p.compPattern; }
function skipKey(p)  { return p.layerNamePattern; }

// ─── Source tracking ──────────────────────────────────────────────────────────

function addSource(pattern, templateName) {
  if (!pattern.sources) pattern.sources = [];
  if (!pattern.sources.includes(templateName)) pattern.sources.push(templateName);
}

function removeSource(pattern, templateName) {
  if (!pattern.sources) return;
  pattern.sources = pattern.sources.filter(s => s !== templateName);
}

// ─── Remove template's exclusive patterns from KB ────────────────────────────

function purgeTemplatePatterns(kb, templateName) {
  const arrays = [
    'solidPatterns', 'imagePatterns', 'textPatterns',
    'expressionPatterns', 'skipPatterns'
  ];
  for (const arr of arrays) {
    for (const p of kb[arr]) removeSource(p, templateName);
    // Only delete patterns that have NO other sources
    kb[arr] = kb[arr].filter(p => p.sources && p.sources.length > 0);
  }
}

// ─── Parse pipe-delimited scan line ──────────────────────────────────────────

function parsePipeLine(line) {
  const result = {};
  const parts  = line.split('|');
  for (let i = 1; i < parts.length; i++) {
    const idx = parts[i].indexOf(':');
    if (idx === -1) continue;
    result[parts[i].substring(0, idx)] = parts[i].substring(idx + 1);
  }
  return result;
}

// ─── Extract patterns from verified config ────────────────────────────────────

function extractPatterns(templateName, config, scanLog) {
  const solidPatterns      = [];
  const imagePatterns      = [];
  const textPatterns       = [];
  const expressionPatterns = [];
  const skipPatterns       = [];

  const scanLines = scanLog ? scanLog.split('\n') : [];

  // ── Image layers ──────────────────────────────────────────────
  for (const layer of (config.imageLayers || [])) {
    const absLayer = abstractLayerName(layer.layerName || '');
    const absComp  = abstractCompName(layer.compName   || '');

    if (layer.type === 'solid_replace') {
      solidPatterns.push({
        layerNamePattern: absLayer,
        compPattern:      absComp,
        type:             'solid_replace',
        slotW:            layer.slotW,
        slotH:            layer.slotH,
        sources:          [templateName],
        note:             `verified in ${templateName}`
      });
    }

    if (layer.type === 'comp_inject') {
      imagePatterns.push({
        layerNamePattern: absLayer || '(empty comp)',
        compPattern:      absComp,
        type:             'comp_inject',
        slotW:            layer.slotW,
        slotH:            layer.slotH,
        sources:          [templateName],
        note:             `comp_inject verified in ${templateName}`
      });
    }

    if (layer.type === 'replace') {
      imagePatterns.push({
        layerNamePattern: absLayer,
        type:             'replace',
        sources:          [templateName],
        note:             `direct footage replace verified in ${templateName}`
      });
    }
  }

  // ── Text layers ───────────────────────────────────────────────
  const seenTextComps = new Set();
  for (const layer of (config.textLayers || [])) {
    const absComp = abstractCompName(layer.compName || '');
    if (seenTextComps.has(absComp)) continue;
    seenTextComps.add(absComp);
    textPatterns.push({
      compPattern: absComp,
      sources:     [templateName],
      note:        `text comp verified in ${templateName}`
    });
  }

  // ── Expression controls ───────────────────────────────────────
  const seenExpr = new Set();
  for (const ec of (config.expressionControls || [])) {
    const absComp = abstractCompName(ec.compName || '');
    const key     = `${absComp}::${ec.layerName}`;
    if (seenExpr.has(key)) continue;
    seenExpr.add(key);
    expressionPatterns.push({
      layerNamePattern: ec.layerName || '',
      compPattern:      absComp,
      sources:          [templateName],
      note:             `expression holder verified in ${templateName} — "${ec.layerName}" holds effects`
    });
  }

  // ── Skip patterns — SOLID_INJECTs in scan NOT in config ───────
  const configAbsNames = new Set(
    (config.imageLayers || []).map(l => abstractLayerName(l.layerName || ''))
  );
  for (const line of scanLines) {
    if (!line.startsWith('SOLID_INJECT|')) continue;
    const parts    = parsePipeLine(line);
    const lName    = parts['layer'];
    if (!lName) continue;
    const absLName = abstractLayerName(lName);
    if (configAbsNames.has(absLName)) continue;
    skipPatterns.push({
      layerNamePattern: absLName,
      reason:           'in scan but excluded from verified config',
      sources:          [templateName],
      note:             `internal/correction layer — learned from ${templateName}`
    });
  }

  return { solidPatterns, imagePatterns, textPatterns, expressionPatterns, skipPatterns };
}

// ─── Merge patterns into KB ───────────────────────────────────────────────────

function mergePatterns(kb, extracted, templateName) {
  const added = { solid: 0, image: 0, text: 0, expression: 0, skip: 0 };

  // solid
  for (const p of extracted.solidPatterns) {
    const existing = kb.solidPatterns.find(x => solidKey(x) === solidKey(p));
    if (existing) { addSource(existing, templateName); }
    else          { kb.solidPatterns.push(p); added.solid++; }
  }
  // image
  for (const p of extracted.imagePatterns) {
    const existing = kb.imagePatterns.find(x => imageKey(x) === imageKey(p));
    if (existing) { addSource(existing, templateName); }
    else          { kb.imagePatterns.push(p); added.image++; }
  }
  // text
  for (const p of extracted.textPatterns) {
    const existing = kb.textPatterns.find(x => textKey(x) === textKey(p));
    if (existing) { addSource(existing, templateName); }
    else          { kb.textPatterns.push(p); added.text++; }
  }
  // expression
  for (const p of extracted.expressionPatterns) {
    const existing = kb.expressionPatterns.find(x => exprKey(x) === exprKey(p));
    if (existing) { addSource(existing, templateName); }
    else          { kb.expressionPatterns.push(p); added.expression++; }
  }
  // skip
  for (const p of extracted.skipPatterns) {
    const existing = kb.skipPatterns.find(x => skipKey(x) === skipKey(p));
    if (existing) { addSource(existing, templateName); }
    else          { kb.skipPatterns.push(p); added.skip++; }
  }

  return added;
}

// ─── Main exports ─────────────────────────────────────────────────────────────

// ADD or MERGE — default mode
function updateKnowledgeBase(templateName, config, scanLog) {
  const kb       = loadKB();
  const extracted = extractPatterns(templateName, config, scanLog);
  const added     = mergePatterns(kb, extracted, templateName);

  kb.templates[templateName] = {
    verifiedAt:       new Date().toISOString(),
    compName:         config.compName,
    fps:              config.fps,
    duration:         config.duration,
    resolution:       config.resolution,
    textLayerCount:   (config.textLayers         || []).length,
    imageLayerCount:  (config.imageLayers         || []).length,
    exprControlCount: (config.expressionControls  || []).length,
    injectionTypes:   [...new Set((config.imageLayers || []).map(l => l.type))],
    newPatternsAdded: added
  };

  saveKB(kb);
  return { templateName, mode: 'merge', newPatterns: added, totalTemplates: Object.keys(kb.templates).length, kbPath: KB_PATH };
}

// REBUILD — wipe this template's exclusive patterns, re-add fresh
function rebuildKnowledgeBase(templateName, config, scanLog) {
  const kb = loadKB();

  // Remove all patterns exclusively from this template
  purgeTemplatePatterns(kb, templateName);

  // Re-extract and merge fresh
  const extracted = extractPatterns(templateName, config, scanLog);
  const added     = mergePatterns(kb, extracted, templateName);

  kb.templates[templateName] = {
    verifiedAt:       new Date().toISOString(),
    compName:         config.compName,
    fps:              config.fps,
    duration:         config.duration,
    resolution:       config.resolution,
    textLayerCount:   (config.textLayers         || []).length,
    imageLayerCount:  (config.imageLayers         || []).length,
    exprControlCount: (config.expressionControls  || []).length,
    injectionTypes:   [...new Set((config.imageLayers || []).map(l => l.type))],
    newPatternsAdded: added
  };

  saveKB(kb);
  return { templateName, mode: 'rebuild', newPatterns: added, totalTemplates: Object.keys(kb.templates).length, kbPath: KB_PATH };
}

// DELETE — remove template and all its exclusive patterns completely
function deleteFromKnowledgeBase(templateName) {
  const kb = loadKB();

  if (!kb.templates[templateName]) {
    return { templateName, mode: 'delete', error: 'Template not found in knowledge base' };
  }

  // Remove all patterns exclusively from this template
  purgeTemplatePatterns(kb, templateName);

  // Remove template entry
  delete kb.templates[templateName];

  saveKB(kb);
  return { templateName, mode: 'delete', totalTemplates: Object.keys(kb.templates).length, kbPath: KB_PATH };
}

// ─── Lookup queries ───────────────────────────────────────────────────────────

function lookupSolidPattern(layerName, compName) {
  const kb       = loadKB();
  const absLayer = abstractLayerName(layerName);
  const absComp  = abstractCompName(compName);

  if (kb.skipPatterns.some(p => p.layerNamePattern === absLayer)) {
    return { action: 'skip', reason: 'known internal layer' };
  }

  const match = kb.solidPatterns.find(p =>
    p.layerNamePattern === absLayer ||
    p.compPattern      === absComp
  );
  if (match) return { action: 'solid_replace', pattern: match };

  return { action: 'unknown' };
}

function lookupExpressionHolder(layerName, compName) {
  const kb      = loadKB();
  const absComp = abstractCompName(compName);
  const match   = kb.expressionPatterns.find(p =>
    p.layerNamePattern === layerName &&
    p.compPattern      === absComp
  );
  return match ? { known: true, pattern: match } : { known: false };
}

function lookupTextComp(compName) {
  const kb      = loadKB();
  const absComp = abstractCompName(compName);
  const match   = kb.textPatterns.find(p => p.compPattern === absComp);
  return match ? { known: true, pattern: match } : { known: false };
}

module.exports = {
  updateKnowledgeBase,
  rebuildKnowledgeBase,
  deleteFromKnowledgeBase,
  lookupSolidPattern,
  lookupExpressionHolder,
  lookupTextComp,
  loadKB,
  abstractLayerName,
  abstractCompName
};