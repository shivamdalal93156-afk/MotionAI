var AEP_PATH    = "C:/Users/SHIVAM/Desktop/motionai/backend/templates/3DSlideshow/3D Slideshow - Photo Slideshow 24.x.aep";
var LOG_PATH    = "C:/Users/SHIVAM/Desktop/motionai/backend/templates/3DSlideshow/_scan.log";
var RESULT_PATH = "C:/Users/SHIVAM/Desktop/motionai/backend/templates/3DSlideshow/scan_result.txt";
var TEMPLATE    = "3DSlideshow";
// // MotionAI - Smart Template Scanner v2.0

// var PLACEHOLDER_KEYWORDS = ['placeholder', 'image', 'photo', 'media', 'footage', 'pic', 'bg', 'background', 'insert', 'here', 'your', 'slide', 'frame'];
// var RENDER_COMP_KEYWORDS = ['render', 'main', 'master', 'final', 'output', 'comp'];
// var SKIP_COMP_KEYWORDS   = ['rig', 'control', 'ctrl', 'null', 'matte', 'mask', 'light', 'camera', 'shape', 'adjustment'];
// var VALID_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'psd', 'ai'];
// var VALID_VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm', 'mxf'];
// var SKIP_EXTENSIONS = ['aep', 'jsx', 'txt', 'xml', 'json', 'ffx', 'mogrt', 'js'];

// function strLower(s) {
//   return s.toLowerCase();
// }

// function containsKeyword(name, keywords) {
//   var n = strLower(name);
//   for (var i = 0; i < keywords.length; i++) {
//     if (n.indexOf(keywords[i]) !== -1) return true;
//   }
//   return false;
// }

// function getExtension(filename) {
//   var parts = filename.split('.');
//   if (parts.length < 2) return '';
//   return strLower(parts[parts.length - 1]);
// }

// function isValidMediaExtension(ext) {
//   for (var i = 0; i < VALID_IMAGE_EXTENSIONS.length; i++) {
//     if (VALID_IMAGE_EXTENSIONS[i] === ext) return true;
//   }
//   for (var i = 0; i < VALID_VIDEO_EXTENSIONS.length; i++) {
//     if (VALID_VIDEO_EXTENSIONS[i] === ext) return true;
//   }
//   return false;
// }

// function isSkipExtension(ext) {
//   for (var i = 0; i < SKIP_EXTENSIONS.length; i++) {
//     if (SKIP_EXTENSIONS[i] === ext) return true;
//   }
//   return false;
// }

// function isTextValueValid(val) {
//   if (!val) return false;
//   var trimmed = val.replace(/\s/g, '');
//   if (trimmed.length === 0) return false;
//   // Skip expression syntax
//   if (val.indexOf('thisComp') !== -1) return false;
//   if (val.indexOf('effect(') !== -1) return false;
//   return true;
// }

// function getTextConfidence(layerName, val, depth) {
//   var score = 50; // base for being a text layer
//   if (isTextValueValid(val)) score += 20;
//   if (val && val.length === 1) score -= 20;
//   if (depth <= 2) score += 10;
//   if (depth >= 4) score -= 10;
//   return score;
// }

// function getImageConfidence(layerName, sourceName, ext, instanceCount, depth) {
//   var score = 0;
//   if (isValidMediaExtension(ext)) score += 40;
//   if (isSkipExtension(ext)) score -= 50;
//   if (containsKeyword(sourceName, PLACEHOLDER_KEYWORDS)) score += 20;
//   if (containsKeyword(layerName, PLACEHOLDER_KEYWORDS)) score += 10;
//   if (instanceCount > 1) score += 20;
//   if (depth <= 2) score += 10;
//   if (depth >= 4) score -= 10;
//   return score;
// }

// // Check if a comp should be recursed into for image injection
// // Rule C: recurse if name matches pattern OR contains exactly one footage layer with no text layers
// function shouldRecurseIntoComp(comp) {
//   // Rule B: name matches pattern (case insensitive)
//   if (containsKeyword(comp.name, PLACEHOLDER_KEYWORDS)) return true;

//   // Rule A: exactly one footage layer, no text layers
//   var footageCount = 0;
//   var textCount = 0;
//   for (var L = 1; L <= comp.numLayers; L++) {
//     var layer = comp.layer(L);
//     try {
//       if (layer.property('Source Text')) textCount++;
//     } catch(e) {}
//     try {
//       if (layer.source instanceof FootageItem) {
//         var src = layer.source;
//         var isSolid = false;
//         try { isSolid = (src.mainSource instanceof SolidSource); } catch(e) {}
//         if (!isSolid) footageCount++;
//       }
//     } catch(e) {}
//   }
//   if (footageCount === 1 && textCount === 0) return true;

//   return false;
// }

// // Track how many times each source file appears across entire project
// function buildSourceInstanceMap() {
//   var map = {};
//   for (var i = 1; i <= app.project.numItems; i++) {
//     var item = app.project.item(i);
//     if (!(item instanceof CompItem)) continue;
//     for (var L = 1; L <= item.numLayers; L++) {
//       var layer = item.layer(L);
//       try {
//         if (layer.source instanceof FootageItem) {
//           var name = layer.source.name;
//           map[name] = (map[name] || 0) + 1;
//         }
//       } catch(e) {}
//     }
//   }
//   return map;
// }

// // Find root comps — comps not referenced by any other comp
// function findRootComps() {
//   var referenced = {};
//   for (var i = 1; i <= app.project.numItems; i++) {
//     var item = app.project.item(i);
//     if (!(item instanceof CompItem)) continue;
//     for (var L = 1; L <= item.numLayers; L++) {
//       var layer = item.layer(L);
//       try {
//         if (layer.source instanceof CompItem) {
//           referenced[layer.source.name] = true;
//         }
//       } catch(e) {}
//     }
//   }
//   var roots = [];
//   for (var i = 1; i <= app.project.numItems; i++) {
//     var item = app.project.item(i);
//     if (!(item instanceof CompItem)) continue;
//     if (!referenced[item.name]) roots.push(item);
//   }
//   return roots;
// }

// function getRenderCompConfidence(comp, isRoot) {
//   var score = 0;
//   if (isRoot) score += 40;
//   if (containsKeyword(comp.name, RENDER_COMP_KEYWORDS)) score += 30;
//   if (containsKeyword(comp.name, SKIP_COMP_KEYWORDS)) score -= 50;
//   // Prefer HD over 4K as default
//   if (comp.width === 1920 && comp.height === 1080) score += 10;
//   if (comp.width === 3840 && comp.height === 2160) score += 5;
//   return score;
// }

