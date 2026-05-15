const fs           = require('fs');
const path         = require('path');
const { spawn }    = require('child_process');
const { execSync } = require('child_process');
const { resizeAllSlots } = require('./imageResizer');

const PREFS_PATHS = [
  path.join(process.env.APPDATA, 'Adobe', 'After Effects', '26.0'),
  path.join(process.env.APPDATA, 'Adobe', 'After Effects', '26.2'),
  path.join(process.env.APPDATA, 'Adobe', 'After Effects', '25.0'),
];

function installTemplateFonts(templateDir, jobLog) {
  const fontsDir = path.join(templateDir, 'fonts');
  if (!fs.existsSync(fontsDir)) { jobLog('FONTS_SKIP', { note: 'No fonts folder in template' }); return 0; }
  const fontFiles = fs.readdirSync(fontsDir).filter(f => /\.(ttf|otf|woff|woff2)$/i.test(f));
  if (fontFiles.length === 0) { jobLog('FONTS_SKIP', { note: 'fonts folder empty' }); return 0; }
  const windowsFontsDir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
  let installed = 0;
  for (const fontFile of fontFiles) {
    const src  = path.join(fontsDir, fontFile);
    const dest = path.join(windowsFontsDir, fontFile);
    if (fs.existsSync(dest)) { jobLog('FONT_ALREADY_INSTALLED', { font: fontFile }); continue; }
    try {
      fs.copyFileSync(src, dest);
      const fontName = fontFile.replace(/\.(ttf|otf)$/i, ' (TrueType)');
      execSync(`reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" /v "${fontName}" /t REG_SZ /d "${fontFile}" /f`, { stdio: 'pipe' });
      jobLog('FONT_INSTALLED', { font: fontFile });
      installed++;
    } catch (e) { jobLog('FONT_INSTALL_FAIL', { font: fontFile, error: e.message }); }
  }
  if (installed > 0) jobLog('FONTS_INSTALLED', { count: installed });
  return installed;
}

function killAllAEProcesses() {
  try { execSync('taskkill /F /IM AfterFX.com /T', { stdio: 'pipe' }); } catch {}
  try { execSync('taskkill /F /IM AdobeIPCBroker.exe /T', { stdio: 'pipe' }); } catch {}
  return new Promise(r => setTimeout(r, 5000));
}

function verifyAEPrefs() {
  for (const p of PREFS_PATHS) {
    if (fs.existsSync(p)) {
      const size = getFolderSizeKB(p);
      if (size > 10) return { valid: true, path: p, sizeKB: size };
    }
  }
  return { valid: false };
}

function getFolderSizeKB(dir) {
  try {
    let total = 0;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isFile()) total += fs.statSync(full).size;
    }
    return Math.round(total / 1024);
  } catch { return 0; }
}

async function rebuildAEPrefs() {
  for (const p of PREFS_PATHS) {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  }
  const aePath = process.env.AE_PATH;
  const ae = spawn(`"${aePath}"`, [], { shell: true, detached: false, stdio: 'ignore', windowsHide: true });
  await new Promise(r => setTimeout(r, 20000));
  try { ae.kill('SIGKILL'); } catch {}
  await killAllAEProcesses();
  const result = verifyAEPrefs();
  if (!result.valid) throw new Error('AE_PREFS_REBUILD_FAILED');
  return result;
}

