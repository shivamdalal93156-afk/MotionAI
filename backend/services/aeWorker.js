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
        try { if (layer.locked) layer.locked = false; } catch(e) {}
        if (layer.name === '${layer.layerName}' && layer.property('Source Text')) {
          var textProp = layer.property('Source Text');
          var doc = textProp.value;
          doc.text = '${safe}';
          textProp.setValue(doc);
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

    // ── TYPE: comp_inject ────────────────────────────────────────
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

        // Image pre-resized by sharp to exact comp dimensions — place at 100%.
        // If dimensions differ (sharp failed), fall back to cover scale.
        var scale = 100;
        if (srcW > 0 && srcH > 0 && (srcW !== compW || srcH !== compH)) {
          scale = Math.max((compW / srcW) * 100, (compH / srcH) * 100);
          log('IMAGE WARN (comp_inject): size mismatch, using cover scale ' + scale.toFixed(1) + '%');
        }

        newLayer.property('Anchor Point').setValue([srcW / 2, srcH / 2]);
        newLayer.property('Position').setValue([compW / 2, compH / 2]);
        newLayer.property('Scale').setValue([scale, scale]);
        newLayer.startTime = 0;
        newLayer.outPoint  = targetComp.duration;
        newLayer.moveToEnd();

        log('IMAGE OK (comp_inject): "${safeCompName}" src=' + srcW + 'x' + srcH +
            ' comp=' + compW + 'x' + compH + ' scale=' + scale.toFixed(1) + '%');
      } catch(e) {
        log('IMAGE FAIL (comp_inject): ' + e.toString());
      }
      return;
    }

    // ── TYPE: solid_replace ──────────────────────────────────────
    if ('${injType}' === 'solid_replace') {
      if (!targetComp) {
        log('IMAGE MISS (solid_replace): comp "${safeCompName}" not found');
        return;
      }
      try {
        var importOpts  = new ImportOptions(imgFile);
        var newFootage  = app.project.importFile(importOpts);

        var replaced = false;
        for (var L = 1; L <= targetComp.numLayers; L++) {
          var lyr = targetComp.layer(L);
          try { if (lyr.locked) lyr.locked = false; } catch(e) {}
          try {
            if (lyr.source instanceof FootageItem &&
                lyr.source.name === '${layer.layerName}') {
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
          for (var pi = 1; pi <= app.project.numItems; pi++) {
            var pItem = app.project.item(pi);
            if (pItem instanceof FootageItem &&
                pItem.name === '${layer.layerName}') {
              try {
                pItem.replace(imgFile);
                log('IMAGE OK (solid_replace fallback): project item "${layer.layerName}" replaced');
                replaced = true;
              } catch(pe) {
                log('IMAGE FAIL (solid_replace fallback): ' + pe.toString());
              }
              break;
            }
          }
        }

        if (!replaced) {
          log('IMAGE MISS (solid_replace): no layer or project item found for "${layer.layerName}"');
        }
      } catch(e) {
        log('IMAGE FAIL (solid_replace): ' + e.toString());
      }
      return;
    }

    // ── TYPE: project_replace ────────────────────────────────────
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
    function autoFit(lyr, comp) {
      try {
        var cW = comp.width, cH = comp.height;
        var sW = lyr.source.width, sH = lyr.source.height;
        if (sW <= 0 || sH <= 0) return;
        var slotW = cW, slotH = cH;
        try {
          var masks = lyr.property('Masks');
          if (masks && masks.numProperties > 0) {
            var mask  = masks.property(1);
            var shape = mask.property('Mask Path').value;
            var pts   = shape.vertices;
            var minX  = pts[0][0], maxX = pts[0][0];
            var minY  = pts[0][1], maxY = pts[0][1];
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
        var scale = Math.max((slotW / sW) * 100, (slotH / sH) * 100);
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
        try { if (lyr.locked) lyr.locked = false; } catch(e) {}
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

  // ── Expression controls ───────────────────────────────────────
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

  // ── Country lines ─────────────────────────────────────────────
  // Calibration: two known pixel→angle mappings stored in config.
  // point01Time / point02Time: comp marker times from scanner.
  // Formula derived from these two points — works for any equirectangular map template.
  const mapCal    = templateConfig.mapCalibration || null;
  const pt01Time  = templateConfig.point01Time    || 0.3333;
  const pt02Time  = templateConfig.point02Time    || 8.3333;

  const countryLines = (templateConfig.countryLayers || []).map((cl, idx) => {
    const selectedCountry = inputData[cl.key];
    if (!selectedCountry) return `log('COUNTRY SKIP: key "${cl.key}" not in inputData');`;

    const safeComp     = (cl.compName           || '').replace(/'/g, "\\'");
    const safeAComp    = (cl.angleControlComp    || 'Main').replace(/'/g, "\\'");
    const safeALayer   = (cl.angleControlLayer   || 'Controller').replace(/'/g, "\\'");
    const safeXSlider  = (cl.pointXSlider        || '').replace(/'/g, "\\'");
    const safeYSlider  = (cl.pointYSlider        || '').replace(/'/g, "\\'");
    const safeCountry  = String(selectedCountry).replace(/'/g, "\\'");

    // Which marker time: country_1 uses point01Time, country_2 uses point02Time
    const markerTime   = (idx === 0) ? pt01Time : pt02Time;

    // Country coordinates from config
    const coords = templateConfig.countryCoordinates || {};
    const coord  = coords[selectedCountry] || null;

    // Calculate Angle X/Y using calibration formula
    let angleX = null, angleY = null;
    if (coord && mapCal) {
      const cal    = mapCal;
      const slopeY = (cal.p2.angleY - cal.p1.angleY) / (cal.p2.x - cal.p1.x);
      const offY   = cal.p1.angleY - slopeY * cal.p1.x;
      const slopeX = (cal.p2.angleX - cal.p1.angleX) / (cal.p2.y - cal.p1.y);
      const offX   = cal.p1.angleX - slopeX * cal.p1.y;
      angleY = (offY   + slopeY * coord.x).toFixed(4);
      angleX = (offX   + slopeX * coord.y).toFixed(4);
    }

    const hasAngles  = (angleX !== null && angleY !== null);
    const hasSliders = (coord && safeXSlider && safeYSlider);

    return `
  (function() {
    // 1. Toggle country outline ON, all others OFF
    var toggleComp = null;
    for (var ci = 1; ci <= app.project.numItems; ci++) {
      var it = app.project.item(ci);
      if (it instanceof CompItem && it.name === '${safeComp}') {
        toggleComp = it; break;
      }
    }
    if (!toggleComp) { log('COUNTRY MISS: comp "${safeComp}" not found'); return; }

    var found = false;
    var suffix = ' Outlines';
    for (var li = 1; li <= toggleComp.numLayers; li++) {
      var l  = toggleComp.layer(li);
      var ln = l.name;
      if (ln.length > suffix.length &&
          ln.substring(ln.length - suffix.length) === suffix) {
        var lnBase = ln.substring(0, ln.length - suffix.length).replace(/^\\s+|\\s+$/g, '');
        var sel    = '${safeCountry}'.replace(/^\\s+|\\s+$/g, '');
        if (lnBase.toLowerCase() === sel.toLowerCase()) {
          l.enabled = true;
          found = true;
          log('COUNTRY ON: "' + ln + '" in "${safeComp}"');
        } else {
          l.enabled = false;
        }
      }
    }
    if (!found) log('COUNTRY NOT FOUND: "${safeCountry} Outlines" in "${safeComp}"');

    // 2. Set Controller sliders + Angle X/Y
    var ctrlComp = null;
    for (var ci2 = 1; ci2 <= app.project.numItems; ci2++) {
      var it2 = app.project.item(ci2);
      if (it2 instanceof CompItem && it2.name === '${safeAComp}') {
        ctrlComp = it2; break;
      }
    }
    if (!ctrlComp) { log('CONTROLLER MISS: comp "${safeAComp}" not found'); return; }

    var ctrlLayer = null;
    for (var li2 = 1; li2 <= ctrlComp.numLayers; li2++) {
      if (ctrlComp.layer(li2).name === '${safeALayer}') {
        ctrlLayer = ctrlComp.layer(li2); break;
      }
    }
    if (!ctrlLayer) { log('CONTROLLER MISS: layer "${safeALayer}" not found'); return; }

    var afx = ctrlLayer.property('Effects');
    if (!afx) { log('CONTROLLER MISS: no effects on "${safeALayer}"'); return; }

    for (var fi = 1; fi <= afx.numProperties; fi++) {
      var ef      = afx.property(fi);
      var efName  = '';
      try { efName = ef.name; } catch(e) { continue; }
      var efLower = efName.toLowerCase();

${hasSliders ? `
      // Point position sliders
      if (efName === '${safeXSlider}') {
        try {
          var spX = ef.property(1);
          if (spX.numKeys > 0) {
            // Find keyframe nearest to marker time and update it
            var nearK = 1;
            var nearD = Math.abs(spX.keyTime(1) - ${markerTime});
            for (var k = 2; k <= spX.numKeys; k++) {
              var d = Math.abs(spX.keyTime(k) - ${markerTime});
              if (d < nearD) { nearD = d; nearK = k; }
            }
            spX.setValueAtKey(nearK, ${coord.x});
          } else {
            spX.setValue(${coord.x});
          }
          log('SLIDER OK: "${safeXSlider}" = ${coord.x} for "${safeCountry}"');
        } catch(e) { log('SLIDER FAIL (X): ' + e.toString()); }
      }
      if (efName === '${safeYSlider}') {
        try {
          var spY = ef.property(1);
          if (spY.numKeys > 0) {
            var nearKY = 1;
            var nearDY = Math.abs(spY.keyTime(1) - ${markerTime});
            for (var k2 = 2; k2 <= spY.numKeys; k2++) {
              var d2 = Math.abs(spY.keyTime(k2) - ${markerTime});
              if (d2 < nearDY) { nearDY = d2; nearKY = k2; }
            }
            spY.setValueAtKey(nearKY, ${coord.y});
          } else {
            spY.setValue(${coord.y});
          }
          log('SLIDER OK: "${safeYSlider}" = ${coord.y} for "${safeCountry}"');
        } catch(e) { log('SLIDER FAIL (Y): ' + e.toString()); }
      }` : `      // No point sliders configured for this country slot`}

${hasAngles ? `
      // Angle X / Angle Y — find keyframe nearest to markerTime and use setValueAtKey
      // setValueAtTime can fail on some AE versions; setValueAtKey is more reliable
      (function() {
        try {
          var axEf = ctrlLayer.effect('Angle X');
          var ayEf = ctrlLayer.effect('Angle Y');
          if (!axEf || !ayEf) {
            log('ANGLE FAIL: Angle X or Angle Y effect not found on "${safeALayer}"');
            return;
          }
          var axProp = axEf.property('Angle');
          var ayProp = ayEf.property('Angle');
          if (!axProp || !ayProp) {
            log('ANGLE FAIL: Angle property not found inside effect');
            return;
          }

          // Find keyframe nearest to markerTime within 0.5s tolerance
          var tolerance = 0.5;

          // Angle X
          var axSet = false;
          for (var ak = 1; ak <= axProp.numKeys; ak++) {
            if (Math.abs(axProp.keyTime(ak) - ${markerTime}) < tolerance) {
              axProp.setValueAtKey(ak, ${angleX});
              log('ANGLE X OK: ${angleX} for "${safeCountry}" at keyframe ' + ak + ' t=' + axProp.keyTime(ak));
              axSet = true;
              break;
            }
          }
          if (!axSet) {
            // No keyframe near markerTime — create one
            axProp.setValueAtTime(${markerTime}, ${angleX});
            log('ANGLE X OK (new key): ${angleX} for "${safeCountry}" at t=${markerTime}');
          }

          // Angle Y
          var aySet = false;
          for (var yk = 1; yk <= ayProp.numKeys; yk++) {
            if (Math.abs(ayProp.keyTime(yk) - ${markerTime}) < tolerance) {
              ayProp.setValueAtKey(yk, ${angleY});
              log('ANGLE Y OK: ${angleY} for "${safeCountry}" at keyframe ' + yk + ' t=' + ayProp.keyTime(yk));
              aySet = true;
              break;
            }
          }
          if (!aySet) {
            ayProp.setValueAtTime(${markerTime}, ${angleY});
            log('ANGLE Y OK (new key): ${angleY} for "${safeCountry}" at t=${markerTime}');
          }

        } catch(e) {
          log('ANGLE FAIL: ' + e.toString());
        }
      })();` : `      // No calibration data — angle rotation skipped for "${safeCountry}"`}
    }
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
  log('PROJECT OPEN: ' + app.project.numItems + ' items');
  writeHeartbeat();

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

  log('COUNTRY: setting country visibility...');
  ${countryLines}
  writeHeartbeat();

  app.purge(PurgeTarget.ALL_CACHES);

  log('SAVE: writing temp AEP...');
  var tempFile = new File('${tempAepPath}');
  app.project.gpuAccelType = GpuAccelType.SOFTWARE;
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

  const resizedInputData = await resizeAllSlots(job.inputData, templateConfig, jobDir);
  const resizedJob = { ...job, inputData: resizedInputData };
  const { jsxPath, tempAepPath, logPath, heartbeatPath } = buildJSX(resizedJob, templateConfig, jobDir);

  jobLog('AE_LAUNCH', { jsxPath });

  try {
    for (const prefsPath of PREFS_PATHS) {
      if (!fs.existsSync(prefsPath)) continue;
      const prefsFile  = path.join(prefsPath, 'Adobe After Effects 26.0 Prefs.txt');
      const prefsFile2 = path.join(prefsPath, 'Adobe After Effects 26.2 Prefs.txt');
      for (const pf of [prefsFile, prefsFile2]) {
        if (!fs.existsSync(pf)) continue;
        let content = fs.readFileSync(pf, 'utf8');
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