// // ── Main scan ─────────────────────────────────────────────────────

// var aepPath = 'REPLACE_WITH_AEP_PATH';
// var resultPath = 'REPLACE_WITH_RESULT_PATH';

// var f = new File(aepPath);
// app.open(f);
// // List all project-level footage items
// for (var i = 1; i <= app.project.numItems; i++) {
//   var item = app.project.item(i);
//   if (item instanceof FootageItem) {
//     var isSolid = false;
//     try { isSolid = (item.mainSource instanceof SolidSource); } catch(e) {}
//     if (!isSolid) {
//       out.writeln('FOOTAGE_ITEM|' + item.name + '|id:' + i);
//     }
//   }
// }
// var out = new File(resultPath);
// out.open('w');
// out.writeln('=== MOTIONAI SMART SCAN v2.0 ===');
// out.writeln('');

// var sourceInstanceMap = buildSourceInstanceMap();
// var rootComps = findRootComps();
// var rootCompNames = {};
// for (var r = 0; r < rootComps.length; r++) {
//   rootCompNames[rootComps[r].name] = true;
// }

// // ── Render comp detection ─────────────────────────────────────────
// out.writeln('--- RENDER COMPS ---');
// var renderCandidates = [];
// for (var i = 1; i <= app.project.numItems; i++) {
//   var item = app.project.item(i);
//   if (!(item instanceof CompItem)) continue;
//   var isRoot = !!rootCompNames[item.name];
//   var confidence = getRenderCompConfidence(item, isRoot);
//   if (confidence >= 30) {
//     renderCandidates.push({ name: item.name, duration: item.duration, fps: item.frameRate, width: item.width, height: item.height, confidence: confidence });
//   }
// }
// // Sort by confidence
// renderCandidates.sort(function(a, b) { return b.confidence - a.confidence; });
// for (var r = 0; r < renderCandidates.length; r++) {
//   var rc = renderCandidates[r];
//   var conf = rc.confidence >= 60 ? 'HIGH' : rc.confidence >= 40 ? 'MEDIUM' : 'LOW';
//   out.writeln('RENDER_COMP|' + rc.name + '|duration:' + rc.duration.toFixed(2) + 's|fps:' + rc.fps + '|resolution:' + rc.width + 'x' + rc.height + '|confidence:' + conf + '|score:' + rc.confidence);
// }
// out.writeln('');

// // ── Injectable layer scan ─────────────────────────────────────────
// out.writeln('--- INJECTABLE LAYERS ---');

// var visited = {};

// function scanComp(comp, depth) {
//   if (visited[comp.name]) return;
//   visited[comp.name] = true;
//   if (containsKeyword(comp.name, SKIP_COMP_KEYWORDS)) return;
//   if (depth > 5) return;

//   for (var L = 1; L <= comp.numLayers; L++) {
//     var layer = comp.layer(L);

//     // Skip null, shape, camera, light layers
//     var isNull = false;
//     try { isNull = (layer instanceof NullLayer); } catch(e) {}
//     if (isNull) continue;

//     var layerName = layer.name;

//     // TEXT
//     try {
//       if (layer.property('Source Text')) {
//         var val = layer.property('Source Text').value.text;
//         var conf = getTextConfidence(layerName, val, depth);
//         if (conf >= 40) {
//           var confLabel = conf >= 65 ? 'HIGH' : conf >= 50 ? 'MEDIUM' : 'LOW';
//           out.writeln('TEXT|' + comp.name + '|' + layerName + '|depth:' + depth + '|confidence:' + confLabel + '|value:' + val);
//         }
//         continue;
//       }
//     } catch(e) {}

//     // PRECOMP — check if we should recurse
//     try {
//       if (layer.source instanceof CompItem) {
//         var childComp = layer.source;
//         if (!containsKeyword(childComp.name, SKIP_COMP_KEYWORDS)) {
//           if (shouldRecurseIntoComp(childComp)) {
//             // Scan inside for the footage
//             for (var CL = 1; CL <= childComp.numLayers; CL++) {
//               var childLayer = childComp.layer(CL);
//               try {
//                 if (childLayer.source instanceof FootageItem) {
//                   var src = childLayer.source;
//                   var isSolid = false;
//                   try { isSolid = (src.mainSource instanceof SolidSource); } catch(e) {}
//                   if (isSolid) continue;
//                   var ext = getExtension(src.name);
//                   if (isSkipExtension(ext)) continue;
//                   var instances = sourceInstanceMap[src.name] || 1;
//                   var imgConf = getImageConfidence(childLayer.name, src.name, ext, instances, depth + 1);
//                   if (imgConf >= 40) {
//                     var confLabel = imgConf >= 65 ? 'HIGH' : imgConf >= 50 ? 'MEDIUM' : 'LOW';
//                     out.writeln('IMAGE|' + childComp.name + '|' + childLayer.name + '|source:' + src.name + '|ext:' + ext + '|instances:' + instances + '|depth:' + (depth+1) + '|confidence:' + confLabel);
//                   }
//                 }
//               } catch(e) {}
//             }
//           } else {
//             scanComp(childComp, depth + 1);
//           }
//         }
//         continue;
//       }
//     } catch(e) {}

//     // DIRECT FOOTAGE LAYER
//     try {
//       if (layer.source instanceof FootageItem) {
//         var src = layer.source;
//         var isSolid = false;
//         try { isSolid = (src.mainSource instanceof SolidSource); } catch(e) {}
//         if (isSolid) continue;
//         var ext = getExtension(src.name);
//         if (isSkipExtension(ext)) continue;
//         var instances = sourceInstanceMap[src.name] || 1;
//         var imgConf = getImageConfidence(layerName, src.name, ext, instances, depth);
//         if (imgConf >= 40) {
//           var confLabel = imgConf >= 65 ? 'HIGH' : imgConf >= 50 ? 'MEDIUM' : 'LOW';
//           out.writeln('IMAGE|' + comp.name + '|' + layerName + '|source:' + src.name + '|ext:' + ext + '|instances:' + instances + '|depth:' + depth + '|confidence:' + confLabel);
//         }
//       }
//     } catch(e) {}
//   }
// }

// // Start scan from root comps only
// for (var r = 0; r < rootComps.length; r++) {
//   if (!containsKeyword(rootComps[r].name, SKIP_COMP_KEYWORDS)) {
//     scanComp(rootComps[r], 1);
//   }
// }

