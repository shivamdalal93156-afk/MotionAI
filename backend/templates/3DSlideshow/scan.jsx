// MotionAI - Smart Template Scanner v2.0

var PLACEHOLDER_KEYWORDS = ['placeholder', 'image', 'photo', 'media', 'footage', 'pic', 'bg', 'background', 'insert', 'here', 'your', 'slide', 'frame'];
var RENDER_COMP_KEYWORDS = ['render', 'main', 'master', 'final', 'output', 'comp'];
var SKIP_COMP_KEYWORDS   = ['rig', 'control', 'ctrl', 'null', 'matte', 'mask', 'light', 'camera', 'shape', 'adjustment'];
var VALID_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'psd', 'ai'];
var VALID_VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm', 'mxf'];
var SKIP_EXTENSIONS = ['aep', 'jsx', 'txt', 'xml', 'json', 'ffx', 'mogrt', 'js'];

function strLower(s) {
  return s.toLowerCase();
}

function containsKeyword(name, keywords) {
  var n = strLower(name);
  for (var i = 0; i < keywords.length; i++) {
    if (n.indexOf(keywords[i]) !== -1) return true;
  }
  return false;
}

function getExtension(filename) {
  var parts = filename.split('.');
  if (parts.length < 2) return '';
  return strLower(parts[parts.length - 1]);
}

function isValidMediaExtension(ext) {
  for (var i = 0; i < VALID_IMAGE_EXTENSIONS.length; i++) {
    if (VALID_IMAGE_EXTENSIONS[i] === ext) return true;
  }
  for (var i = 0; i < VALID_VIDEO_EXTENSIONS.length; i++) {
    if (VALID_VIDEO_EXTENSIONS[i] === ext) return true;
  }
  return false;
}

function isSkipExtension(ext) {
  for (var i = 0; i < SKIP_EXTENSIONS.length; i++) {
    if (SKIP_EXTENSIONS[i] === ext) return true;
  }
  return false;
}

function isTextValueValid(val) {
  if (!val) return false;
  var trimmed = val.replace(/\s/g, '');
  if (trimmed.length === 0) return false;
  // Skip expression syntax
  if (val.indexOf('thisComp') !== -1) return false;
  if (val.indexOf('effect(') !== -1) return false;
  return true;
}

function getTextConfidence(layerName, val, depth) {
  var score = 50; // base for being a text layer
  if (isTextValueValid(val)) score += 20;
  if (val && val.length === 1) score -= 20;
  if (depth <= 2) score += 10;
  if (depth >= 4) score -= 10;
  return score;
}

function getImageConfidence(layerName, sourceName, ext, instanceCount, depth) {
  var score = 0;
  if (isValidMediaExtension(ext)) score += 40;
  if (isSkipExtension(ext)) score -= 50;
  if (containsKeyword(sourceName, PLACEHOLDER_KEYWORDS)) score += 20;
  if (containsKeyword(layerName, PLACEHOLDER_KEYWORDS)) score += 10;
  if (instanceCount > 1) score += 20;
  if (depth <= 2) score += 10;
  if (depth >= 4) score -= 10;
  return score;
}

// Check if a comp should be recursed into for image injection
// Rule C: recurse if name matches pattern OR contains exactly one footage layer with no text layers
function shouldRecurseIntoComp(comp) {
  // Rule B: name matches pattern (case insensitive)
  if (containsKeyword(comp.name, PLACEHOLDER_KEYWORDS)) return true;

  // Rule A: exactly one footage layer, no text layers
  var footageCount = 0;
  var textCount = 0;
  for (var L = 1; L <= comp.numLayers; L++) {
    var layer = comp.layer(L);
    try {
      if (layer.property('Source Text')) textCount++;
    } catch(e) {}
    try {
      if (layer.source instanceof FootageItem) {
        var src = layer.source;
        var isSolid = false;
        try { isSolid = (src.mainSource instanceof SolidSource); } catch(e) {}
        if (!isSolid) footageCount++;
      }
    } catch(e) {}
  }
  if (footageCount === 1 && textCount === 0) return true;

  return false;
}

// Track how many times each source file appears across entire project
function buildSourceInstanceMap() {
  var map = {};
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var L = 1; L <= item.numLayers; L++) {
      var layer = item.layer(L);
      try {
        if (layer.source instanceof FootageItem) {
          var name = layer.source.name;
          map[name] = (map[name] || 0) + 1;
        }
      } catch(e) {}
    }
  }
  return map;
}

