const path = require('path');
const fs   = require('fs');
const util = require('util');
const { exec, execSync } = require('child_process');
const execAsync = util.promisify(exec);

// Use EXACT same path resolution as aeRender.js — from .env
const AERENDER_PATH = process.env.AE_RENDER_PATH;
const AFTERFX_PATH  = AERENDER_PATH.replace('aerender.exe', 'AfterFX.com');
const JSX_TIMEOUT   = 300000; // 5 min — same as render pipeline

async function scanTemplate(aepPath, jobId) {
  const analysisDir = path.resolve(__dirname, '../../temp/analysis');
  if (!fs.existsSync(analysisDir)) fs.mkdirSync(analysisDir, { recursive: true });

  // All paths use forward slashes inside JSX (ExtendScript requirement)
  const outputPath  = path.join(analysisDir, `raw_${jobId}.json`).replace(/\\/g, '/');
  const safeAepPath = aepPath.replace(/\\/g, '/');
  const jsxPath     = path.join(analysisDir, `scan_${jobId}.jsx`);

  // ── JSX SCANNER ─────────────────────────────────────────────────────────────
  // Uses "in_time" not "in" — "in" is a reserved word in ExtendScript ES3
  // Uses app.open() inside the script — more reliable than passing -project flag
  const scannerJsx = `
(function() {
  var result = { layers: [], scenes: [], fps: 0, status: "started", error: null };
  var outFile = new File("${outputPath}");

  // HEARTBEAT — write immediately so we know the script ran at all
  outFile.open("w");
  outFile.write('{"status":"booting"}');
  outFile.close();

  try {
    app.beginSuppressDialogs();

    // Wait for AE to fully initialize — app.open() crashes when called
    // immediately at boot time with -noui flag before AE is ready
    var t = (new Date()).getTime();
    while ((new Date()).getTime() - t < 4000) {}

    var projFile = new File("${safeAepPath}");
    if (!projFile.exists) throw new Error("AEP not found: ${safeAepPath}");

    var project = app.open(projFile);
    if (!project) throw new Error("app.open() returned null");

    // ── FIND MAIN COMP (longest duration = render comp) ──────────────────────
    var mainComp = null;
    for (var i = 1; i <= project.numItems; i++) {
      var item = project.item(i);
      if (item instanceof CompItem) {
        if (!mainComp || item.duration > mainComp.duration) mainComp = item;
      }
    }
    if (!mainComp) throw new Error("No CompItem found in project");

    result.fps    = mainComp.frameRate;
    result.status = "comp_found";
    result.mainCompName = mainComp.name;

    // ── SCENE TIMING — top-level layers in main comp ─────────────────────────
    // "in" is reserved in ES3 — use in_time / out_time
    for (var j = 1; j <= mainComp.numLayers; j++) {
      var l = mainComp.layer(j);
      if (!l.enabled || l.guideLayer) continue;
      result.scenes.push({
        name:       l.name,
        in_time:    l.inPoint,
        out_time:   l.outPoint,
        startFrame: Math.round(l.inPoint  * mainComp.frameRate),
        endFrame:   Math.round(l.outPoint * mainComp.frameRate)
      });
    }

    // ── LEVER SCAN — recursive, max 3 levels deep ────────────────────────────
    // Scoring:
    //   TextLayer + visible + name length > 2  → text lever
    //   CompItem + standard ratio OR media name → image lever
    var seen = {};

    function scanComp(comp, depth) {
      if (depth > 3) return;
      for (var k = 1; k <= comp.numLayers; k++) {
        var layer = comp.layer(k);
        if (!layer.enabled || layer.guideLayer) continue;

        // Skip if we've already seen this layer name
        if (seen[layer.name]) continue;
        seen[layer.name] = true;

        // TEXT DETECTION
        if (layer instanceof TextLayer && layer.name.length > 2) {
          result.layers.push({
            type:  'text',
            name:  layer.name,
            score: scoreTextLayer(layer)
          });
        }

        // IMAGE / MEDIA DETECTION
        if (layer.source instanceof CompItem) {
          var ratio = (layer.source.width > 0 && layer.source.height > 0)
            ? (layer.source.width / layer.source.height)
            : 0;
          var nameScore = scoreMediaName(layer.name);
          var ratioScore = scoreRatio(ratio);
          var totalScore = nameScore + ratioScore;

          if (totalScore >= 30) {
            result.layers.push({
              type:       'image',
              name:       layer.name,
              score:      totalScore,
              ratio:      ratio > 1.4 ? "16:9" : (ratio < 0.8 ? "9:16" : "1:1"),
              sourceComp: layer.source.name
            });
          } else {
            // Not a media placeholder itself — recurse inside it
            scanComp(layer.source, depth + 1);
          }
        }
      }
    }

    // SCORING FUNCTIONS
    function scoreTextLayer(layer) {
      var score = 40; // Base: it's a text layer
      var name  = layer.name.toLowerCase();
      if (name.match(/title|text|headline|caption|scene|body|sub|copy/)) score += 30;
      if (layer.parent === null) score += 20; // Not parented = primary lever
      return score;
    }

    function scoreMediaName(name) {
      var n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (n.match(/media|image|photo|placeholder|footage|img|pic|slide|bg|background/)) return 40;
      if (n.match(/layer|comp|pre|fx|effect|null|ctrl|control|adj/)) return -20;
      return 10;
    }

    function scoreRatio(ratio) {
      // 16:9 = 1.777, 9:16 = 0.5625, 1:1 = 1.0, 4:3 = 1.333
      if (ratio > 1.7 && ratio < 1.85)  return 35; // 16:9
      if (ratio > 0.5 && ratio < 0.6)   return 35; // 9:16
      if (ratio > 0.95 && ratio < 1.05) return 25; // 1:1
      if (ratio > 1.2 && ratio < 1.4)   return 15; // 4:3
      return 0;
    }

    scanComp(mainComp, 0);

    // Sort levers by score descending
    result.layers.sort(function(a, b) { return b.score - a.score; });
    result.status = "success";

  } catch(e) {
    result.status = "error";
    result.error  = e.toString();
  } finally {
    // Always write — even on crash we get diagnostic data
    outFile.open("w");
    outFile.write(JSON.stringify(result));
    outFile.close();
    try { app.endSuppressDialogs(false); } catch(e2) {}
  }
})();
`;

  // Write JSX
  fs.writeFileSync(jsxPath, scannerJsx, 'utf8');

  // Corruption check — if JSX contains markdown link syntax it will crash AE
  const written = fs.readFileSync(jsxPath, 'utf8');
  if (written.includes('](http')) {
    throw new Error('JSX file corrupted with markdown links. Aborting.');
  }

  console.log(`[Analyzer ${jobId}] Launching AfterFX.com for scan...`);

  // EXACT same command structure as aeRender.js injectCmd
  const cmd = `"${AFTERFX_PATH}" -noui -r "${jsxPath.replace(/\//g, '\\')}"`;

  try {
    await execAsync(cmd, { timeout: JSX_TIMEOUT, env: { ...process.env } });
  } catch(e) {
    if (!fs.existsSync(outputPath.replace(/\//g, '\\'))) {
      throw new Error(`AfterFX.com exited with signal but no output file was created: ${e.message}`);
    }
    console.log(`[Analyzer ${jobId}] AE exited with signal but output file exists — continuing`);
  }

  const outputPathWin = outputPath.replace(/\//g, '\\');
  if (!fs.existsSync(outputPathWin)) {
    throw new Error('Output file missing after execution. AE likely crashed before the heartbeat write.');
  }

  let rawData;
  const rawText = fs.readFileSync(outputPathWin, 'utf8');
  try {
    rawData = JSON.parse(rawText);
  } catch(parseErr) {
    throw new Error(`AE crashed mid-execution. Raw output was: "${rawText}". The AEP likely has a missing plugin that crashes AE on open.`);
  }

  if (rawData.status === 'booting') {
    throw new Error('AE crashed during app.open() — this AEP has a missing required plugin. Use a template that renders successfully first.');
  }
  if (rawData.status === 'error') {
    throw new Error(`JSX internal error: ${rawData.error}`);
  }

  console.log(`[Analyzer ${jobId}] Scan complete. Found ${rawData.layers.length} levers, ${rawData.scenes.length} scenes.`);
  return formatProposal(rawData);
}

// ─── FORMAT PROPOSAL ──────────────────────────────────────────────────────────
function formatProposal(data) {
  const proposal = {
    render_comp:      data.mainCompName || '',
    fps:              data.fps,
    text_map:         {},
    image_map:        {},
    scene_outpoints:  {},
    scene_frame_times: {},
  };

  // Scene timing — use out_time (not "out" — reserved word)
  data.scenes.forEach((s, idx) => {
    const key = `scene${idx + 1}`;
    proposal.scene_outpoints[key]   = parseFloat(s.out_time.toFixed(3));
    proposal.scene_frame_times[key] = s.startFrame;
  });

  // Layers — text first, images second, numbered sequentially
  let textCount  = 1;
  let imageCount = 1;

  data.layers.forEach(l => {
    if (l.type === 'text') {
      const key = `scene${textCount}_1`;
      proposal.text_map[key] = l.name;
      textCount++;
    } else if (l.type === 'image') {
      const key = `image_${imageCount}`;
      proposal.image_map[key] = {
        comp:  l.sourceComp || l.name,
        ratio: l.ratio,
        hint:  l.name,
      };
      imageCount++;
    }
  });

  return proposal;
}

module.exports = { scanTemplate };