// // Also scan render comp candidates directly in case they aren't detected as root
// for (var r = 0; r < renderCandidates.length; r++) {
//   for (var i = 1; i <= app.project.numItems; i++) {
//     var item = app.project.item(i);
//     if (item instanceof CompItem && item.name === renderCandidates[r].name) {
//       scanComp(item, 1);
//       break;
//     }
//   }
// }

// out.writeln('');
// out.writeln('--- MAIN COMP TIMELINE ---');

// // Dump main comp timeline for scene outpoint detection
// if (renderCandidates.length > 0) {
//   var mainCompName = renderCandidates[0].name;
//   for (var i = 1; i <= app.project.numItems; i++) {
//     var item = app.project.item(i);
//     if (item instanceof CompItem && item.name === mainCompName) {
//       out.writeln('MAIN_COMP|' + item.name + '|duration:' + item.duration.toFixed(2) + 's');
//       for (var L = 1; L <= item.numLayers; L++) {
//         var layer = item.layer(L);
//         out.writeln('  LAYER|' + layer.name + '|in:' + layer.inPoint.toFixed(2) + '|out:' + layer.outPoint.toFixed(2));
//       }
//       break;
//     }
//   }
// }

// out.close();
// app.quit();
// // var aepPath = 'C:/Users/SHIVAM/Desktop/motionai/backend/templates/3DSlideshow/3D Slideshow - Photo Slideshow 24.x.aep';
// // var resultPath = 'C:/Users/SHIVAM/Desktop/motionai/backend/scan_result.txt';
// // var f = new File(aepPath);
// // app.open(f);
// // var out = new File(resultPath);
// // out.open('w');

// // for (var i = 1; i <= app.project.numItems; i++) {
// //   var item = app.project.item(i);
// //   if (!(item instanceof FootageItem)) continue;
// //   var isSolid = false;
// //   try { isSolid = (item.mainSource instanceof SolidSource); } catch(e) {}
// //   if (isSolid) continue;
// //   var filePath = '';
// //   try { filePath = item.mainSource.file ? item.mainSource.file.fsName : 'no file'; } catch(e) { filePath = 'error'; }
// //   out.writeln('ITEM|' + i + '|name:' + item.name + '|file:' + filePath + '|w:' + item.width + '|h:' + item.height);
// // }

// // out.close();
// // app.quit();
// PATHS INJECTED BY scan_template.js
// var AEP_PATH, LOG_PATH, RESULT_PATH, TEMPLATE defined above this

var _log = new File(LOG_PATH);
_log.open('w');
function L(msg) { _log.writeln(msg); }

try {
  L('=== MOTIONAI COMPLETE SCAN v4.0 ===');
  L('template: ' + TEMPLATE);
  L('aep: ' + AEP_PATH);
  L('scanned_at: ' + new Date().toString());
  L('');

  var f = new File(AEP_PATH);
  app.open(f);
  L('OPEN_OK|items:' + app.project.numItems);
  L('');

  var compIndex = {};
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof CompItem) compIndex[item.name] = item;
  }

  var parentMap = {};
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);
      try {
        if (layer.source instanceof CompItem) {
          var childName = layer.source.name;
          if (!parentMap[childName]) parentMap[childName] = [];
          parentMap[childName].push({
            parentName: item.name,
            layerIn:    layer.inPoint,
            layerOut:   layer.outPoint,
            startTime:  layer.startTime
          });
        }
      } catch(e) {}
    }
  }

  var rootComps = [];
  for (var name in compIndex) {
    if (!parentMap[name]) rootComps.push(name);
  }

  function getAbsoluteTime(compName, localTime, visited) {
    if (!visited) visited = {};
    if (visited[compName]) return localTime;
    visited[compName] = true;
    var parents = parentMap[compName];
    if (!parents || parents.length === 0) return localTime;
    var parent = parents[0];
    var parentTime = parent.layerIn + (localTime - parent.startTime);
    if (parentTime < 0) parentTime = 0;
    return getAbsoluteTime(parent.parentName, parentTime, visited);
  }
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
function simplifyRatio(w, h) {
  if (!w || !h) return '1:1';
  var d = gcd(Math.round(w), Math.round(h));
  return Math.round(w/d) + ':' + Math.round(h/d);
}

  L('=== RENDER COMP CANDIDATES ===');
  var renderKeywords = ['render', 'main', 'master', 'final', 'output', 'export'];
  var renderCandidates = [];
  for (var i = 0; i < rootComps.length; i++) {
    var rc = compIndex[rootComps[i]];
    var nameLower = rc.name.toLowerCase();
    var score = 40;
    for (var k = 0; k < renderKeywords.length; k++) {
      if (nameLower.indexOf(renderKeywords[k]) !== -1) { score += 30; break; }
    }
    if (rc.width === 1920 && rc.height === 1080) score += 20;
    else if (rc.width === 3840 && rc.height === 2160) score += 10;
    else if (rc.width === 1080 && rc.height === 1920) score += 5;
    renderCandidates.push({ name: rc.name, score: score, dur: rc.duration, fps: rc.frameRate, w: rc.width, h: rc.height });
  }
  renderCandidates.sort(function(a,b){ return b.score - a.score; });
  for (var i = 0; i < renderCandidates.length; i++) {
    var rc = renderCandidates[i];
    var conf = rc.score >= 80 ? 'HIGH' : rc.score >= 60 ? 'MEDIUM' : 'LOW';
    L('RENDER_COMP|name:' + rc.name + '|dur:' + rc.dur.toFixed(3) + '|fps:' + rc.fps.toFixed(3) + '|res:' + rc.w + 'x' + rc.h + '|confidence:' + conf + '|score:' + rc.score);
  }
  L('');

  L('=== PROJECT FOOTAGE ITEMS ===');
  var instanceMap = {};
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var j = 1; j <= item.numLayers; j++) {
      try {
        var lyr = item.layer(j);
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
  }
  L('');

  L('=== COMP LAYER DETAIL ===');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    L('COMP|name:' + item.name + '|dur:' + item.duration.toFixed(3) + '|fps:' + item.frameRate.toFixed(3) + '|w:' + item.width + '|h:' + item.height + '|layers:' + item.numLayers);
    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);
      var lName = layer.name;
      var lIn   = layer.inPoint.toFixed(3);
      var lOut  = layer.outPoint.toFixed(3);
      var absIn  = getAbsoluteTime(item.name, layer.inPoint).toFixed(3);
      var absOut = getAbsoluteTime(item.name, layer.outPoint).toFixed(3);

      var isText = false;
      try { if (layer.property('Source Text')) isText = true; } catch(e) {}
      if (isText) {
        var tVal = '';
        try {
          tVal = layer.property('Source Text').value.text;
          tVal = tVal.split('\r').join('').split('\n').join(' ');
        } catch(e) {}
        L('  TEXT|name:' + lName + '|in:' + lIn + '|out:' + lOut + '|absIn:' + absIn + '|absOut:' + absOut + '|val:' + tVal);
        continue;
      }

      var isNull = false;
      try { isNull = (layer instanceof NullLayer); } catch(e) {}
      if (isNull) { L('  NULL|name:' + lName); continue; }

      var isShape = false;
      try { isShape = (layer instanceof ShapeLayer); } catch(e) {}
      if (isShape) { L('  SHAPE|name:' + lName); continue; }

      try {
        if (layer.matchName === 'ADBE Camera Layer' || layer.matchName === 'ADBE Light Layer') {
          L('  CAMERA_LIGHT|name:' + lName); continue;
        }
      } catch(e) {}

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

  L('=== INJECTABLE SUMMARY ===');
  L('-- TEXT INJECTABLES --');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);
      var isText = false;
      try { if (layer.property('Source Text')) isText = true; } catch(e) {}
      if (!isText) continue;
      var tVal = '';
      try {
        tVal = layer.property('Source Text').value.text;
        tVal = tVal.split('\r').join('').split('\n').join(' ');
      } catch(e) {}
      if (!tVal || tVal.length === 0) continue;
      var absIn  = getAbsoluteTime(item.name, layer.inPoint).toFixed(3);
      var absOut = getAbsoluteTime(item.name, layer.outPoint).toFixed(3);
      L('TEXT_INJECT|comp:' + item.name + '|layer:' + layer.name + '|absIn:' + absIn + '|absOut:' + absOut + '|val:' + tVal);
    }
  }
  L('');

  L('-- IMAGE INJECTABLES --');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;

    if (item.numLayers === 0 && parentMap[item.name]) {
      var absIn  = getAbsoluteTime(item.name, 0).toFixed(3);
      var absOut = getAbsoluteTime(item.name, item.duration).toFixed(3);
      L('IMAGE_INJECT|type:comp_inject|comp:' + item.name + '|w:' + item.width + '|h:' + item.height + '|ratio:' + simplifyRatio(item.width, item.height) + '|absIn:' + absIn + '|absOut:' + absOut);
      continue;
    }

    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);
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
          L('IMAGE_INJECT|type:replace|comp:' + item.name + '|layer:' + layer.name + '|source:' + src.name + '|w:' + src.width + '|h:' + src.height + '|ratio:' + simplifyRatio(src.width, src.height) + '|absIn:' + absIn + '|absOut:' + absOut);
        }
      } catch(e) {}
    }
  }
  L('');
  
  // ─────────────────────────────────────────────────────────────────────────────
