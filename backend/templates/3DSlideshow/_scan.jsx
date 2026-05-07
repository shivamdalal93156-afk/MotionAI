
var _log = new File('C:/Users/SHIVAM/Desktop/motionai/backend/templates/3DSlideshow/_scan.log');
_log.open('w');
function L(msg) { _log.writeln(msg); }

try {
  L('=== MOTIONAI COMPLETE SCAN v4.0 ===');
  L('template: 3DSlideshow');
  L('aep: C:/Users/SHIVAM/Desktop/motionai/backend/templates/3DSlideshow/3D Slideshow - Photo Slideshow 24.x.aep');
  L('scanned_at: ' + new Date().toString());
  L('');

  var f = new File('C:/Users/SHIVAM/Desktop/motionai/backend/templates/3DSlideshow/3D Slideshow - Photo Slideshow 24.x.aep');
  app.open(f);
  L('OPEN_OK|items:' + app.project.numItems);
  L('');

  // ── BUILD COMP INDEX ──────────────────────────────────────────
  // Map comp name -> comp object for fast lookup
  var compIndex = {};
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof CompItem) {
      compIndex[item.name] = item;
    }
  }

  // ── BUILD PARENT REFERENCE MAP ────────────────────────────────
  // For each comp, find which comps reference it and at what time offset
  // parentMap[childCompName] = [ { parentName, layerInPoint, layerStartTime }, ... ]
  var parentMap = {};
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var L2 = 1; L2 <= item.numLayers; L2++) {
      var layer = item.layer(L2);
      try {
        if (layer.source instanceof CompItem) {
          var childName = layer.source.name;
          if (!parentMap[childName]) parentMap[childName] = [];
          parentMap[childName].push({
            parentName:  item.name,
            layerIn:     layer.inPoint,
            layerOut:    layer.outPoint,
            startTime:   layer.startTime
          });
        }
      } catch(e) {}
    }
  }

  // ── FIND ROOT COMPS ───────────────────────────────────────────
  var rootComps = [];
  for (var name in compIndex) {
    if (!parentMap[name]) {
      rootComps.push(name);
    }
  }

  // ── RECURSIVE ABSOLUTE TIME CALCULATOR ───────────────────────
  // Given a comp name and a local time within it,
  // returns the absolute time in the root comp
  // Uses BFS up the parent chain
  function getAbsoluteTime(compName, localTime, visited) {
    if (!visited) visited = {};
    if (visited[compName]) return localTime; // circular ref guard
    visited[compName] = true;

    var parents = parentMap[compName];
    if (!parents || parents.length === 0) {
      // This is a root comp — localTime is already absolute
      return localTime;
    }

    // Use first parent (most templates have linear hierarchy)
    var parent = parents[0];
    // localTime in child maps to parent time as:
    // parentTime = parent.layerIn + (localTime - parent.startTime)
    var parentTime = parent.layerIn + (localTime - parent.startTime);
    if (parentTime < 0) parentTime = 0;

    return getAbsoluteTime(parent.parentName, parentTime, visited);
  }

  // ── DETECT RENDER COMP ────────────────────────────────────────
  L('=== RENDER COMP CANDIDATES ===');
  var renderKeywords = ['render', 'main', 'master', 'final', 'output', 'export'];
  var renderCandidates = [];
  for (var i = 0; i < rootComps.length; i++) {
    var rc = compIndex[rootComps[i]];
    var nameLower = rc.name.toLowerCase();
    var score = 0;
    for (var k = 0; k < renderKeywords.length; k++) {
      if (nameLower.indexOf(renderKeywords[k]) !== -1) { score += 30; break; }
    }
    if (rc.width === 1920 && rc.height === 1080) score += 20;
    if (rc.width === 3840 && rc.height === 2160) score += 10;
    if (rc.width === 1080 && rc.height === 1920) score += 5; // vertical
    score += 40; // root comp base score
    renderCandidates.push({ name: rc.name, score: score, dur: rc.duration, fps: rc.frameRate, w: rc.width, h: rc.height });
  }
  renderCandidates.sort(function(a,b){ return b.score - a.score; });
  for (var i = 0; i < renderCandidates.length; i++) {
    var rc = renderCandidates[i];
    var conf = rc.score >= 80 ? 'HIGH' : rc.score >= 60 ? 'MEDIUM' : 'LOW';
    L('RENDER_COMP|name:' + rc.name + '|dur:' + rc.dur.toFixed(3) + '|fps:' + rc.fps.toFixed(3) + '|res:' + rc.w + 'x' + rc.h + '|confidence:' + conf + '|score:' + rc.score);
  }
  L('');

  // ── SCAN ALL PROJECT FOOTAGE ITEMS ────────────────────────────
  L('=== PROJECT FOOTAGE ITEMS ===');
  var footageItems = [];
  var instanceMap = {};

  // Count instances first
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var L2 = 1; L2 <= item.numLayers; L2++) {
      try {
        var lyr = item.layer(L2);
        if (lyr.source instanceof FootageItem) {
          instanceMap[lyr.source.name] = (instanceMap[lyr.source.name] || 0) + 1;
        }
      } catch(e) {}
    }
  }

  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof FootageItem)) continue;
    var isSolid = false;
    try { isSolid = (item.mainSource instanceof SolidSource); } catch(e) {}
    if (isSolid) continue;
    var filePath = 'no_file';
    try { filePath = item.mainSource && item.mainSource.file ? item.mainSource.file.fsName : 'no_file'; } catch(e) {}
    var isMissing = false;
    try { isMissing = item.mainSource ? item.mainSource.isMissing : false; } catch(e) {}
    var ext = item.name.split('.').pop().toLowerCase();
    var mediaExts = ['jpg','jpeg','png','webp','gif','tif','tiff','psd','ai','mp4','mov','avi','webm','mxf'];
    var isMedia = false;
    for (var m = 0; m < mediaExts.length; m++) { if (mediaExts[m] === ext) { isMedia = true; break; } }
    L('FOOTAGE_ITEM|id:' + i + '|name:' + item.name + '|w:' + item.width + '|h:' + item.height + '|instances:' + (instanceMap[item.name] || 0) + '|missing:' + isMissing + '|isMedia:' + isMedia + '|ext:' + ext + '|file:' + filePath);
    footageItems.push({ id: i, name: item.name });
  }
  L('');

  // ── SCAN ALL COMPS — TEXT AND IMAGE LAYERS ────────────────────
  L('=== COMP LAYER DETAIL ===');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;

    L('COMP|name:' + item.name + '|dur:' + item.duration.toFixed(3) + '|fps:' + item.frameRate.toFixed(3) + '|w:' + item.width + '|h:' + item.height + '|layers:' + item.numLayers);

    for (var L2 = 1; L2 <= item.numLayers; L2++) {
      var layer = item.layer(L2);
      var lName = layer.name;
      var lIn   = layer.inPoint.toFixed(3);
      var lOut  = layer.outPoint.toFixed(3);

      // Absolute times in root comp
      var absIn  = getAbsoluteTime(item.name, layer.inPoint).toFixed(3);
      var absOut = getAbsoluteTime(item.name, layer.outPoint).toFixed(3);

      // Text layer
      var isText = false;
      try { if (layer.property('Source Text')) isText = true; } catch(e) {}
      if (isText) {
        var tVal = '';
        try { tVal = layer.property('Source Text').value.text; } catch(e) {}
        // Clean value — remove newlines for log
        tVal = tVal.replace(//g,'').replace(/
/g,'\n');
        L('  TEXT|name:' + lName + '|in:' + lIn + '|out:' + lOut + '|absIn:' + absIn + '|absOut:' + absOut + '|val:' + tVal);
        continue;
      }

      // Null layer — skip
      var isNull = false;
      try { isNull = (layer instanceof NullLayer); } catch(e) {}
      if (isNull) { L('  NULL|name:' + lName); continue; }

      // Shape layer — skip
      var isShape = false;
      try { isShape = (layer instanceof ShapeLayer); } catch(e) {}
      if (isShape) { L('  SHAPE|name:' + lName); continue; }

      // Camera/Light — skip
      try {
        if (layer.matchName === 'ADBE Camera Layer' || layer.matchName === 'ADBE Light Layer') {
          L('  CAMERA_LIGHT|name:' + lName);
          continue;
        }
      } catch(e) {}

      // Footage source
      try {
        if (layer.source instanceof FootageItem) {
          var src = layer.source;
          var isSolid2 = false;
          try { isSolid2 = (src.mainSource instanceof SolidSource); } catch(e) {}
          if (isSolid2) { L('  SOLID|name:' + lName); continue; }
          var srcFile = 'no_file';
          try { srcFile = src.mainSource && src.mainSource.file ? src.mainSource.file.fsName : 'no_file'; } catch(e) {}
          L('  FOOTAGE|name:' + lName + '|source:' + src.name + '|w:' + src.width + '|h:' + src.height + '|in:' + lIn + '|out:' + lOut + '|absIn:' + absIn + '|absOut:' + absOut + '|file:' + srcFile);
          continue;
        }
      } catch(e) {}

      // Precomp
      try {
        if (layer.source instanceof CompItem) {
          L('  PRECOMP|name:' + lName + '|source:' + layer.source.name + '|in:' + lIn + '|out:' + lOut + '|absIn:' + absIn + '|absOut:' + absOut);
          continue;
        }
      } catch(e) {}

      L('  OTHER|name:' + lName + '|in:' + lIn + '|out:' + lOut);
    }
  }
  L('');

  // ── INJECTABLE SUMMARY ────────────────────────────────────────
  // Flat list of everything injectable with absolute times
  // This is what config generation uses directly
  L('=== INJECTABLE SUMMARY ===');

  // Text layers — scan all comps
  L('-- TEXT INJECTABLES --');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var L2 = 1; L2 <= item.numLayers; L2++) {
      var layer = item.layer(L2);
      var isText = false;
      try { if (layer.property('Source Text')) isText = true; } catch(e) {}
      if (!isText) continue;
      var tVal = '';
      try { tVal = layer.property('Source Text').value.text.replace(//g,'').replace(/
/g,'\n'); } catch(e) {}
      // Skip empty or whitespace only
      if (!tVal || tVal.replace(/\n/g,'').trim().length === 0) continue;
      var absIn  = getAbsoluteTime(item.name, layer.inPoint).toFixed(3);
      var absOut = getAbsoluteTime(item.name, layer.outPoint).toFixed(3);
      L('TEXT_INJECT|comp:' + item.name + '|layer:' + layer.name + '|absIn:' + absIn + '|absOut:' + absOut + '|val:' + tVal);
    }
  }
  L('');

  // Image/footage layers — scan all comps
  L('-- IMAGE INJECTABLES --');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;

    // Check if this comp is an empty comp (no layers or only camera/light/shape)
    var hasRealLayers = false;
    for (var L2 = 1; L2 <= item.numLayers; L2++) {
      var lyr = item.layer(L2);
      var isNull2 = false; try { isNull2 = (lyr instanceof NullLayer); } catch(e) {}
      var isShape2 = false; try { isShape2 = (lyr instanceof ShapeLayer); } catch(e) {}
      var isCamera = (lyr.matchName === 'ADBE Camera Layer' || lyr.matchName === 'ADBE Light Layer');
      if (!isNull2 && !isShape2 && !isCamera) { hasRealLayers = true; break; }
    }

    // Empty comp that is referenced by other comps = comp_inject candidate
    if (!hasRealLayers && item.numLayers === 0 && parentMap[item.name]) {
      var absIn  = getAbsoluteTime(item.name, 0).toFixed(3);
      var absOut = getAbsoluteTime(item.name, item.duration).toFixed(3);
      L('IMAGE_INJECT|type:comp_inject|comp:' + item.name + '|w:' + item.width + '|h:' + item.height + '|absIn:' + absIn + '|absOut:' + absOut);
      continue;
    }

    // Comp with footage layers = replace candidate
    for (var L2 = 1; L2 <= item.numLayers; L2++) {
      var layer = item.layer(L2);
      try {
        if (layer.source instanceof FootageItem) {
          var src = layer.source;
          var isSolid3 = false;
          try { isSolid3 = (src.mainSource instanceof SolidSource); } catch(e) {}
          if (isSolid3) continue;
          var ext2 = src.name.split('.').pop().toLowerCase();
          var mediaExts2 = ['jpg','jpeg','png','webp','gif','tif','tiff','psd','ai','mp4','mov','avi','webm','mxf'];
          var isMedia2 = false;
          for (var m = 0; m < mediaExts2.length; m++) { if (mediaExts2[m] === ext2) { isMedia2 = true; break; } }
          if (!isMedia2) continue;
          var absIn  = getAbsoluteTime(item.name, layer.inPoint).toFixed(3);
          var absOut = getAbsoluteTime(item.name, layer.outPoint).toFixed(3);
          L('IMAGE_INJECT|type:replace|comp:' + item.name + '|layer:' + layer.name + '|source:' + src.name + '|w:' + src.width + '|h:' + src.height + '|absIn:' + absIn + '|absOut:' + absOut);
        }
      } catch(e) {}
    }
  }
  L('');

  // ── PROJECT LEVEL FOOTAGE ITEMS ───────────────────────────────
  L('-- PROJECT LEVEL FOOTAGE --');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof FootageItem)) continue;
    var isSolid4 = false;
    try { isSolid4 = (item.mainSource instanceof SolidSource); } catch(e) {}
    if (isSolid4) continue;
    var ext3 = item.name.split('.').pop().toLowerCase();
    var mediaExts3 = ['jpg','jpeg','png','webp','gif','tif','tiff','psd','ai','mp4','mov','avi','webm','mxf'];
    var isMedia3 = false;
    for (var m = 0; m < mediaExts3.length; m++) { if (mediaExts3[m] === ext3) { isMedia3 = true; break; } }
    if (!isMedia3) continue;
    var filePath2 = 'no_file';
    try { filePath2 = item.mainSource && item.mainSource.file ? item.mainSource.file.fsName : 'no_file'; } catch(e) {}
    L('PROJECT_FOOTAGE|id:' + i + '|name:' + item.name + '|w:' + item.width + '|h:' + item.height + '|instances:' + (instanceMap[item.name] || 0) + '|file:' + filePath2);
  }
  L('');

  L('SCAN_COMPLETE');
} catch(e) {
  L('EXCEPTION: ' + e.toString() + ' line:' + e.line);
}
_log.close();

// Copy log to result file
var srcF = new File('C:/Users/SHIVAM/Desktop/motionai/backend/templates/3DSlideshow/_scan.log');
var dstF = new File('C:/Users/SHIVAM/Desktop/motionai/backend/templates/3DSlideshow/scan_result.txt');
srcF.open('r');
dstF.open('w');
while (!srcF.eof) { dstF.writeln(srcF.readln()); }
srcF.close();
dstF.close();

app.quit();