function buildJSX(job, templateConfig, jobDir) {
  const { inputData, template } = job;
  const templatesDir   = path.resolve(__dirname, '..', 'templates');
  const templateDir    = path.join(templatesDir, template);
  const aepFile        = path.join(templateDir, templateConfig.aepFile);
  const aepPath        = aepFile.replace(/\\/g, '/');
  const tempAepPath    = path.join(jobDir, 'temp_project.aep').replace(/\\/g, '/');
  const logPath        = path.join(jobDir, 'ae_internal.log').replace(/\\/g, '/');
  const heartbeatPath  = path.join(jobDir, 'heartbeat').replace(/\\/g, '/');
  const templateDirFwd = templateDir.replace(/\\/g, '/');

  // ── Text injection ────────────────────────────────────────────
  const textLines = (templateConfig.textLayers || []).map(layer => {
    const value = inputData[layer.key];
    if (!value) return `log('TEXT SKIP: key "${layer.key}" not in inputData');`;
    const safe = String(value).replace(/'/g, "\\'");
    const compFilter = layer.compName ? `comp.name === '${layer.compName}'` : `true`;
    return `
  (function() {
    var found = false;
    for (var c = 1; c <= app.project.numItems; c++) {
      var comp = app.project.item(c);
      if (!(comp instanceof CompItem)) continue;
      if (!(${compFilter})) continue;
      for (var L = 1; L <= comp.numLayers; L++) {
        var layer = comp.layer(L);
        if (layer.name === '${layer.layerName}' && layer.property('Source Text')) {
          layer.property('Source Text').setValue(new TextDocument('${safe}'));
          log('TEXT OK: "${layer.compName}.${layer.layerName}" -> "${safe}"');
          found = true;
        }
      }
    }
    if (!found) log('TEXT MISS: "${layer.compName}.${layer.layerName}" not found');
  })();`;
  }).join('\n');

  // ── Image injection ───────────────────────────────────────────
  const imageLines = (templateConfig.imageLayers || []).map(layer => {
    const value = inputData[layer.key];
    if (!value) return `log('IMAGE SKIP: key "${layer.key}" not in inputData');`;
    const safeImgPath  = String(value).replace(/\\/g, '/').replace(/'/g, "\\'");
    const injType      = layer.type || 'replace';
    const safeCompName = (layer.compName || '').replace(/'/g, "\\'");
    const safeItemName = (layer.itemName || '').replace(/'/g, "\\'");

    return `
  (function() {
    var imgFile = new File('${safeImgPath}');
    if (!imgFile.exists) {
      log('IMAGE MISSING FILE: ${safeImgPath}');
      return;
    }

    // Find target comp by name
    var targetComp = null;
    if ('${safeCompName}' !== '') {
      for (var c = 1; c <= app.project.numItems; c++) {
        var item = app.project.item(c);
        if (item instanceof CompItem && item.name === '${safeCompName}') {
          targetComp = item;
          break;
        }
      }
    }

    // REPLACE the comp_inject block in aeWorker.js buildJSX imageLines with this.
// Sharp has already resized the image to exact slotW x slotH before AE runs.
// So just add the layer at 100% scale centered — no Math.max/min needed.

    if ('${injType}' === 'comp_inject') {
      if (!targetComp) {
        log('IMAGE MISS (comp_inject): comp "${safeCompName}" not found');
        return;
      }
      try {
        var importOpts = new ImportOptions(imgFile);
        var newFootage = app.project.importFile(importOpts);
        var newLayer   = targetComp.layers.add(newFootage);
        var compW = targetComp.width;
        var compH = targetComp.height;
        var srcW  = newFootage.width;
        var srcH  = newFootage.height;

        // Image has been pre-resized by sharp to exact comp dimensions.
        // Just center it at 100% scale — no fitting math needed.
        // If for any reason dimensions differ (sharp failed), fall back to cover scale.
        var scale = 100;
        if (srcW > 0 && srcH > 0 && (srcW !== compW || srcH !== compH)) {
          // Fallback: sharp resize didn't run — use cover scale
          scale = Math.max((compW / srcW) * 100, (compH / srcH) * 100);
          log('IMAGE WARN (comp_inject): size mismatch, using cover scale ' + scale.toFixed(1) + '%');
        }

        newLayer.property('Anchor Point').setValue([srcW / 2, srcH / 2]);
        newLayer.property('Position').setValue([compW / 2, compH / 2]);
        newLayer.property('Scale').setValue([scale, scale]);
        newLayer.startTime = 0;
        newLayer.outPoint  = targetComp.duration;
        newLayer.moveToEnd();

        log('IMAGE OK (comp_inject): "${safeCompName}" ' +
            'src=' + srcW + 'x' + srcH +
            ' comp=' + compW + 'x' + compH +
            ' scale=' + scale.toFixed(1) + '%');
      } catch(e) {
        log('IMAGE FAIL (comp_inject): ' + e.toString());
      }
      return;
    }
      
    // ─────────────────────────────────────────────────────────────────────────────
// REPLACE the entire solid_replace block in aeWorker.js buildJSX imageLines
// with this. The image has already been resized to the exact slot dimensions
// by imageResizer.js before AE runs, so zero fitting math is needed here.
// ─────────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────────
// REPLACE the entire solid_replace block in aeWorker.js buildJSX imageLines
// with this. The image has already been resized to the exact slot dimensions
// by imageResizer.js before AE runs, so zero fitting math is needed here.
// ─────────────────────────────────────────────────────────────────────────────

    if ('${injType}' === 'solid_replace') {
      if (!targetComp) {
        log('IMAGE MISS (solid_replace): comp "${safeCompName}" not found');
        return;
      }
      try {
        var importOpts  = new ImportOptions(imgFile);
        var newFootage  = app.project.importFile(importOpts);

        // Find the layer in this comp whose SOURCE is the named solid.
        // The layer is named [Photo_01] (with brackets) — it links to
        // the Photo_01 solid in the project panel.
        // We match by layer.source.name === layerName from config.
        var replaced = false;
        for (var L = 1; L <= targetComp.numLayers; L++) {
          var lyr = targetComp.layer(L);
          try {
            if (lyr.source instanceof FootageItem &&
                lyr.source.name === '${layer.layerName}') {
              // replaceSource: swaps footage, keeps all expressions,
              // position, scale, mask — template handles everything itself.
              lyr.replaceSource(newFootage, false);
              log('IMAGE OK (solid_replace): layer "' + lyr.name +
                  '" source replaced -> "${safeImgPath}"');
              replaced = true;
              break;
            }
          } catch(re) {
            log('IMAGE WARN (solid_replace): replaceSource error: ' + re.toString());
          }
        }

        if (!replaced) {
          // Fallback: try replacing the solid in the project panel directly.
          // This works when the layer name doesn't match source name exactly.
          for (var pi = 1; pi <= app.project.numItems; pi++) {
            var pItem = app.project.item(pi);
            if (pItem instanceof FootageItem &&
                pItem.name === '${layer.layerName}') {
              try {
                pItem.replace(imgFile);
                log('IMAGE OK (solid_replace fallback): project item "' +
                    '${layer.layerName}' + '" replaced -> "${safeImgPath}"');
                replaced = true;
              } catch(pe) {
                log('IMAGE FAIL (solid_replace fallback): ' + pe.toString());
              }
              break;
            }
          }
        }

        if (!replaced) {
          log('IMAGE MISS (solid_replace): no layer or project item found ' +
              'for "${layer.layerName}" in "${safeCompName}"');
        }

      } catch(e) {
        log('IMAGE FAIL (solid_replace): ' + e.toString());
      }
      return;
    }

    // ── TYPE: project_replace ────────────────────────────────────
    // Replace footage item at project level by itemName
    if ('${injType}' === 'project_replace') {
      var itemName = '${safeItemName}';
      if (itemName === '') {
        log('IMAGE MISS (project_replace): no itemName specified');
        return;
      }
      for (var i = 1; i <= app.project.numItems; i++) {
        var projItem = app.project.item(i);
        if (projItem instanceof FootageItem && projItem.name === itemName) {
          try {
            projItem.replace(imgFile);
            log('IMAGE OK (project_replace): "' + itemName + '" -> "${safeImgPath}"');
            return;
          } catch(e) {
            log('IMAGE FAIL (project_replace): ' + e.toString());
            return;
          }
        }
      }
      log('IMAGE MISS (project_replace): "' + itemName + '" not found in project');
      return;
    }

    // ── TYPE: replace (default) ──────────────────────────────────
    // Find footage layer inside comp (recursively) and replace it
    function autoFit(lyr, comp) {
  try {
    var cW = comp.width, cH = comp.height;
    var sW = lyr.source.width, sH = lyr.source.height;
    if (sW <= 0 || sH <= 0) return;

    // Step 1: find the actual visible slot size
    // Check if this layer has a mask — if so, use mask bounding box
    var slotW = cW, slotH = cH;
    try {
      var masks = lyr.property('Masks');
      if (masks && masks.numProperties > 0) {
        var mask = masks.property(1);
        var shape = mask.property('Mask Path').value;
        var pts = shape.vertices;
        var minX = pts[0][0], maxX = pts[0][0];
        var minY = pts[0][1], maxY = pts[0][1];
        for (var mi = 1; mi < pts.length; mi++) {
          if (pts[mi][0] < minX) minX = pts[mi][0];
          if (pts[mi][0] > maxX) maxX = pts[mi][0];
          if (pts[mi][1] < minY) minY = pts[mi][1];
          if (pts[mi][1] > maxY) maxY = pts[mi][1];
        }
        slotW = maxX - minX;
        slotH = maxY - minY;
        log('AUTOFIT: using mask bounds ' + Math.round(slotW) + 'x' + Math.round(slotH));
      }
    } catch(me) {}

    // Step 2: cover scale — fill the slot completely, no empty space
    var scale = Math.max((slotW / sW) * 100, (slotH / sH) * 100);

    // Step 3: center in comp
    lyr.property('Anchor Point').setValue([sW / 2, sH / 2]);
    lyr.property('Position').setValue([cW / 2, cH / 2]);
    lyr.property('Scale').setValue([scale, scale]);
    log('AUTOFIT: ' + Math.round(sW) + 'x' + Math.round(sH) +
        ' -> slot ' + Math.round(slotW) + 'x' + Math.round(slotH) +
        ' scale=' + scale.toFixed(1) + '%');
  } catch(e) { log('AUTOFIT SKIP: ' + e.toString()); }
}
    function tryReplace(lyr, comp) {
      try { lyr.replaceSource(imgFile, false); autoFit(lyr, comp); return true; } catch(e) {}
      try { lyr.source.replace(imgFile);       autoFit(lyr, comp); return true; } catch(e) {}
      try { lyr.source.mainSource.file = imgFile; autoFit(lyr, comp); return true; } catch(e) {}
      return false;
    }

    function searchInComp(comp, depth) {
      if (depth > 4) return false;
      for (var L = 1; L <= comp.numLayers; L++) {
        var lyr = comp.layer(L);
        try {
          if (lyr.source instanceof FootageItem) {
            var isSolid = false;
            try { isSolid = (lyr.source.mainSource instanceof SolidSource); } catch(e) {}
            if (!isSolid && tryReplace(lyr, comp)) {
              log('IMAGE OK (replace): "${safeCompName}" depth=' + depth + ' -> "${safeImgPath}"');
              return true;
            }
          }
        } catch(e) {}
        try {
          if (lyr.source instanceof CompItem) {
            if (searchInComp(lyr.source, depth + 1)) return true;
          }
        } catch(e) {}
      }
      return false;
    }

    if (targetComp && searchInComp(targetComp, 1)) return;

    // Fallback: project-level item name search
    if ('${safeItemName}' !== '') {
      for (var i = 1; i <= app.project.numItems; i++) {
        var projItem = app.project.item(i);
        if (projItem instanceof FootageItem && projItem.name === '${safeItemName}') {
          try {
            projItem.replace(imgFile);
            log('IMAGE OK (itemName fallback): "${safeItemName}" -> "${safeImgPath}"');
            return;
          } catch(e) {}
        }
      }
    }

    log('IMAGE MISS: all strategies failed for "${safeCompName}"');
  })();`;
  }).join('\n');
  // Build country toggle lines
// Build expression control lines (color, checkbox, slider)
  const exprLines = (templateConfig.expressionControls || []).map(ec => {
    const value = inputData[ec.key];
    if (value === undefined || value === null || value === '') {
      return `log('EXPR SKIP: key "${ec.key}" not in inputData');`;
    }
    const safeComp   = (ec.compName   || '').replace(/'/g, "\\'");
    const safeLayer  = (ec.layerName  || '').replace(/'/g, "\\'");
    const safeEffect = (ec.effectName || '').replace(/'/g, "\\'");
    const ecType     = ec.type || 'unknown';

    if (ecType === 'color') {
      // value is hex string like "#ff7b00"
      const hex = String(value).replace('#', '');
      const r = parseInt(hex.substring(0,2),16)/255;
      const g = parseInt(hex.substring(2,4),16)/255;
      const b = parseInt(hex.substring(4,6),16)/255;
      return `
  (function() {
    for (var ci = 1; ci <= app.project.numItems; ci++) {
      var comp = app.project.item(ci);
      if (!(comp instanceof CompItem)) continue;
      if (comp.name !== '${safeComp}') continue;
      for (var li = 1; li <= comp.numLayers; li++) {
        var lyr = comp.layer(li);
        if (lyr.name !== '${safeLayer}') continue;
        var fx = lyr.property('Effects');
        if (!fx) continue;
        for (var fi = 1; fi <= fx.numProperties; fi++) {
          var ef = fx.property(fi);
          if (ef.name !== '${safeEffect}') continue;
          try {
            ef.property(1).setValue([${r.toFixed(6)}, ${g.toFixed(6)}, ${b.toFixed(6)}, 1.0]);
            log('EXPR OK (color): "${safeComp}.${safeLayer}.${safeEffect}" -> "${value}"');
          } catch(e) { log('EXPR FAIL (color): ' + e.toString()); }
          break;
        }
        break;
      }
      break;
    }
  })();`;
    }

    if (ecType === 'checkbox') {
      const boolVal = (value === true || value === 'true' || value === 1 || value === '1') ? 1 : 0;
      return `
  (function() {
    for (var ci = 1; ci <= app.project.numItems; ci++) {
      var comp = app.project.item(ci);
      if (!(comp instanceof CompItem)) continue;
      if (comp.name !== '${safeComp}') continue;
      for (var li = 1; li <= comp.numLayers; li++) {
        var lyr = comp.layer(li);
        if (lyr.name !== '${safeLayer}') continue;
        var fx = lyr.property('Effects');
        if (!fx) continue;
        for (var fi = 1; fi <= fx.numProperties; fi++) {
          var ef = fx.property(fi);
          if (ef.name !== '${safeEffect}') continue;
          try {
            ef.property(1).setValue(${boolVal});
            log('EXPR OK (checkbox): "${safeComp}.${safeLayer}.${safeEffect}" -> ${boolVal}');
          } catch(e) { log('EXPR FAIL (checkbox): ' + e.toString()); }
          break;
        }
        break;
      }
      break;
    }
  })();`;
    }

    if (ecType === 'slider') {
      const numVal = parseFloat(value) || 0;
      return `
  (function() {
    for (var ci = 1; ci <= app.project.numItems; ci++) {
      var comp = app.project.item(ci);
      if (!(comp instanceof CompItem)) continue;
      if (comp.name !== '${safeComp}') continue;
      for (var li = 1; li <= comp.numLayers; li++) {
        var lyr = comp.layer(li);
        if (lyr.name !== '${safeLayer}') continue;
        var fx = lyr.property('Effects');
        if (!fx) continue;
        for (var fi = 1; fi <= fx.numProperties; fi++) {
          var ef = fx.property(fi);
          if (ef.name !== '${safeEffect}') continue;
          try {
            ef.property(1).setValue(${numVal});
            log('EXPR OK (slider): "${safeComp}.${safeLayer}.${safeEffect}" -> ${numVal}');
          } catch(e) { log('EXPR FAIL (slider): ' + e.toString()); }
          break;
        }
        break;
      }
      break;
    }
  })();`;
    }

    if (ecType === 'solid_color') {
      const hex = String(value).replace('#', '');
      const r = parseInt(hex.substring(0,2),16)/255;
      const g = parseInt(hex.substring(2,4),16)/255;
      const b = parseInt(hex.substring(4,6),16)/255;
      return `
  (function() {
    for (var ci = 1; ci <= app.project.numItems; ci++) {
      var comp = app.project.item(ci);
      if (!(comp instanceof CompItem)) continue;
      if (comp.name !== '${safeComp}') continue;
      for (var li = 1; li <= comp.numLayers; li++) {
        var lyr = comp.layer(li);
        if (lyr.name !== '${safeLayer}') continue;
        try {
          if (lyr.source instanceof FootageItem) {
            var src = lyr.source.mainSource;
            if (src instanceof SolidSource) {
              src.color = [${r.toFixed(6)}, ${g.toFixed(6)}, ${b.toFixed(6)}];
              log('EXPR OK (solid_color): "${safeComp}.${safeLayer}" -> "${value}"');
            }
          }
        } catch(e) { log('EXPR FAIL (solid_color): ' + e.toString()); }
        break;
      }
      break;
    }
  })();`;
    }

    return `log('EXPR SKIP: unsupported type "${ecType}" for key "${ec.key}"');`;
  }).join('\n');

  // Build country toggle + marker movement lines
  const countryLines = (templateConfig.countryLayers || []).map(cl => {
    const selectedCountry = inputData[cl.key];
    if (!selectedCountry) return `log('COUNTRY SKIP: key "${cl.key}" not in inputData');`;
    const safeComp        = cl.compName.replace(/'/g, "\\'");
    const safeMarkerComp  = (cl.markerComp  || '').replace(/'/g, "\\'");
    const safeMarkerLayer = (cl.markerLayer || '').replace(/'/g, "\\'");
    const safeCountry     = String(selectedCountry).replace(/'/g, "\\'");
    const suffix          = ' Outlines';

    // Get coordinates from countryCoordinates in config
    const coords = templateConfig.countryCoordinates || {};
    const coord  = coords[selectedCountry] || null;
    const moveMarker = (coord && cl.markerComp && cl.markerLayer)
      ? `
    // Move position marker to selected country center
    if ('${safeMarkerComp}' !== '' && '${safeMarkerLayer}' !== '') {
      for (var mc = 1; mc <= app.project.numItems; mc++) {
        var mComp = app.project.item(mc);
        if (!(mComp instanceof CompItem)) continue;
        if (mComp.name !== '${safeMarkerComp}') continue;
        for (var ml = 1; ml <= mComp.numLayers; ml++) {
          var mLyr = mComp.layer(ml);
          if (mLyr.name !== '${safeMarkerLayer}') continue;
          try {
            mLyr.property('Position').setValue([${coord.x}, ${coord.y}]);
            log('MARKER MOVED: "${safeMarkerLayer}" -> [${coord.x}, ${coord.y}] for "${safeCountry}"');
          } catch(e) { log('MARKER FAIL: ' + e.toString()); }
          break;
        }
        break;
      }
    }`
      : `log('MARKER SKIP: no coords for "${safeCountry}"');`;

    return `
  (function() {
    var targetComp = null;
    for (var ci = 1; ci <= app.project.numItems; ci++) {
      if (app.project.item(ci) instanceof CompItem && app.project.item(ci).name === '${safeComp}') {
        targetComp = app.project.item(ci);
        break;
      }
    }
    if (!targetComp) { log('COUNTRY MISS: comp "${safeComp}" not found'); return; }

    var found = false;
    var suffix = '${suffix}';
    for (var li = 1; li <= targetComp.numLayers; li++) {
      var l = targetComp.layer(li);
      var ln = l.name;
      // Turn on only the selected country, turn off everything else
      var lnTrimmed = ln;
      if (ln.length > suffix.length && ln.substring(ln.length - suffix.length) === suffix) {
        lnTrimmed = ln.substring(0, ln.length - suffix.length);
        // Trim spaces
        while (lnTrimmed.length > 0 && lnTrimmed.charAt(lnTrimmed.length-1) === ' ') lnTrimmed = lnTrimmed.substring(0, lnTrimmed.length-1);
        while (lnTrimmed.length > 0 && lnTrimmed.charAt(0) === ' ') lnTrimmed = lnTrimmed.substring(1);
        var selected = '${safeCountry}';
        while (selected.length > 0 && selected.charAt(selected.length-1) === ' ') selected = selected.substring(0, selected.length-1);
        while (selected.length > 0 && selected.charAt(0) === ' ') selected = selected.substring(1);
        if (lnTrimmed.toLowerCase() === selected.toLowerCase()) {
          l.enabled = true;
          found = true;
          log('COUNTRY ON: "' + ln + '" in "${safeComp}"');
        } else {
          l.enabled = false;
        }
      }
    }
    if (!found) log('COUNTRY NOT FOUND: "${safeCountry}${suffix}" in "${safeComp}"');
    ${moveMarker}
  })();`;
  }).join('\n');
  const jsx = `
// MotionAI ExtendScript — Job: ${job.jobId}
// Generated: ${new Date().toISOString()}

var _logFile = new File('${logPath}');
_logFile.open('w');
function log(msg) {
  _logFile.writeln('[' + new Date().toTimeString().substr(0,8) + '] ' + msg);
}
function writeHeartbeat() {
  var hb = new File('${heartbeatPath}');
  hb.open('w');
  hb.write(new Date().getTime().toString());
  hb.close();
}

log('START: opening project');
writeHeartbeat();

try {
  var projFile = new File('${aepPath}');
  if (!projFile.exists) {
    log('FATAL: AEP not found at ${aepPath}');
    _logFile.close();
    app.quit();
  }
  app.beginSuppressDialogs();

  app.open(projFile);
  
  // Force software rendering (no GPU)
  
  log('PROJECT OPEN: ' + app.project.numItems + ' items');
  writeHeartbeat();
  // // ── Resolution normalizer ─────────────────────────────────────
  // // If render comp is higher than 1920x1080, scale it down
  // (function() {
  //   var targetComp = null;
  //   for (var ci = 1; ci <= app.project.numItems; ci++) {
  //     var item = app.project.item(ci);
  //     if (item instanceof CompItem && item.name === '${templateConfig.compName}') {
  //       targetComp = item;
  //       break;
  //     }
  //   }
  //   if (!targetComp) { log('RES: render comp not found'); return; }

  //   var origW = targetComp.width;
  //   var origH = targetComp.height;

  //   if (origW <= 1920 && origH <= 1080) {
  //     log('RES: already 1080p or lower (' + origW + 'x' + origH + '), no change');
  //     return;
  //   }

  //   // Calculate scale to fit within 1920x1080 maintaining aspect ratio
  //   var scaleW = 1920 / origW;
  //   var scaleH = 1080 / origH;
  //   var scale  = scaleW < scaleH ? scaleW : scaleH;

  //   var newW = Math.round(origW * scale);
  //   var newH = Math.round(origH * scale);

  //   // Round to even numbers (required for video codecs)
  //   if (newW % 2 !== 0) newW -= 1;
  //   if (newH % 2 !== 0) newH -= 1;

  //   try {
  //     targetComp.width  = newW;
  //     targetComp.height = newH;
  //     log('RES: scaled from ' + origW + 'x' + origH + ' to ' + newW + 'x' + newH);
  //   } catch(e) {
  //     log('RES: could not resize comp: ' + e.toString());
  //   }
  // })();
  // writeHeartbeat();

  log('RELINK: scanning for missing footage...');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof FootageItem)) continue;
    if (!item.mainSource || item.mainSource.isMissing) {
      var searchFile = new File('${templateDirFwd}/' + item.name);
      if (searchFile.exists) {
        item.replace(searchFile);
        log('RELINK OK: ' + item.name);
      } else {
        log('RELINK MISS: ' + item.name);
      }
    }
  }
  writeHeartbeat();

  log('TEXT: injecting text layers...');
  ${textLines}
  writeHeartbeat();

  log('IMAGE: replacing footage items...');
  ${imageLines}
  writeHeartbeat();
  log('EXPR: setting expression controls...');
  ${exprLines}
  writeHeartbeat();

  // ── Country Toggle ───────────────────────────────────────────
  log('COUNTRY: setting country visibility...');
  ${countryLines}
  writeHeartbeat();
  
  log('SAVE: writing temp AEP...');
  var tempFile = new File('${tempAepPath}');
  app.project.save(tempFile);
  log('SAVE COMPLETE');
  writeHeartbeat();

  log('SCRIPT_COMPLETE');
  _logFile.close();
  app.endSuppressDialogs(false);
  app.quit();

} catch(e) {
  log('EXCEPTION: ' + e.toString() + ' (line ' + e.line + ')');
  try { app.endSuppressDialogs(false); } catch(e2) {}
  _logFile.close();
  app.quit();
}
`;

  const jsxPath = path.join(jobDir, 'inject.jsx');
  fs.writeFileSync(jsxPath, jsx, 'utf8');
  return {
    jsxPath,
    tempAepPath:   tempAepPath.replace(/\//g, path.sep),
    logPath:       logPath.replace(/\//g, path.sep),
    heartbeatPath: heartbeatPath.replace(/\//g, path.sep),
  };
}

async function runAEInjection(job, templateConfig, jobDir, jobLog) {
  const templatesDir = path.resolve(__dirname, '..', 'templates');
  const templateDir  = path.join(templatesDir, job.template);

  installTemplateFonts(templateDir, jobLog);
  // Resize all solid_replace images to exact slot dimensions before AE runs
const resizedInputData = await resizeAllSlots(job.inputData, templateConfig, jobDir);
const resizedJob = { ...job, inputData: resizedInputData };
const { jsxPath, tempAepPath, logPath, heartbeatPath } = buildJSX(resizedJob, templateConfig, jobDir);

  jobLog('AE_LAUNCH', { jsxPath });

// Suppress AE font/footage dialogs via prefs before launch
try {
  for (const prefsPath of PREFS_PATHS) {
    if (!fs.existsSync(prefsPath)) continue;
    const prefsFile = path.join(prefsPath, 'Adobe After Effects 26.0 Prefs.txt');
    const prefsFile2 = path.join(prefsPath, 'Adobe After Effects 26.2 Prefs.txt');
    for (const pf of [prefsFile, prefsFile2]) {
      if (!fs.existsSync(pf)) continue;
      let content = fs.readFileSync(pf, 'utf8');
      // Suppress missing font dialog
      if (!content.includes('"ShowMissingFontDialog"')) {
        content += '\n"ShowMissingFontDialog" = "0"\n';
        fs.writeFileSync(pf, content, 'utf8');
        jobLog('AE_PREFS_FONT_DIALOG_SUPPRESSED', { file: pf });
      }
    }
  }
} catch(e) {
  jobLog('AE_PREFS_PATCH_FAIL', { error: e.message });
}

  await killAllAEProcesses();

  return new Promise((resolve, reject) => {
    const aePath     = process.env.AE_PATH;
    const TIMEOUT_MS = 5 * 60 * 1000;

    const ae = spawn(`"${aePath}"`, ['-r', `"${jsxPath}"`], {
      shell: true, detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let settled = false;
    ae.stdout.on('data', () => {});
    ae.stderr.on('data', () => {});

    let lastHeartbeatTime = Date.now();
    const heartbeatInterval = setInterval(() => {
      if (fs.existsSync(heartbeatPath)) {
        try {
          const ts = parseInt(fs.readFileSync(heartbeatPath, 'utf8'));
          if (ts > lastHeartbeatTime) lastHeartbeatTime = ts;
        } catch {}
      }
      const staleness = Date.now() - lastHeartbeatTime;
      jobLog('AE_HEARTBEAT', { staleness_ms: staleness, temp_aep_exists: fs.existsSync(tempAepPath) });
      if (staleness > 90000 && !settled) {
        clearInterval(heartbeatInterval);
        settled = true;
        ae.kill('SIGKILL');
        reject(new Error('AE_HEARTBEAT_TIMEOUT: AE frozen for >90s without heartbeat'));
      }
    }, 30000);

    const hardTimeout = setTimeout(() => {
      if (!settled) {
        clearInterval(heartbeatInterval);
        settled = true;
        ae.kill('SIGKILL');
        reject(new Error('AE_INJECTION_TIMEOUT: exceeded 5 minute limit'));
      }
    }, TIMEOUT_MS);

    ae.on('close', async (code) => {
      clearInterval(heartbeatInterval);
      clearTimeout(hardTimeout);
      if (settled) return;
      settled = true;

      let aeLog = '';
      if (fs.existsSync(logPath)) {
        aeLog = fs.readFileSync(logPath, 'utf8');
        jobLog('AE_INTERNAL_LOG', { log: aeLog });
      }

      if (!aeLog.includes('SCRIPT_COMPLETE')) {
        return reject(new Error(`AE_SCRIPT_INCOMPLETE: script did not finish.\n${aeLog.slice(-500)}`));
      }
      if (!fs.existsSync(tempAepPath)) {
        return reject(new Error('AE_NO_TEMP_AEP: temp project file was not created'));
      }
      const aepSize = fs.statSync(tempAepPath).size;
      if (aepSize < 102400) {
        return reject(new Error(`AE_TEMP_AEP_TOO_SMALL: ${aepSize} bytes`));
      }

      jobLog('AE_COMPLETE', { tempAepPath, aepSizeKB: Math.round(aepSize / 1024) });
      resolve({ tempAepPath, aeLog });
    });

    ae.on('error', (err) => {
      clearInterval(heartbeatInterval);
      clearTimeout(hardTimeout);
      if (!settled) { settled = true; reject(new Error(`AE_SPAWN_ERROR: ${err.message}`)); }
    });
  });
}

module.exports = { runAEInjection, killAllAEProcesses, verifyAEPrefs, rebuildAEPrefs };