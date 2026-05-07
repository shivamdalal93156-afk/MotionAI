const fs           = require('fs');
const path         = require('path');
const { spawn }    = require('child_process');
const { execSync } = require('child_process');

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

    // ── TYPE: comp_inject ────────────────────────────────────────
    // For templates where Footage comps are empty — add image as new layer
    if ('${injType}' === 'comp_inject') {
      if (!targetComp) {
        log('IMAGE MISS (comp_inject): comp "${safeCompName}" not found');
        return;
      }
      try {
        var importOpts  = new ImportOptions(imgFile);
        var newFootage  = app.project.importFile(importOpts);
        var newLayer    = targetComp.layers.add(newFootage);
        var compW = targetComp.width;
        var compH = targetComp.height;
        var srcW  = newFootage.width;
        var srcH  = newFootage.height;
        if (srcW > 0 && srcH > 0) {
          var scale = Math.max((compW / srcW) * 100, (compH / srcH) * 100);
          newLayer.property('Anchor Point').setValue([srcW / 2, srcH / 2]);
          newLayer.property('Position').setValue([compW / 2, compH / 2]);
          newLayer.property('Scale').setValue([scale, scale]);
        }
        newLayer.startTime = 0;
        newLayer.outPoint  = targetComp.duration;
        newLayer.moveToEnd();
        log('IMAGE OK (comp_inject): "${safeCompName}" -> "${safeImgPath}"');
      } catch(e) {
        log('IMAGE FAIL (comp_inject): ' + e.toString());
      }
      return;
    }
    // ── TYPE: solid_replace ──────────────────────────────────────
    // For templates where user photo slot is a SOLID layer (e.g. Investigation Board)
    if ('${injType}' === 'solid_replace') {
      if (!targetComp) {
        log('IMAGE MISS (solid_replace): comp "${safeCompName}" not found');
        return;
      }
      var solidLayer = null;
      var solidIndex = -1;
      for (var L = 1; L <= targetComp.numLayers; L++) {
        if (targetComp.layer(L).name === '${layer.layerName}') {
          solidLayer = targetComp.layer(L);
          solidIndex = L;
          break;
        }
      }
      if (!solidLayer) {
        log('IMAGE MISS (solid_replace): layer "${layer.layerName}" not found in "${safeCompName}"');
        return;
      }
      try {
        var importOpts = new ImportOptions(imgFile);
        var newFootage = app.project.importFile(importOpts);
        var newLayer   = targetComp.layers.add(newFootage);
        newLayer.moveBefore(solidLayer);
        newLayer.startTime = 0;
        newLayer.outPoint  = targetComp.duration;
        var compW = targetComp.width;
        var compH = targetComp.height;
        var srcW  = newFootage.width;
        var srcH  = newFootage.height;
        if (srcW > 0 && srcH > 0) {
          var scale = Math.max((compW / srcW) * 100, (compH / srcH) * 100);
          newLayer.property('Anchor Point').setValue([srcW / 2, srcH / 2]);
          newLayer.property('Position').setValue([compW / 2, compH / 2]);
          newLayer.property('Scale').setValue([scale, scale]);
        }
        solidLayer.enabled = false;
        log('IMAGE OK (solid_replace): "${safeCompName}" / "${layer.layerName}" -> "${safeImgPath}"');
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
        if (sW > 0 && sH > 0) {
          var scale = Math.max((cW / sW) * 100, (cH / sH) * 100);
          lyr.property('Anchor Point').setValue([sW / 2, sH / 2]);
          lyr.property('Position').setValue([cW / 2, cH / 2]);
          lyr.property('Scale').setValue([scale, scale]);
          log('AUTOFIT: scale=' + scale.toFixed(1) + '%');
        }
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

  log('SAVE: writing temp AEP...');
  var tempFile = new File('${tempAepPath}');
  app.project.save(tempFile);
  log('SAVE COMPLETE');
  writeHeartbeat();

  log('SCRIPT_COMPLETE');
  _logFile.close();
  app.quit();

} catch(e) {
  log('EXCEPTION: ' + e.toString() + ' (line ' + e.line + ')');
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
  const { jsxPath, tempAepPath, logPath, heartbeatPath } = buildJSX(job, templateConfig, jobDir);

  jobLog('AE_LAUNCH', { jsxPath });
  await killAllAEProcesses();

  return new Promise((resolve, reject) => {
    const aePath     = process.env.AE_PATH;
    const TIMEOUT_MS = 5 * 60 * 1000;

    const ae = spawn(`"${aePath}"`, ['-r', `"${jsxPath}"`], {
      shell: true, detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
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