// Find root comps — comps not referenced by any other comp
function findRootComps() {
  var referenced = {};
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var L = 1; L <= item.numLayers; L++) {
      var layer = item.layer(L);
      try {
        if (layer.source instanceof CompItem) {
          referenced[layer.source.name] = true;
        }
      } catch(e) {}
    }
  }
  var roots = [];
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    if (!referenced[item.name]) roots.push(item);
  }
  return roots;
}

function getRenderCompConfidence(comp, isRoot) {
  var score = 0;
  if (isRoot) score += 40;
  if (containsKeyword(comp.name, RENDER_COMP_KEYWORDS)) score += 30;
  if (containsKeyword(comp.name, SKIP_COMP_KEYWORDS)) score -= 50;
  // Prefer HD over 4K as default
  if (comp.width === 1920 && comp.height === 1080) score += 10;
  if (comp.width === 3840 && comp.height === 2160) score += 5;
  return score;
}

// ── Main scan ─────────────────────────────────────────────────────

var aepPath = 'C:/Users/SHIVAM/Desktop/motionai/backend/templates/3DSlideshow/3D Slideshow - Photo Slideshow 24.x.aep';
var resultPath = 'C:/Users/SHIVAM/Desktop/motionai/backend/templates/3DSlideshow/scan_result.txt';

var f = new File(aepPath);
app.open(f);
// List all project-level footage items
for (var i = 1; i <= app.project.numItems; i++) {
  var item = app.project.item(i);
  if (item instanceof FootageItem) {
    var isSolid = false;
    try { isSolid = (item.mainSource instanceof SolidSource); } catch(e) {}
    if (!isSolid) {
      out.writeln('FOOTAGE_ITEM|' + item.name + '|id:' + i);
    }
  }
}
var out = new File(resultPath);
out.open('w');
out.writeln('=== MOTIONAI SMART SCAN v2.0 ===');
out.writeln('');

var sourceInstanceMap = buildSourceInstanceMap();
var rootComps = findRootComps();
var rootCompNames = {};
for (var r = 0; r < rootComps.length; r++) {
  rootCompNames[rootComps[r].name] = true;
}

// ── Render comp detection ─────────────────────────────────────────
out.writeln('--- RENDER COMPS ---');
var renderCandidates = [];
for (var i = 1; i <= app.project.numItems; i++) {
  var item = app.project.item(i);
  if (!(item instanceof CompItem)) continue;
  var isRoot = !!rootCompNames[item.name];
  var confidence = getRenderCompConfidence(item, isRoot);
  if (confidence >= 30) {
    renderCandidates.push({ name: item.name, duration: item.duration, fps: item.frameRate, width: item.width, height: item.height, confidence: confidence });
  }
}
// Sort by confidence
renderCandidates.sort(function(a, b) { return b.confidence - a.confidence; });
for (var r = 0; r < renderCandidates.length; r++) {
  var rc = renderCandidates[r];
  var conf = rc.confidence >= 60 ? 'HIGH' : rc.confidence >= 40 ? 'MEDIUM' : 'LOW';
  out.writeln('RENDER_COMP|' + rc.name + '|duration:' + rc.duration.toFixed(2) + 's|fps:' + rc.fps + '|resolution:' + rc.width + 'x' + rc.height + '|confidence:' + conf + '|score:' + rc.confidence);
}
out.writeln('');

// ── Injectable layer scan ─────────────────────────────────────────
out.writeln('--- INJECTABLE LAYERS ---');

var visited = {};