// REPLACE the entire  "-- SOLID INJECTABLES --"  block in scan_core.jsx
// with this block. Paste it between:
//   L('-- SOLID INJECTABLES --');
// and the next section header.
// ─────────────────────────────────────────────────────────────────────────────

  L('-- SOLID INJECTABLES --');

  // Keywords that strongly suggest a layer is a user photo/image placeholder
  var SLOT_POSITIVE_KW = [
    'photo', 'image', 'img', 'picture', 'pic', 'portrait',
    'avatar', 'face', 'person', 'media', 'footage',
    'placeholder', 'replace', 'insert', 'slot', 'logo',
    'foto', 'headshot', 'thumb', 'thumbnail'
  ];

  // Keywords that mean it is definitely NOT a user slot
  var SLOT_NEGATIVE_KW = [
    'null', 'adjustment', 'control', 'rig', 'guide',
    'matte', 'mask', 'vignette', 'shadow', 'noise',
    'grain', 'overlay', 'bg solid', 'background solid',
    'white solid', 'black solid', 'color solid', 'colour solid',
    'do not', 'dont', 'ignore', 'temp', 'deprecated'
  ];

  function isSolidPhotoSlot(layerName) {
    var n = layerName.toLowerCase();
    // Reject if any negative keyword matches
    for (var ni = 0; ni < SLOT_NEGATIVE_KW.length; ni++) {
      if (n.indexOf(SLOT_NEGATIVE_KW[ni]) !== -1) return false;
    }
    // Accept if any positive keyword matches
    for (var pi = 0; pi < SLOT_POSITIVE_KW.length; pi++) {
      if (n.indexOf(SLOT_POSITIVE_KW[pi]) !== -1) return true;
    }
    // Also accept pattern like "Photo_01", "Img_03", numbered slots
    if (/[a-z].*_\d+/i.test(layerName)) return true;
    return false;
  }

  // Detect mask shape on a layer
  // Returns: { shape: 'rectangle'|'circle'|'rounded_rect'|'polygon',
  //            maskW: number, maskH: number,
  //            cornerRadius: number (for rounded_rect) }
  function detectMaskShape(layer, compW, compH) {
    var result = {
      shape: 'rectangle',
      maskW: compW,
      maskH: compH,
      cornerRadius: 0
    };

    try {
      var masks = layer.property('Masks');
      if (!masks || masks.numProperties === 0) return result;

      var mask = masks.property(1);
      var maskPath = mask.property('Mask Path');
      if (!maskPath) return result;

      var shape = maskPath.value;
      var verts = shape.vertices;
      var inTan  = shape.inTangents;
      var outTan = shape.outTangents;

      if (!verts || verts.length === 0) return result;

      // Get bounding box of mask
      var minX = verts[0][0], maxX = verts[0][0];
      var minY = verts[0][1], maxY = verts[0][1];
      for (var vi = 1; vi < verts.length; vi++) {
        if (verts[vi][0] < minX) minX = verts[vi][0];
        if (verts[vi][0] > maxX) maxX = verts[vi][0];
        if (verts[vi][1] < minY) minY = verts[vi][1];
        if (verts[vi][1] > maxY) maxY = verts[vi][1];
      }
      var mW = Math.round(maxX - minX);
      var mH = Math.round(maxY - minY);
      result.maskW = mW;
      result.maskH = mH;

      var nVerts = verts.length;

      // CIRCLE detection:
      // A circle mask in AE has 4 vertices with large bezier tangents.
      // The tangent magnitude is approximately 0.5523 * radius.
      // Check: 4 vertices, aspect ratio close to 1:1, tangents non-zero.
      if (nVerts === 4) {
        var aspect = mW > 0 ? mH / mW : 1;
        var isSquarish = (aspect > 0.85 && aspect < 1.15);
        // Check tangent magnitudes — circles have large tangents
        var totalTanMag = 0;
        for (var ti = 0; ti < inTan.length; ti++) {
          var ix = inTan[ti][0], iy = inTan[ti][1];
          var ox = outTan[ti][0], oy = outTan[ti][1];
          totalTanMag += Math.sqrt(ix*ix + iy*iy);
          totalTanMag += Math.sqrt(ox*ox + oy*oy);
        }
        var avgTanMag = totalTanMag / (nVerts * 2);
        var radius = Math.min(mW, mH) / 2;
        // For a circle, avgTanMag ≈ 0.5523 * radius
        var expectedTan = 0.5523 * radius;
        var isCircle = isSquarish && (avgTanMag > expectedTan * 0.7) && (avgTanMag < expectedTan * 1.3);
        if (isCircle) {
          result.shape = 'circle';
          return result;
        }
      }

      // ROUNDED RECT detection:
      // 8 vertices (4 corners, each with 2 bezier points — but AE
      // actually uses 4 verts with tangents for rounded rects too).
      // Distinguish from circle: tangents smaller, vertices at corners.
      if (nVerts === 4) {
        // Already not a circle (checked above). Check if tangents exist but are smaller.
        var hasTangents = false;
        for (var ti2 = 0; ti2 < outTan.length; ti2++) {
          var ox2 = outTan[ti2][0], oy2 = outTan[ti2][1];
          if (Math.sqrt(ox2*ox2 + oy2*oy2) > 2) { hasTangents = true; break; }
        }
        if (hasTangents) {
          // Estimate corner radius from tangent magnitude
          var totalTan2 = 0;
          for (var ti3 = 0; ti3 < outTan.length; ti3++) {
            var ox3 = outTan[ti3][0], oy3 = outTan[ti3][1];
            totalTan2 += Math.sqrt(ox3*ox3 + oy3*oy3);
          }
          var avgTan2 = totalTan2 / nVerts;
          // cornerRadius ≈ avgTangentMag / 0.5523
          var cornerR = Math.round(avgTan2 / 0.5523);
          if (cornerR > 3) {
            result.shape = 'rounded_rect';
            result.cornerRadius = cornerR;
            return result;
          }
        }
        // 4 verts, no tangents = plain rectangle mask
        result.shape = 'rectangle';
        return result;
      }

      // POLYGON: anything else (triangle=3, pentagon=5, etc.)
      if (nVerts === 3) {
        result.shape = 'triangle';
        return result;
      }
      if (nVerts >= 5) {
        result.shape = 'polygon';
        return result;
      }

    } catch(me) {
      // Mask read failed — default to rectangle
    }

    return result;
  }

  // Now scan all comps for solid photo slots
  var solidSlotsSeen = {};

  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;

    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);

      // Must be a solid source
      var isSolidSlot = false;
      try {
        if (layer.source instanceof FootageItem) {
          isSolidSlot = (layer.source.mainSource instanceof SolidSource);
        }
      } catch(e) {}
      if (!isSolidSlot) continue;

      // Must pass name filter
      if (!isSolidPhotoSlot(layer.name)) continue;

      // Deduplicate: same layer name in same comp only once
      var slotKey = item.name + '||' + layer.name;
      if (solidSlotsSeen[slotKey]) continue;
      solidSlotsSeen[slotKey] = true;

      var absInSlot  = getAbsoluteTime(item.name, layer.inPoint).toFixed(3);
      var absOutSlot = getAbsoluteTime(item.name, layer.outPoint).toFixed(3);

      // Get the SOLID's own dimensions (not the comp)
      // AE SolidSource has width/height directly
      var solidW = item.width;  // fallback to comp
      var solidH = item.height;
      try {
        var solidSrc = layer.source.mainSource;
        // SolidSource doesn't expose w/h directly but FootageItem does
        solidW = layer.source.width  || item.width;
        solidH = layer.source.height || item.height;
      } catch(se) {}

      // Detect mask shape on this layer
      var maskInfo = detectMaskShape(layer, solidW, solidH);

      // The actual slot the user fills:
      // If there's a mask, slotW/slotH = mask bounding box
      // If no mask, slotW/slotH = solid dimensions (= comp for this template type)
      var slotW = maskInfo.maskW;
      var slotH = maskInfo.maskH;

      L('SOLID_INJECT' +
        '|comp:'        + item.name +
        '|layer:'       + layer.name +
        '|compW:'       + item.width +
        '|compH:'       + item.height +
        '|solidW:'      + solidW +
        '|solidH:'      + solidH +
        '|slotW:'       + slotW +
        '|slotH:'       + slotH +
        '|maskShape:'   + maskInfo.shape +
        '|cornerRadius:'+ maskInfo.cornerRadius +
        '|ratio:'       + simplifyRatio(slotW, slotH) +
        '|absIn:'       + absInSlot +
        '|absOut:'      + absOutSlot);
    }
  }

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
    var fp = 'no_file';
    try { fp = item.mainSource && item.mainSource.file ? item.mainSource.file.fsName : 'no_file'; } catch(e) {}
    L('PROJECT_FOOTAGE|id:' + i + '|name:' + item.name + '|w:' + item.width + '|h:' + item.height + '|instances:' + (instanceMap[item.name] || 0) + '|file:' + fp);
  }
  L('');

  L('=== SCENE STRUCTURE ===');

  // Find the actual scene container comp
  // Strategy: start from top render comp, skip through single-precomp wrappers
  // until we find a comp with multiple precomp children (the real scene container)
  var topComp = null;
  if (renderCandidates.length > 0) topComp = compIndex[renderCandidates[0].name];
  if (!topComp && compIndex['Main']) topComp = compIndex['Main'];

  // Drill down through single-layer wrapper comps to find real scene container
  var sceneContainer = null;
  var visited2 = {};
  var current = topComp;
  while (current && !visited2[current.name]) {
    visited2[current.name] = true;
    // Count precomp children that look like scene blocks
    var precompChildren = [];
    for (var j = 1; j <= current.numLayers; j++) {
      var lyr = current.layer(j);
      try {
        if (lyr.source instanceof CompItem) {
          var cn = lyr.source.name.toLowerCase();
          var skipW = ['light', 'back', 'color', 'shape_light', 'adjustment'];
          var skip2 = false;
          for (var sw = 0; sw < skipW.length; sw++) {
            if (cn === skipW[sw] || cn.indexOf('light') !== -1) { skip2 = true; break; }
          }
          if (!skip2) precompChildren.push({ layer: lyr, comp: lyr.source });
        }
      } catch(e) {}
    }
    if (precompChildren.length >= 2) {
      // This comp has multiple meaningful precomp children — it's the scene container
      sceneContainer = current;
      break;
    } else if (precompChildren.length === 1) {
      // Single wrapper — drill down
      current = precompChildren[0].comp;
    } else {
      break;
    }
  }

  if (sceneContainer) {
    L('SCENE_CONTAINER|name:' + sceneContainer.name + '|dur:' + sceneContainer.duration.toFixed(3));
    // Check if this comp uses cameras as scene markers (like Investigation Board)
    var cameraLayers = [];
    for (var j = 1; j <= sceneContainer.numLayers; j++) {
      var lyr = sceneContainer.layer(j);
      try {
        if (lyr.matchName === 'ADBE Camera Layer') {
          var cName = lyr.name;
          // Skip utility cameras
          if (cName.toLowerCase().indexOf('overall') !== -1) continue;
          if (cName.toLowerCase().indexOf('position') !== -1) continue;
          cameraLayers.push({ name: cName, inPoint: lyr.inPoint, outPoint: lyr.outPoint });
        }
      } catch(e) {}
    }
    cameraLayers.sort(function(a,b){ return a.inPoint - b.inPoint; });

    if (cameraLayers.length > 2) {
      // Camera-based template — use cameras as scene markers
      L('SCENE_TYPE|camera_based|count:' + cameraLayers.length);
      for (var ci = 0; ci < cameraLayers.length; ci++) {
        var cam = cameraLayers[ci];
        var dur2 = (cam.outPoint - cam.inPoint).toFixed(3);
        L('SCENE|block:' + cam.name +
          '|mainIn:' + cam.inPoint.toFixed(3) +
          '|mainOut:' + cam.outPoint.toFixed(3) +
          '|dur:' + dur2 +
          '|minDur:' + (parseFloat(dur2)*0.6).toFixed(3) +
          '|maxDur:' + (parseFloat(dur2)*1.5).toFixed(3) +
          '|subBeats:1|footageCount:0|footage:|textLayers:');
      }
    } else {
    // Collec
      // Collect all scene layers, sort by inPoint
      var sceneLayers = [];
      for (var j = 1; j <= sceneContainer.numLayers; j++) {
        var lyr = sceneContainer.layer(j);
        try {
          if (lyr.source instanceof CompItem) {
            var cn = lyr.source.name.toLowerCase();
            var skipW2 = ['light', 'shape_light', 'adjustment'];
            var skip3 = false;
            for (var sw = 0; sw < skipW2.length; sw++) {
              if (cn.indexOf(skipW2[sw]) !== -1) { skip3 = true; break; }
            }
            if (!skip3) sceneLayers.push({ layer: lyr, comp: lyr.source });
          }
        } catch(e) {}
      }
      sceneLayers.sort(function(a, b) { return a.layer.inPoint - b.layer.inPoint; });

      for (var si = 0; si < sceneLayers.length; si++) {
        var sl = sceneLayers[si];
        var childComp = sl.comp;
        var sceneIn  = sl.layer.inPoint.toFixed(3);
        var sceneOut = sl.layer.outPoint.toFixed(3);
        var sceneDur = (sl.layer.outPoint - sl.layer.inPoint).toFixed(3);

        var footageComps   = [];
        var textLayerNames = [];

        for (var k = 1; k <= childComp.numLayers; k++) {
          var cl = childComp.layer(k);
          var isT = false;
          try { if (cl.property('Source Text')) isT = true; } catch(e) {}
          if (isT) {
            try { textLayerNames.push(cl.name); } catch(e) {}
            continue;
          }
          try {
            if (cl.source instanceof CompItem) {
              var gc = cl.source;
              if (gc.numLayers === 0) {
                var alreadyIn = false;
                for (var fa = 0; fa < footageComps.length; fa++) {
                  if (footageComps[fa] === gc.name) { alreadyIn = true; break; }
                }
                if (!alreadyIn) footageComps.push(gc.name);
              }
            }
          } catch(e) {}
        }

        var subBeats = footageComps.length > 0 ? footageComps.length : 1;
        var minDur   = (parseFloat(sceneDur) * 0.6).toFixed(3);
        var maxDur   = (parseFloat(sceneDur) * 1.5).toFixed(3);

        L('SCENE|block:' + childComp.name +
          '|mainIn:' + sceneIn +
          '|mainOut:' + sceneOut +
          '|dur:' + sceneDur +
          '|minDur:' + minDur +
          '|maxDur:' + maxDur +
          '|subBeats:' + subBeats +
          '|footageCount:' + footageComps.length +
          '|footage:' + footageComps.join(',') +
          '|textLayers:' + textLayerNames.join(','));
      }
    }
  } else {
    L('SCENE_STRUCTURE_SKIP: could not find scene container');
  }
  L('');
  // ═══════════════════════════════════════════════════════════════
  // SECTION: EXPRESSION CONTROLS (the most important section)
  // Every professional template uses Color Control, Checkbox Control,
  // Slider Control, Point Control, Dropdown Menu Control on null/
  // adjustment layers. These are the REAL user-editable controls.
  // ═══════════════════════════════════════════════════════════════
  L('=== EXPRESSION CONTROLS ===');

  // Effect matchNames for all AE expression controllers
  var EXPR_EFFECTS = {
    'ADBE Color Control':    'color',
    'ADBE Checkbox Control': 'checkbox',
    'ADBE Slider Control':   'slider',
    'ADBE Point Control':    'point',
    'ADBE Angle Control':    'angle',
    'ADBE Dropdown Control': 'dropdown',
    'ADBE 3D Point Control': 'point3d',
    'ADBE Layer Control':    'layer',
  };

  // Internal layer keywords — these are template mechanics, never user-facing
  var INTERNAL_LAYER_KW = [
    'adjustment layer', 'rig', 'guide', 'matte', 'mask comp',
    'do not', 'dont', 'ignore', 'temp', 'deprecated',
    'internal', 'system', 'engine', '__'
  ];

  function isInternalControlLayer(name) {
    var n = name.toLowerCase();
    for (var ii = 0; ii < INTERNAL_LAYER_KW.length; ii++) {
      if (n.indexOf(INTERNAL_LAYER_KW[ii]) !== -1) return true;
    }
    return false;
  }

  // Scan every comp for expression control effects
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;

    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);

      // We want null layers, adjustment layers, solid layers that act as controllers
      // Skip text layers and precomps (they don't hold expression controls)
      var isTextEC = false;
      try { if (layer.property('Source Text')) isTextEC = true; } catch(e) {}
      if (isTextEC) continue;

      var isPrecompEC = false;
      try { if (layer.source instanceof CompItem) isPrecompEC = true; } catch(e) {}
      if (isPrecompEC) continue;

      if (isInternalControlLayer(layer.name)) continue;

      // Check effects on this layer
      var effects = layer.property('Effects');
      if (!effects) continue;

      for (var ef = 1; ef <= effects.numProperties; ef++) {
        var effect = effects.property(ef);
        var matchName = '';
        try { matchName = effect.matchName; } catch(e) {}

        var ctrlType = EXPR_EFFECTS[matchName];
        if (!ctrlType) continue;

        // Get the effect name (what the template author named it)
        var effectName = '';
        try { effectName = effect.name; } catch(e) {}

        // Get current value
        var currentVal = '';
        try {
          var prop = effect.property(1); // first property is always the value
          if (ctrlType === 'color') {
            var c = prop.value;
            // Convert 0-1 float to hex
            function toHex(v) {
              var h = Math.round(v * 255).toString(16);
              return h.length === 1 ? '0' + h : h;
            }
            currentVal = '#' + toHex(c[0]) + toHex(c[1]) + toHex(c[2]);
          } else if (ctrlType === 'checkbox') {
            currentVal = prop.value ? 'true' : 'false';
          } else if (ctrlType === 'point') {
            var pt = prop.value;
            currentVal = Math.round(pt[0]) + ',' + Math.round(pt[1]);
          } else if (ctrlType === 'point3d') {
            var pt3 = prop.value;
            currentVal = Math.round(pt3[0]) + ',' + Math.round(pt3[1]) + ',' + Math.round(pt3[2]);
          } else if (ctrlType === 'dropdown') {
            currentVal = prop.value.toString();
          } else {
            currentVal = prop.value.toString();
          }
        } catch(e) { currentVal = 'unknown'; }

        L('EXPR_CONTROL|comp:' + item.name +
          '|layer:' + layer.name +
          '|effect:' + effectName +
          '|type:' + ctrlType +
          '|matchName:' + matchName +
          '|value:' + currentVal +
          '|compW:' + item.width + '|compH:' + item.height);
      }
    }
  }
  L('');

  // ═══════════════════════════════════════════════════════════════
  // SECTION: POSITION MARKERS
  // Named solid/null layers that control where lines, connectors,
  // cameras point. Detected by name keywords.
  // ═══════════════════════════════════════════════════════════════
  L('=== POSITION MARKERS ===');

  var MARKER_KW = ['point', 'target', 'anchor', 'marker', 'pin',
                   'from', 'to', 'start', 'end', 'connect', 'loc',
                   'location', 'origin', 'dest', 'source', 'node'];

  function isPositionMarker(name) {
    var n = name.toLowerCase();
    for (var mi = 0; mi < MARKER_KW.length; mi++) {
      if (n.indexOf(MARKER_KW[mi]) !== -1) return true;
    }
    return false;
  }

  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;

    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);
      if (!isPositionMarker(layer.name)) continue;

      var isTextPM = false;
      try { if (layer.property('Source Text')) isTextPM = true; } catch(e) {}
      if (isTextPM) continue;

      var px = 0, py = 0;
      try { var pos = layer.property('Position').value; px = Math.round(pos[0]); py = Math.round(pos[1]); } catch(e) {}

      var isVisPM = true;
      try { isVisPM = layer.enabled; } catch(e) {}

      var layerTypePM = 'other';
      try { if (layer instanceof NullLayer) layerTypePM = 'null'; } catch(e) {}
      try {
        if (layer.source instanceof FootageItem) {
          var isSolidPM = false;
          try { isSolidPM = (layer.source.mainSource instanceof SolidSource); } catch(e) {}
          if (isSolidPM) layerTypePM = 'solid';
        }
      } catch(e) {}

      L('POSITION_MARKER|comp:' + item.name +
        '|layer:' + layer.name +
        '|layerType:' + layerTypePM +
        '|x:' + px + '|y:' + py +
        '|visible:' + isVisPM +
        '|compW:' + item.width + '|compH:' + item.height);
    }
  }
  L('');

  // ═══════════════════════════════════════════════════════════════
  // SECTION: TOGGLE LAYERS
  // Detects geo map country toggles and pattern-based toggles.
  // ═══════════════════════════════════════════════════════════════
  L('=== TOGGLE LAYERS ===');

  var INTERNAL_KW = [
    'adjustment', 'noise', 'vignette', 'shade', 'shadow', 'blur',
    'glow', 'overlay', 'color grade', 'lut', 'grain', 'matte',
    'mask', 'null', 'control', 'rig', 'expression', 'guide',
    'helper', 'reference', 'temp', 'test', 'draft', 'effect',
    'light', 'camera', 'settings', 'config', 'bg solid',
    'background solid', 'white solid', 'black solid'
  ];

  function isInternalLayer2(name) {
    var n = name.toLowerCase();
    for (var ii = 0; ii < INTERNAL_KW.length; ii++) {
      if (n.indexOf(INTERNAL_KW[ii]) !== -1) return true;
    }
    if (name.replace(/\s/g, '').length <= 1) return true;
    return false;
  }

  var GEO_KW = [
    'africa','america','asia','europe','australia','antarctica',
    'usa','uk','india','china','russia','brazil','canada',
    'germany','france','italy','spain','japan','korea',
    'north','south','east','west','central',
    'region','country','state','province','city','zone',
    'territory','district','county','continent','outlines',
    'mexico','argentina','peru','egypt','nigeria','ethiopia',
    'vietnam','thailand','indonesia','malaysia','pakistan',
    'bangladesh','myanmar','ukraine','poland','netherlands',
    'belgium','sweden','norway','finland','denmark','switzerland',
    'portugal','greece','turkey','iran','iraq','saudi','uae',
    'israel','colombia','venezuela','chile','ecuador','bolivia'
  ];

  function isGeoLayer2(name) {
    var n = name.toLowerCase();
    for (var gi = 0; gi < GEO_KW.length; gi++) {
      if (n.indexOf(GEO_KW[gi]) !== -1) return true;
    }
    return false;
  }

  var toggleGroupsFound = {};

  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    if (item.numLayers < 3) continue;

    var toggleCandidates = [];
    var geoCount = 0;

    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);
      var lName = layer.name;

      var isTextTG = false;
      try { if (layer.property('Source Text')) isTextTG = true; } catch(e) {}
      if (isTextTG) continue;

      try {
        if (layer.matchName === 'ADBE Camera Layer' || layer.matchName === 'ADBE Light Layer') continue;
      } catch(e) {}

      if (isInternalLayer2(lName)) continue;

      var isVisTG = true;
      try { isVisTG = layer.enabled; } catch(e) {}

      // Get position for center coordinates
      var tcX = 0, tcY = 0;
      try { var posTG = layer.property('Position').value; tcX = Math.round(posTG[0]); tcY = Math.round(posTG[1]); } catch(e) {}

      var isGeo = isGeoLayer2(lName);
      if (isGeo) geoCount++;

      toggleCandidates.push({ name: lName, visible: isVisTG, isGeo: isGeo, x: tcX, y: tcY });
    }

    if (geoCount >= 3) {
      var groupKey = item.name + '_geo';
      if (!toggleGroupsFound[groupKey]) {
        toggleGroupsFound[groupKey] = true;
        L('TOGGLE_GROUP|comp:' + item.name + '|type:geo_map|count:' + geoCount);
        for (var tc = 0; tc < toggleCandidates.length; tc++) {
          if (toggleCandidates[tc].isGeo) {
            L('TOGGLE_LAYER|comp:' + item.name +
              '|layer:' + toggleCandidates[tc].name +
              '|defaultVisible:' + toggleCandidates[tc].visible +
              '|type:geo_map' +
              '|centerX:' + toggleCandidates[tc].x +
              '|centerY:' + toggleCandidates[tc].y);
          }
        }
      }
    } else if (toggleCandidates.length >= 4) {
      var firstPrefix = '';
      if (toggleCandidates.length > 0) {
        var parts = toggleCandidates[0].name.split(/[\s_\-]/);
        if (parts.length > 1) firstPrefix = parts[0].toLowerCase();
      }
      var patternCount = 0;
      if (firstPrefix.length > 1) {
        for (var tc = 0; tc < toggleCandidates.length; tc++) {
          if (toggleCandidates[tc].name.toLowerCase().indexOf(firstPrefix) === 0) patternCount++;
        }
      }
      if (patternCount >= 4) {
        var groupKey2 = item.name + '_pattern';
        if (!toggleGroupsFound[groupKey2]) {
          toggleGroupsFound[groupKey2] = true;
          L('TOGGLE_GROUP|comp:' + item.name + '|type:pattern|count:' + patternCount + '|prefix:' + firstPrefix);
          for (var tc = 0; tc < toggleCandidates.length; tc++) {
            if (toggleCandidates[tc].name.toLowerCase().indexOf(firstPrefix) === 0) {
              L('TOGGLE_LAYER|comp:' + item.name +
                '|layer:' + toggleCandidates[tc].name +
                '|defaultVisible:' + toggleCandidates[tc].visible +
                '|type:pattern' +
                '|centerX:' + toggleCandidates[tc].x +
                '|centerY:' + toggleCandidates[tc].y);
            }
          }
        }
      }
    }
  }
  L('');

  // ═══════════════════════════════════════════════════════════════
  // SECTION: SOLID COLOR LAYERS (brand colors)
  // Solid layers that are likely user-editable brand/accent colors.
  // ═══════════════════════════════════════════════════════════════
  L('=== SOLID COLORS ===');

  var COLOR_USER_KW = [
    'color', 'colour', 'accent', 'brand', 'primary', 'secondary',
    'highlight', 'fill', 'bg', 'background', 'stroke', 'line',
    'bar', 'block', 'shape', 'overlay'
  ];
  var COLOR_SKIP_KW = [
    'shadow', 'vignette', 'noise', 'grain', 'matte',
    'mask', 'dirt', 'texture', 'paper', 'tape', 'pin', 'clip'
  ];

  function isUserColorSolid(name) {
    var n = name.toLowerCase();
    for (var ski = 0; ski < COLOR_SKIP_KW.length; ski++) {
      if (n.indexOf(COLOR_SKIP_KW[ski]) !== -1) return false;
    }
    for (var uki = 0; uki < COLOR_USER_KW.length; uki++) {
      if (n.indexOf(COLOR_USER_KW[uki]) !== -1) return true;
    }
    return false;
  }

  var solidColorsSeen = {};

  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;

    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);

      try {
        if (!(layer.source instanceof FootageItem)) continue;
        var isSolidSC = false;
        try { isSolidSC = (layer.source.mainSource instanceof SolidSource); } catch(e) {}
        if (!isSolidSC) continue;

        var solidName = layer.name;
        if (!isUserColorSolid(solidName)) continue;

        // Deduplicate by layer name across comps
        if (solidColorsSeen[solidName]) continue;
        solidColorsSeen[solidName] = true;

        // Get solid color
        var r = 0, g = 0, b = 0;
        try {
          var solidColor = layer.source.mainSource.color;
          r = Math.round(solidColor[0] * 255);
          g = Math.round(solidColor[1] * 255);
          b = Math.round(solidColor[2] * 255);
        } catch(e) {}

        function toHex2(v) { var h = v.toString(16); return h.length === 1 ? '0' + h : h; }
        var hexColor = '#' + toHex2(r) + toHex2(g) + toHex2(b);

        var absInSC = getAbsoluteTime(item.name, layer.inPoint).toFixed(3);
        var absOutSC = getAbsoluteTime(item.name, layer.outPoint).toFixed(3);

        L('SOLID_COLOR|comp:' + item.name +
          '|layer:' + solidName +
          '|hex:' + hexColor +
          '|r:' + r + '|g:' + g + '|b:' + b +
          '|absIn:' + absInSC + '|absOut:' + absOutSC);

      } catch(e) {}
    }
  }
  L('');
  
  L('SCAN_COMPLETE');
} catch(e) {
  L('EXCEPTION: ' + e.toString() + ' line:' + e.line);
}
_log.close();

var srcF = new File(LOG_PATH);
var dstF = new File(RESULT_PATH);
srcF.open('r');
dstF.open('w');
while (!srcF.eof) { dstF.writeln(srcF.readln()); }
srcF.close();
dstF.close();

app.quit();