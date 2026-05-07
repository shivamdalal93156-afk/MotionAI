var AEP_PATH    = "C:/Users/SHIVAM/Desktop/motionai/backend/templates/labor_day_slideshow/Labor Day Slideshow (converted) (converted).aep";
var LOG_PATH    = "C:/Users/SHIVAM/Desktop/motionai/backend/templates/labor_day_slideshow/_scan.log";
var RESULT_PATH = "C:/Users/SHIVAM/Desktop/motionai/backend/templates/labor_day_slideshow/scan_result.txt";
var TEMPLATE    = "labor_day_slideshow";
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
      L('IMAGE_INJECT|type:comp_inject|comp:' + item.name + '|w:' + item.width + '|h:' + item.height + '|absIn:' + absIn + '|absOut:' + absOut);
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
          L('IMAGE_INJECT|type:replace|comp:' + item.name + '|layer:' + layer.name + '|source:' + src.name + '|w:' + src.width + '|h:' + src.height + '|absIn:' + absIn + '|absOut:' + absOut);
        }
      } catch(e) {}
    }
  }
  L('');

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