function scanComp(comp, depth) {
  if (visited[comp.name]) return;
  visited[comp.name] = true;
  if (containsKeyword(comp.name, SKIP_COMP_KEYWORDS)) return;
  if (depth > 5) return;

  for (var L = 1; L <= comp.numLayers; L++) {
    var layer = comp.layer(L);

    // Skip null, shape, camera, light layers
    var isNull = false;
    try { isNull = (layer instanceof NullLayer); } catch(e) {}
    if (isNull) continue;

    var layerName = layer.name;

    // TEXT
    try {
      if (layer.property('Source Text')) {
        var val = layer.property('Source Text').value.text;
        var conf = getTextConfidence(layerName, val, depth);
        if (conf >= 40) {
          var confLabel = conf >= 65 ? 'HIGH' : conf >= 50 ? 'MEDIUM' : 'LOW';
          out.writeln('TEXT|' + comp.name + '|' + layerName + '|depth:' + depth + '|confidence:' + confLabel + '|value:' + val);
        }
        continue;
      }
    } catch(e) {}

    // PRECOMP — check if we should recurse
    try {
      if (layer.source instanceof CompItem) {
        var childComp = layer.source;
        if (!containsKeyword(childComp.name, SKIP_COMP_KEYWORDS)) {
          if (shouldRecurseIntoComp(childComp)) {
            // Scan inside for the footage
            for (var CL = 1; CL <= childComp.numLayers; CL++) {
              var childLayer = childComp.layer(CL);
              try {
                if (childLayer.source instanceof FootageItem) {
                  var src = childLayer.source;
                  var isSolid = false;
                  try { isSolid = (src.mainSource instanceof SolidSource); } catch(e) {}
                  if (isSolid) continue;
                  var ext = getExtension(src.name);
                  if (isSkipExtension(ext)) continue;
                  var instances = sourceInstanceMap[src.name] || 1;
                  var imgConf = getImageConfidence(childLayer.name, src.name, ext, instances, depth + 1);
                  if (imgConf >= 40) {
                    var confLabel = imgConf >= 65 ? 'HIGH' : imgConf >= 50 ? 'MEDIUM' : 'LOW';
                    out.writeln('IMAGE|' + childComp.name + '|' + childLayer.name + '|source:' + src.name + '|ext:' + ext + '|instances:' + instances + '|depth:' + (depth+1) + '|confidence:' + confLabel);
                  }
                }
              } catch(e) {}
            }
          } else {
            scanComp(childComp, depth + 1);
          }
        }
        continue;
      }
    } catch(e) {}

    // DIRECT FOOTAGE LAYER
    try {
      if (layer.source instanceof FootageItem) {
        var src = layer.source;
        var isSolid = false;
        try { isSolid = (src.mainSource instanceof SolidSource); } catch(e) {}
        if (isSolid) continue;
        var ext = getExtension(src.name);
        if (isSkipExtension(ext)) continue;
        var instances = sourceInstanceMap[src.name] || 1;
        var imgConf = getImageConfidence(layerName, src.name, ext, instances, depth);
        if (imgConf >= 40) {
          var confLabel = imgConf >= 65 ? 'HIGH' : imgConf >= 50 ? 'MEDIUM' : 'LOW';
          out.writeln('IMAGE|' + comp.name + '|' + layerName + '|source:' + src.name + '|ext:' + ext + '|instances:' + instances + '|depth:' + depth + '|confidence:' + confLabel);
        }
      }
    } catch(e) {}
  }
}

// Start scan from root comps only
for (var r = 0; r < rootComps.length; r++) {
  if (!containsKeyword(rootComps[r].name, SKIP_COMP_KEYWORDS)) {
    scanComp(rootComps[r], 1);
  }
}

// Also scan render comp candidates directly in case they aren't detected as root
for (var r = 0; r < renderCandidates.length; r++) {
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof CompItem && item.name === renderCandidates[r].name) {
      scanComp(item, 1);
      break;
    }
  }
}

out.writeln('');
out.writeln('--- MAIN COMP TIMELINE ---');

// Dump main comp timeline for scene outpoint detection
if (renderCandidates.length > 0) {
  var mainCompName = renderCandidates[0].name;
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof CompItem && item.name === mainCompName) {
      out.writeln('MAIN_COMP|' + item.name + '|duration:' + item.duration.toFixed(2) + 's');
      for (var L = 1; L <= item.numLayers; L++) {
        var layer = item.layer(L);
        out.writeln('  LAYER|' + layer.name + '|in:' + layer.inPoint.toFixed(2) + '|out:' + layer.outPoint.toFixed(2));
      }
      break;
    }
  }
}

out.close();
app.quit();
// var aepPath = 'C:/Users/SHIVAM/Desktop/motionai/backend/templates/3DSlideshow/3D Slideshow - Photo Slideshow 24.x.aep';
// var resultPath = 'C:/Users/SHIVAM/Desktop/motionai/backend/scan_result.txt';
// var f = new File(aepPath);
// app.open(f);
// var out = new File(resultPath);
// out.open('w');

// for (var i = 1; i <= app.project.numItems; i++) {
//   var item = app.project.item(i);
//   if (!(item instanceof FootageItem)) continue;
//   var isSolid = false;
//   try { isSolid = (item.mainSource instanceof SolidSource); } catch(e) {}
//   if (isSolid) continue;
//   var filePath = '';
//   try { filePath = item.mainSource.file ? item.mainSource.file.fsName : 'no file'; } catch(e) { filePath = 'error'; }
//   out.writeln('ITEM|' + i + '|name:' + item.name + '|file:' + filePath + '|w:' + item.width + '|h:' + item.height);
// }

// out.close();
// app.quit();