var AEP_PATH    = "C:/Users/SHIVAM/Desktop/motionai/backend/templates/Investigation Board/Investigation_Board_II (converted).aep";
var LOG_PATH    = "C:/Users/SHIVAM/Desktop/motionai/backend/templates/Investigation Board/_scan.log";
var RESULT_PATH = "C:/Users/SHIVAM/Desktop/motionai/backend/templates/Investigation Board/scan_result.txt";
var TEMPLATE    = "Investigation Board";
// PATHS INJECTED BY scan_template.js
// var AEP_PATH, LOG_PATH, RESULT_PATH, TEMPLATE defined above this

var _log = new File(LOG_PATH);
_log.open('w');
function L(msg) { _log.writeln(msg); }

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
function simplifyRatio(w, h) {
  if (!w || !h) return '1:1';
  var d = gcd(Math.round(w), Math.round(h));
  return Math.round(w/d) + ':' + Math.round(h/d);
}
function toHex(v) {
  var h = Math.round(Math.max(0, Math.min(255, v * 255))).toString(16);
  return h.length === 1 ? '0' + h : h;
}
function toHex2(v) {
  var h = Math.max(0, Math.min(255, v)).toString(16);
  return h.length === 1 ? '0' + h : h;
}
function colorToHex(c) {
  try { return '#' + toHex(c[0]) + toHex(c[1]) + toHex(c[2]); } catch(e) { return '#000000'; }
}
function safeStr(s) {
  if (!s) return '';
  return s.split('|').join('/').split('\r').join('').split('\n').join(' ');
}
function round2(n) { return Math.round(n * 100) / 100; }

// ─── LAYER TYPE DETECTION ─────────────────────────────────────────────────────

function getLayerType(layer) {
  try { if (layer.matchName === 'ADBE Camera Layer') return 'camera'; } catch(e) {}
  try { if (layer.matchName === 'ADBE Light Layer')  return 'light';  } catch(e) {}
  try { if (layer instanceof NullLayer)  return 'null';  } catch(e) {}
  try { if (layer instanceof ShapeLayer) return 'shape'; } catch(e) {}
  try { if (layer instanceof TextLayer)  return 'text';  } catch(e) {}
  try {
    if (layer.source instanceof FootageItem) {
      var isSolid = false;
      try { isSolid = (layer.source.mainSource instanceof SolidSource); } catch(e) {}
      if (isSolid) return 'solid';
      return 'footage';
    }
  } catch(e) {}
  try { if (layer.source instanceof CompItem) return 'precomp'; } catch(e) {}
  return 'other';
}

function getBlendMode(layer) {
  try {
    var mode = layer.blendingMode;
    if (mode === BlendingMode.NORMAL)     return 'normal';
    if (mode === BlendingMode.ADD)        return 'add';
    if (mode === BlendingMode.MULTIPLY)   return 'multiply';
    if (mode === BlendingMode.SCREEN)     return 'screen';
    if (mode === BlendingMode.OVERLAY)    return 'overlay';
    if (mode === BlendingMode.DARKEN)     return 'darken';
    if (mode === BlendingMode.LIGHTEN)    return 'lighten';
    if (mode === BlendingMode.DIFFERENCE) return 'difference';
    if (mode === BlendingMode.LUMINOSITY) return 'luminosity';
    if (mode === BlendingMode.COLOR)      return 'color';
    if (mode === BlendingMode.HARD_LIGHT) return 'hard_light';
    if (mode === BlendingMode.SOFT_LIGHT) return 'soft_light';
    return 'other';
  } catch(e) { return 'normal'; }
}

function getTrackMatte(layer) {
  try {
    var tm = layer.trackMatteType;
    if (tm === TrackMatteType.NO_TRACK_MATTE) return 'none';
    if (tm === TrackMatteType.ALPHA)          return 'alpha';
    if (tm === TrackMatteType.ALPHA_INVERTED) return 'alpha_inverted';
    if (tm === TrackMatteType.LUMA)           return 'luma';
    if (tm === TrackMatteType.LUMA_INVERTED)  return 'luma_inverted';
    return 'other';
  } catch(e) { return 'none'; }
}

// ─── EXPRESSION DETECTION ─────────────────────────────────────────────────────

function propHasExpression(prop) {
  try { return prop.expressionEnabled && prop.expression && prop.expression.length > 0; }
  catch(e) { return false; }
}

function getKeyframeCount(prop) {
  try { return prop.numKeys || 0; } catch(e) { return 0; }
}

// Count total keyframes + expressions on a layer
function getLayerAnimInfo(layer) {
  var totalKeys = 0;
  var totalExprs = 0;
  try {
    // Transform props
    var tf = layer.property('Transform');
    if (tf) {
      var tfProps = ['Anchor Point','Position','Scale','Rotation','Opacity'];
      for (var ti = 0; ti < tfProps.length; ti++) {
        try {
          var p = tf.property(tfProps[ti]);
          totalKeys += getKeyframeCount(p);
          if (propHasExpression(p)) totalExprs++;
        } catch(e) {}
      }
    }
    // Effects
    var efx = layer.property('Effects');
    if (efx) {
      for (var ei = 1; ei <= efx.numProperties; ei++) {
        try {
          var ef = efx.property(ei);
          for (var epi = 1; epi <= ef.numProperties; epi++) {
            try {
              var ep = ef.property(epi);
              totalKeys += getKeyframeCount(ep);
              if (propHasExpression(ep)) totalExprs++;
            } catch(e) {}
          }
        } catch(e) {}
      }
    }
  } catch(e) {}
  return { keys: totalKeys, exprs: totalExprs };
}

// ─── FONT DETECTION ───────────────────────────────────────────────────────────

function getTextInfo(layer) {
  var info = { font: '', size: 0, align: '', text: '', hasAnimator: false };
  try {
    var doc = layer.property('Source Text').value;
    info.text  = safeStr(doc.text || '');
    info.font  = safeStr(doc.font || doc.fontFamily || '');
    info.size  = Math.round(doc.fontSize || 0);
    var just   = doc.justification;
    if (just === ParagraphJustification.LEFT_JUSTIFY)   info.align = 'left';
    else if (just === ParagraphJustification.RIGHT_JUSTIFY)  info.align = 'right';
    else if (just === ParagraphJustification.CENTER_JUSTIFY) info.align = 'center';
    else info.align = 'other';
  } catch(e) {}
  try {
    var animators = layer.property('Text').property('Animators');
    info.hasAnimator = (animators && animators.numProperties > 0);
  } catch(e) {}
  return info;
}

// ─── SHAPE LAYER COLOR SCAN ───────────────────────────────────────────────────

function scanShapeColors(layer) {
  var colors = [];
  try {
    function recurse(group) {
      try {
        for (var si = 1; si <= group.numProperties; si++) {
          try {
            var sp = group.property(si);
            var spName = sp.name || '';
            // Fill
            if (sp.matchName === 'ADBE Vector Graphic - Fill') {
              try {
                var c = sp.property('Color').value;
                colors.push({ type: 'fill', group: safeStr(spName), hex: colorToHex(c) });
              } catch(e) {}
            }
            // Stroke
            else if (sp.matchName === 'ADBE Vector Graphic - Stroke') {
              try {
                var c2 = sp.property('Color').value;
                var w2 = sp.property('Stroke Width').value;
                colors.push({ type: 'stroke', group: safeStr(spName), hex: colorToHex(c2), width: Math.round(w2) });
              } catch(e) {}
            }
            // Recurse into groups
            else if (sp.numProperties) {
              recurse(sp);
            }
          } catch(e) {}
        }
      } catch(e) {}
    }
    var contents = layer.property('Contents');
    if (contents) recurse(contents);
  } catch(e) {}
  return colors;
}

// ─── MASK SHAPE DETECTION ─────────────────────────────────────────────────────

function detectMaskShape(layer, compW, compH) {
  var result = { shape: 'rectangle', maskW: compW, maskH: compH, cornerRadius: 0, maskCount: 0 };
  try {
    var masks = layer.property('Masks');
    if (!masks || masks.numProperties === 0) return result;
    result.maskCount = masks.numProperties;
    var mask     = masks.property(1);
    var maskPath = mask.property('Mask Path');
    if (!maskPath) return result;
    var shape  = maskPath.value;
    var verts  = shape.vertices;
    var inTan  = shape.inTangents;
    var outTan = shape.outTangents;
    if (!verts || verts.length === 0) return result;
    var minX = verts[0][0], maxX = verts[0][0];
    var minY = verts[0][1], maxY = verts[0][1];
    for (var vi = 1; vi < verts.length; vi++) {
      if (verts[vi][0] < minX) minX = verts[vi][0];
      if (verts[vi][0] > maxX) maxX = verts[vi][0];
      if (verts[vi][1] < minY) minY = verts[vi][1];
      if (verts[vi][1] > maxY) maxY = verts[vi][1];
    }
    result.maskW = Math.round(maxX - minX);
    result.maskH = Math.round(maxY - minY);
    var nVerts = verts.length;
    if (nVerts === 4) {
      var aspect = result.maskW > 0 ? result.maskH / result.maskW : 1;
      var isSquarish = (aspect > 0.85 && aspect < 1.15);
      var totalTanMag = 0;
      for (var ti = 0; ti < inTan.length; ti++) {
        var ix = inTan[ti][0], iy = inTan[ti][1];
        var ox = outTan[ti][0], oy = outTan[ti][1];
        totalTanMag += Math.sqrt(ix*ix + iy*iy);
        totalTanMag += Math.sqrt(ox*ox + oy*oy);
      }
      var avgTanMag = totalTanMag / (nVerts * 2);
      var radius = Math.min(result.maskW, result.maskH) / 2;
      var expectedTan = 0.5523 * radius;
      if (isSquarish && avgTanMag > expectedTan * 0.7 && avgTanMag < expectedTan * 1.3) {
        result.shape = 'circle'; return result;
      }
      var hasTangents = false;
      for (var ti2 = 0; ti2 < outTan.length; ti2++) {
        var ox2 = outTan[ti2][0], oy2 = outTan[ti2][1];
        if (Math.sqrt(ox2*ox2 + oy2*oy2) > 2) { hasTangents = true; break; }
      }
      if (hasTangents) {
        var totalTan2 = 0;
        for (var ti3 = 0; ti3 < outTan.length; ti3++) {
          var ox3 = outTan[ti3][0], oy3 = outTan[ti3][1];
          totalTan2 += Math.sqrt(ox3*ox3 + oy3*oy3);
        }
        var cornerR = Math.round((totalTan2 / nVerts) / 0.5523);
        if (cornerR > 3) { result.shape = 'rounded_rect'; result.cornerRadius = cornerR; return result; }
      }
      result.shape = 'rectangle'; return result;
    }
    if (nVerts === 3) { result.shape = 'triangle'; return result; }
    if (nVerts >= 5)  { result.shape = 'polygon';  return result; }
  } catch(me) {}
  return result;
}

// ─── PLUGIN DETECTION ────────────────────────────────────────────────────────

var NATIVE_AE_EFFECTS = {
  'ADBE': true, 'APC ': true
};

function isThirdPartyEffect(matchName) {
  if (!matchName) return false;
  var prefix = matchName.substring(0, 4);
  return !NATIVE_AE_EFFECTS[prefix];
}

// Known plugins
var KNOWN_PLUGINS = {
  'EV': 'VideoCopilot',
  'TC ': 'Trapcode',
  'BCC': 'BorisFX',
  'FEC': 'FEC',
  'AEJ': 'AEJuice',
  'OPT': 'Optical_Flares'
};

function getPluginName(matchName) {
  if (!matchName) return 'unknown';
  for (var prefix in KNOWN_PLUGINS) {
    if (matchName.indexOf(prefix) === 0) return KNOWN_PLUGINS[prefix];
  }
  return matchName.split(' ')[0];
}

// ─── ESSENTIAL PROPERTIES SCAN ───────────────────────────────────────────────

function scanEssentialProperties(comp) {
  var results = [];
  try {
    var mgProps = comp.motionGraphicsTemplateControllerCount;
    // motionGraphicsTemplateControllerCount may not be available in all AE versions
  } catch(e) {}
  // Alternative: scan all layers for properties that canAddToMotionGraphicsTemplate
  try {
    for (var li = 1; li <= comp.numLayers; li++) {
      var layer = comp.layer(li);
      // Check transform
      var tf = layer.property('Transform');
      if (tf) {
        for (var ti = 1; ti <= tf.numProperties; ti++) {
          try {
            var p = tf.property(ti);
            var isEss = false; try { isEss = p.isEssential; } catch(ie) {}
            if (isEss) results.push({ layer: safeStr(layer.name), prop: safeStr(p.name), type: 'transform' });
          } catch(e) {}
        }
      }
      // Check effects
      var efx = layer.property('Effects');
      if (efx) {
        for (var ei = 1; ei <= efx.numProperties; ei++) {
          try {
            var ef = efx.property(ei);
            for (var epi = 1; epi <= ef.numProperties; epi++) {
              try {
                var ep = ef.property(epi);
                var isEssE = false; try { isEssE = ep.isEssential; } catch(ie) {}
                if (isEssE) results.push({ layer: safeStr(layer.name), effect: safeStr(ef.name), prop: safeStr(ep.name), type: 'effect' });
              } catch(e) {}
            }
          } catch(e) {}
        }
      }
      // Source text
      try {
        var st = layer.property('Source Text');
        var isEssT = false; try { isEssT = st && st.isEssential; } catch(ie) {}
        if (isEssT) results.push({ layer: safeStr(layer.name), prop: 'Source Text', type: 'text' });
      } catch(e) {}
    }
  } catch(e) {}
  return results;
}

// ─── PARENTING CHAIN MAP ──────────────────────────────────────────────────────

function getParentChain(layer) {
  var chain = [];
  try {
    var current = layer.parent;
    var safety = 0;
    while (current && safety < 10) {
      chain.push(safeStr(current.name));
      current = current.parent;
      safety++;
    }
  } catch(e) {}
  return chain.join(' > ');
}

// ─── COMP MARKERS ─────────────────────────────────────────────────────────────

function getCompMarkers(comp) {
  var markers = [];
  try {
    var mp = comp.markerProperty;
    for (var mi = 1; mi <= mp.numKeys; mi++) {
      try {
        var mt   = mp.keyTime(mi);
        var mv   = mp.keyValue(mi);
        var comment = safeStr(mv.comment || '');
        var chapter = safeStr(mv.chapter || '');
        var label   = mv.label || 0;
        markers.push({ time: round2(mt), comment: comment, chapter: chapter, label: label });
      } catch(e) {}
    }
  } catch(e) {}
  return markers;
}

// ─── MAIN SCAN ───────────────────────────────────────────────────────────────

try {
  L('=== MOTIONAI COMPLETE SCAN v5.0 ===');
  L('template: ' + TEMPLATE);
  L('aep: ' + AEP_PATH);
  L('scanned_at: ' + new Date().toString());
  L('');

  var f = new File(AEP_PATH);
  app.open(f);
  L('OPEN_OK|items:' + app.project.numItems);
  L('');

  // ── Build indexes ────────────────────────────────────────────────────────────
  var compIndex = {};
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (item instanceof CompItem) compIndex[item.name] = item;
  }

  // Parent map: which comps contain which other comps as layers
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

  // Instance map: how many times each footage item is used
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

  // ── SECTION 1: RENDER COMP CANDIDATES ────────────────────────────────────────
  L('=== RENDER COMP CANDIDATES ===');
  var renderKeywords = ['render', 'main', 'master', 'final', 'output', 'export', 'compostion', 'composition'];
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
    L('RENDER_COMP|name:' + rc.name + '|dur:' + rc.dur.toFixed(3) + '|fps:' + rc.fps.toFixed(3) + '|res:' + rc.w + 'x' + rc.h + '|frames:' + Math.round(rc.dur * rc.fps) + '|confidence:' + conf + '|score:' + rc.score);
  }
  L('');

  // ── SECTION 2: COMP MARKERS (all comps) ──────────────────────────────────────
  L('=== COMP MARKERS ===');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    var markers = getCompMarkers(item);
    if (markers.length === 0) continue;
    for (var mi = 0; mi < markers.length; mi++) {
      var mk = markers[mi];
      L('COMP_MARKER|comp:' + item.name +
        '|time:' + mk.time +
        '|comment:' + mk.comment +
        '|chapter:' + mk.chapter +
        '|label:' + mk.label);
    }
  }
  L('');

  // ── SECTION 3: PROJECT FOOTAGE ITEMS ─────────────────────────────────────────
  L('=== PROJECT FOOTAGE ITEMS ===');
  var missingCount = 0;
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
    if (isMissing) missingCount++;
    var ext = item.name.split('.').pop().toLowerCase();
    var mediaExts = ['jpg','jpeg','png','webp','gif','tif','tiff','psd','ai','mp4','mov','avi','webm','mxf'];
    var isMedia = false;
    for (var m = 0; m < mediaExts.length; m++) { if (mediaExts[m] === ext) { isMedia = true; break; } }
    L('FOOTAGE_ITEM|id:' + i +
      '|name:' + safeStr(item.name) +
      '|w:' + item.width + '|h:' + item.height +
      '|instances:' + (instanceMap[item.name] || 0) +
      '|missing:' + isMissing +
      '|isMedia:' + isMedia +
      '|ext:' + ext +
      '|file:' + safeStr(filePath));
  }
  L('FOOTAGE_SUMMARY|total_missing:' + missingCount);
  L('');

  // ── SECTION 4: FULL COMP LAYER DETAIL ────────────────────────────────────────
  L('=== COMP LAYER DETAIL ===');
  var thirdPartyPlugins = {};

  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;

    // Comp markers inline
    var compMarkers = getCompMarkers(item);
    var markerStr = '';
    for (var mi = 0; mi < compMarkers.length; mi++) {
      markerStr += compMarkers[mi].comment + '@' + compMarkers[mi].time + ';';
    }

    L('COMP|name:' + safeStr(item.name) +
      '|dur:' + item.duration.toFixed(3) +
      '|fps:' + item.frameRate.toFixed(3) +
      '|w:' + item.width + '|h:' + item.height +
      '|layers:' + item.numLayers +
      '|markers:' + markerStr);

    for (var j = 1; j <= item.numLayers; j++) {
      var layer    = item.layer(j);
      var lName    = safeStr(layer.name);
      var lType    = getLayerType(layer);
      var lIn      = layer.inPoint.toFixed(3);
      var lOut     = layer.outPoint.toFixed(3);
      var absIn    = getAbsoluteTime(item.name, layer.inPoint).toFixed(3);
      var absOut   = getAbsoluteTime(item.name, layer.outPoint).toFixed(3);
      var lEnabled = layer.enabled;
      var lSolo    = layer.solo;
      var blendMode = getBlendMode(layer);
      var trackMatte = getTrackMatte(layer);
      var parentChain = getParentChain(layer);
      var animInfo = getLayerAnimInfo(layer);

      // Layer markers
      var layerMarkerStr = '';
      try {
        var lmp = layer.property('Marker');
        if (lmp) {
          for (var lmi = 1; lmi <= lmp.numKeys; lmi++) {
            try {
              var lmv = lmp.keyValue(lmi);
              layerMarkerStr += safeStr(lmv.comment || '') + '@' + round2(lmp.keyTime(lmi)) + ';';
            } catch(e) {}
          }
        }
      } catch(e) {}

      // Adjustment layer flag
      var isAdjustment = false;
      try { isAdjustment = layer.adjustmentLayer; } catch(e) {}

      // Locked
      var isLocked = false;
      try { isLocked = layer.locked; } catch(e) {}

      // Shy
      var isShy = false;
      try { isShy = layer.shy; } catch(e) {}

      // 3D layer
      var is3D = false;
      try { is3D = layer.threeDLayer; } catch(e) {}

      var commonFields = '|in:' + lIn + '|out:' + lOut +
        '|absIn:' + absIn + '|absOut:' + absOut +
        '|enabled:' + lEnabled +
        '|adjustment:' + isAdjustment +
        '|3d:' + is3D +
        '|blend:' + blendMode +
        '|matte:' + trackMatte +
        '|keys:' + animInfo.keys +
        '|exprs:' + animInfo.exprs +
        '|parent:' + parentChain +
        '|markers:' + layerMarkerStr;

      if (lType === 'text') {
        var tInfo = getTextInfo(layer);
        L('  TEXT|name:' + lName +
          '|val:' + tInfo.text +
          '|font:' + tInfo.font +
          '|size:' + tInfo.size +
          '|align:' + tInfo.align +
          '|hasAnimator:' + tInfo.hasAnimator +
          commonFields);

        // Scan effects on text layer too
        try {
          var efx = layer.property('Effects');
          if (efx && efx.numProperties > 0) {
            for (var ei = 1; ei <= efx.numProperties; ei++) {
              try {
                var ef = efx.property(ei);
                var mn = ef.matchName || '';
                if (isThirdPartyEffect(mn)) thirdPartyPlugins[mn] = ef.name;
                L('    EFFECT|name:' + safeStr(ef.name) + '|matchName:' + mn + '|thirdParty:' + isThirdPartyEffect(mn));
              } catch(e) {}
            }
          }
        } catch(e) {}
        continue;
      }

      if (lType === 'null') {
        L('  NULL|name:' + lName + commonFields);
        // Null layers often hold expression controls — scan them
        try {
          var efx = layer.property('Effects');
          if (efx && efx.numProperties > 0) {
            for (var ei = 1; ei <= efx.numProperties; ei++) {
              try {
                var ef = efx.property(ei);
                var mn = ef.matchName || '';
                if (isThirdPartyEffect(mn)) thirdPartyPlugins[mn] = ef.name;
                L('    EFFECT|name:' + safeStr(ef.name) + '|matchName:' + mn + '|thirdParty:' + isThirdPartyEffect(mn));
              } catch(e) {}
            }
          }
        } catch(e) {}
        continue;
      }

      if (lType === 'shape') {
        var shapeColors = scanShapeColors(layer);
        var colorStr = '';
        for (var sci = 0; sci < shapeColors.length; sci++) {
          colorStr += shapeColors[sci].type + ':' + shapeColors[sci].hex + ';';
        }
        L('  SHAPE|name:' + lName + '|colors:' + colorStr + commonFields);
        // Effects on shape layers
        try {
          var efx = layer.property('Effects');
          if (efx && efx.numProperties > 0) {
            for (var ei = 1; ei <= efx.numProperties; ei++) {
              try {
                var ef = efx.property(ei);
                var mn = ef.matchName || '';
                if (isThirdPartyEffect(mn)) thirdPartyPlugins[mn] = ef.name;
                L('    EFFECT|name:' + safeStr(ef.name) + '|matchName:' + mn + '|thirdParty:' + isThirdPartyEffect(mn));
              } catch(e) {}
            }
          }
        } catch(e) {}
        continue;
      }

      if (lType === 'camera') {
        var camType = 'unknown';
        try { camType = layer.property('Camera Options') ? 'camera' : 'unknown'; } catch(e) {}
        var camPos = '0,0,0';
        try {
          var cp = layer.property('Transform').property('Position').value;
          camPos = Math.round(cp[0]) + ',' + Math.round(cp[1]) + ',' + Math.round(cp[2]);
        } catch(e) {}
        var camKeys = 0;
        try { camKeys = layer.property('Transform').property('Position').numKeys; } catch(e) {}
        L('  CAMERA|name:' + lName + '|pos:' + camPos + '|posKeys:' + camKeys + commonFields);
        continue;
      }

      if (lType === 'light') {
        var lightIntensity = 100;
        try { lightIntensity = layer.property('Light Options').property('Intensity').value; } catch(e) {}
        L('  LIGHT|name:' + lName + '|intensity:' + lightIntensity + commonFields);
        continue;
      }

      if (lType === 'solid') {
        var solidHex = '#000000';
        try {
          var sc = layer.source.mainSource.color;
          solidHex = colorToHex(sc);
        } catch(e) {}
        var maskInfo = detectMaskShape(layer, item.width, item.height);
        L('  SOLID|name:' + lName +
          '|hex:' + solidHex +
          '|maskShape:' + maskInfo.shape +
          '|maskW:' + maskInfo.maskW +
          '|maskH:' + maskInfo.maskH +
          '|maskCount:' + maskInfo.maskCount +
          commonFields);
        // Scan effects on solid (expression controllers live here)
        try {
          var efx = layer.property('Effects');
          if (efx && efx.numProperties > 0) {
            for (var ei = 1; ei <= efx.numProperties; ei++) {
              try {
                var ef = efx.property(ei);
                var mn = ef.matchName || '';
                if (isThirdPartyEffect(mn)) thirdPartyPlugins[mn] = ef.name;
                L('    EFFECT|name:' + safeStr(ef.name) + '|matchName:' + mn + '|thirdParty:' + isThirdPartyEffect(mn));
              } catch(e) {}
            }
          }
        } catch(e) {}
        continue;
      }

      if (lType === 'footage') {
        var src = layer.source;
        var srcFile = 'no_file';
        try { srcFile = src.mainSource && src.mainSource.file ? src.mainSource.file.fsName : 'no_file'; } catch(e) {}
        var isMissingF = false;
        try { isMissingF = src.mainSource ? src.mainSource.isMissing : false; } catch(e) {}
        var maskInfoF = detectMaskShape(layer, item.width, item.height);
        L('  FOOTAGE|name:' + lName +
          '|source:' + safeStr(src.name) +
          '|w:' + src.width + '|h:' + src.height +
          '|missing:' + isMissingF +
          '|maskShape:' + maskInfoF.shape +
          '|maskW:' + maskInfoF.maskW +
          '|maskH:' + maskInfoF.maskH +
          commonFields);
        // Effects
        try {
          var efx = layer.property('Effects');
          if (efx && efx.numProperties > 0) {
            for (var ei = 1; ei <= efx.numProperties; ei++) {
              try {
                var ef = efx.property(ei);
                var mn = ef.matchName || '';
                if (isThirdPartyEffect(mn)) thirdPartyPlugins[mn] = ef.name;
                L('    EFFECT|name:' + safeStr(ef.name) + '|matchName:' + mn + '|thirdParty:' + isThirdPartyEffect(mn));
              } catch(e) {}
            }
          }
        } catch(e) {}
        continue;
      }

      if (lType === 'precomp') {
        L('  PRECOMP|name:' + lName + '|source:' + safeStr(layer.source.name) + commonFields);
        continue;
      }

      L('  OTHER|name:' + lName + '|type:' + lType + commonFields);
    }
  }
  L('');

  // ── SECTION 5: PLUGIN REPORT ──────────────────────────────────────────────────
  L('=== THIRD PARTY PLUGINS DETECTED ===');
  var pluginCount = 0;
  for (var mn in thirdPartyPlugins) {
    L('PLUGIN|matchName:' + mn + '|name:' + safeStr(thirdPartyPlugins[mn]) + '|vendor:' + getPluginName(mn));
    pluginCount++;
  }
  if (pluginCount === 0) L('PLUGIN_NONE: all effects are native AE');
  L('');

  // ── SECTION 6: ESSENTIAL PROPERTIES ──────────────────────────────────────────
  L('=== ESSENTIAL PROPERTIES ===');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    var essProps = scanEssentialProperties(item);
    for (var ep = 0; ep < essProps.length; ep++) {
      var esp = essProps[ep];
      L('ESSENTIAL_PROP|comp:' + safeStr(item.name) +
        '|layer:' + (esp.layer || '') +
        '|effect:' + (esp.effect || '') +
        '|prop:' + (esp.prop || '') +
        '|type:' + esp.type);
    }
  }
  L('');

  // ── SECTION 7: INJECTABLE SUMMARY ────────────────────────────────────────────
  L('=== INJECTABLE SUMMARY ===');

  // TEXT INJECTABLES
  L('-- TEXT INJECTABLES --');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);
      var isText = false;
      try { if (layer.property('Source Text')) isText = true; } catch(e) {}
      if (!isText) continue;
      var tInfo = getTextInfo(layer);
      if (!tInfo.text || tInfo.text.length === 0) continue;
      var absIn  = getAbsoluteTime(item.name, layer.inPoint).toFixed(3);
      var absOut = getAbsoluteTime(item.name, layer.outPoint).toFixed(3);
      L('TEXT_INJECT|comp:' + safeStr(item.name) +
        '|layer:' + safeStr(layer.name) +
        '|val:' + tInfo.text +
        '|font:' + tInfo.font +
        '|size:' + tInfo.size +
        '|align:' + tInfo.align +
        '|hasAnimator:' + tInfo.hasAnimator +
        '|absIn:' + absIn + '|absOut:' + absOut);
    }
  }
  L('');

  // IMAGE INJECTABLES (comp_inject + replace)
  L('-- IMAGE INJECTABLES --');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    if (item.numLayers === 0 && parentMap[item.name]) {
      var absIn  = getAbsoluteTime(item.name, 0).toFixed(3);
      var absOut = getAbsoluteTime(item.name, item.duration).toFixed(3);
      L('IMAGE_INJECT|type:comp_inject|comp:' + safeStr(item.name) +
        '|w:' + item.width + '|h:' + item.height +
        '|ratio:' + simplifyRatio(item.width, item.height) +
        '|absIn:' + absIn + '|absOut:' + absOut);
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
          var maskInfoI = detectMaskShape(layer, item.width, item.height);
          L('IMAGE_INJECT|type:replace|comp:' + safeStr(item.name) +
            '|layer:' + safeStr(layer.name) +
            '|source:' + safeStr(src.name) +
            '|w:' + src.width + '|h:' + src.height +
            '|ratio:' + simplifyRatio(src.width, src.height) +
            '|maskShape:' + maskInfoI.shape +
            '|absIn:' + absIn + '|absOut:' + absOut);
        }
      } catch(e) {}
    }
  }
  L('');

  // SOLID INJECTABLES
  L('-- SOLID INJECTABLES --');
  var SLOT_POSITIVE_KW = ['photo','image','img','picture','pic','portrait','avatar','face','person','media','footage','placeholder','replace','insert','slot','logo','foto','headshot','thumb','thumbnail'];
  var SLOT_NEGATIVE_KW = ['null','adjustment','control','rig','guide','matte','mask','vignette','shadow','noise','grain','overlay','bg solid','background solid','white solid','black solid','color solid','colour solid','do not','dont','ignore','temp','deprecated'];

  function isSolidPhotoSlot(layerName) {
    var n = layerName.toLowerCase();
    for (var ni = 0; ni < SLOT_NEGATIVE_KW.length; ni++) { if (n.indexOf(SLOT_NEGATIVE_KW[ni]) !== -1) return false; }
    for (var pi = 0; pi < SLOT_POSITIVE_KW.length; pi++) { if (n.indexOf(SLOT_POSITIVE_KW[pi]) !== -1) return true; }
    if (/[a-z].*_\d+/i.test(layerName)) return true;
    return false;
  }

  var solidSlotsSeen = {};
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);
      var isSolidSlot = false;
      try { if (layer.source instanceof FootageItem) isSolidSlot = (layer.source.mainSource instanceof SolidSource); } catch(e) {}
      if (!isSolidSlot) continue;
      if (!isSolidPhotoSlot(layer.name)) continue;
      var slotKey = safeStr(item.name) + '||' + safeStr(layer.name);
      if (solidSlotsSeen[slotKey]) continue;
      solidSlotsSeen[slotKey] = true;
      var solidW = item.width, solidH = item.height;
      try { solidW = layer.source.width || item.width; solidH = layer.source.height || item.height; } catch(se) {}
      var maskInfo = detectMaskShape(layer, solidW, solidH);
      var absInS  = getAbsoluteTime(item.name, layer.inPoint).toFixed(3);
      var absOutS = getAbsoluteTime(item.name, layer.outPoint).toFixed(3);
      L('SOLID_INJECT|comp:' + safeStr(item.name) +
        '|layer:' + safeStr(layer.name) +
        '|compW:' + item.width + '|compH:' + item.height +
        '|solidW:' + solidW + '|solidH:' + solidH +
        '|slotW:' + maskInfo.maskW + '|slotH:' + maskInfo.maskH +
        '|maskShape:' + maskInfo.shape +
        '|cornerRadius:' + maskInfo.cornerRadius +
        '|maskCount:' + maskInfo.maskCount +
        '|ratio:' + simplifyRatio(maskInfo.maskW, maskInfo.maskH) +
        '|absIn:' + absInS + '|absOut:' + absOutS);
    }
  }
  L('');

  // ── SECTION 8: EXPRESSION CONTROLS ───────────────────────────────────────────
  L('=== EXPRESSION CONTROLS ===');
  var EXPR_EFFECTS = {
    'ADBE Color Control':    'color',
    'ADBE Checkbox Control': 'checkbox',
    'ADBE Slider Control':   'slider',
    'ADBE Point Control':    'point',
    'ADBE Angle Control':    'angle',
    'ADBE Dropdown Control': 'dropdown',
    'ADBE 3D Point Control': 'point3d',
    'ADBE Layer Control':    'layer'
  };

  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);
      var isTextEC = false;
      try { if (layer.property('Source Text')) isTextEC = true; } catch(e) {}
      if (isTextEC) continue;
      var isPrecompEC = false;
      try { if (layer.source instanceof CompItem) isPrecompEC = true; } catch(e) {}
      if (isPrecompEC) continue;
      var effects = layer.property('Effects');
      if (!effects) continue;
      for (var ef = 1; ef <= effects.numProperties; ef++) {
        var effect = effects.property(ef);
        var matchName = '';
        try { matchName = effect.matchName; } catch(e) {}
        var ctrlType = EXPR_EFFECTS[matchName];
        if (!ctrlType) continue;
        var effectName = '';
        try { effectName = effect.name; } catch(e) {}
        var currentVal = '';
        try {
          var prop = effect.property(1);
          if (ctrlType === 'color') {
            currentVal = colorToHex(prop.value);
          } else if (ctrlType === 'checkbox') {
            currentVal = prop.value ? 'true' : 'false';
          } else if (ctrlType === 'point') {
            var pt = prop.value;
            currentVal = Math.round(pt[0]) + ',' + Math.round(pt[1]);
          } else if (ctrlType === 'point3d') {
            var pt3 = prop.value;
            currentVal = Math.round(pt3[0]) + ',' + Math.round(pt3[1]) + ',' + Math.round(pt3[2]);
          } else {
            currentVal = prop.value.toString();
          }
        } catch(e) { currentVal = 'unknown'; }
        var numKeysEC = 0;
        try { numKeysEC = effect.property(1).numKeys; } catch(e) {}
        L('EXPR_CONTROL|comp:' + safeStr(item.name) +
          '|layer:' + safeStr(layer.name) +
          '|effect:' + safeStr(effectName) +
          '|type:' + ctrlType +
          '|value:' + currentVal +
          '|hasKeyframes:' + (numKeysEC > 0) +
          '|compW:' + item.width + '|compH:' + item.height);
      }
    }
  }
  L('');

  // ── SECTION 9: SHAPE LAYER COLORS ─────────────────────────────────────────────
  L('=== SHAPE LAYER COLORS ===');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);
      var isShapeEC = false;
      try { isShapeEC = (layer instanceof ShapeLayer); } catch(e) {}
      if (!isShapeEC) continue;
      var shapeColors = scanShapeColors(layer);
      for (var sci = 0; sci < shapeColors.length; sci++) {
        var sc = shapeColors[sci];
        L('SHAPE_COLOR|comp:' + safeStr(item.name) +
          '|layer:' + safeStr(layer.name) +
          '|type:' + sc.type +
          '|hex:' + sc.hex +
          (sc.width ? '|strokeWidth:' + sc.width : ''));
      }
    }
  }
  L('');

  // ── SECTION 10: AUDIO LAYERS ──────────────────────────────────────────────────
  L('=== AUDIO LAYERS ===');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);
      var hasAudio = false;
      try { hasAudio = layer.hasAudio; } catch(e) {}
      if (!hasAudio) continue;
      var audioOnly = false;
      try { audioOnly = !layer.hasVideo; } catch(e) {}
      if (!audioOnly) continue;
      var srcName = '';
      try { srcName = safeStr(layer.source.name); } catch(e) {}
      var lIn  = layer.inPoint.toFixed(3);
      var lOut = layer.outPoint.toFixed(3);
      L('AUDIO_LAYER|comp:' + safeStr(item.name) +
        '|layer:' + safeStr(layer.name) +
        '|source:' + srcName +
        '|in:' + lIn + '|out:' + lOut);
    }
  }
  L('');

  // ── SECTION 11: SOLID COLORS (brand/accent) ────────────────────────────────
  L('=== SOLID COLORS ===');
  var COLOR_USER_KW = ['color','colour','accent','brand','primary','secondary','highlight','fill','bg','background','stroke','line','bar','block','shape','overlay'];
  var COLOR_SKIP_KW = ['shadow','vignette','noise','grain','matte','mask','dirt','texture','paper','tape','pin','clip'];

  function isUserColorSolid(name) {
    var n = name.toLowerCase();
    for (var ski = 0; ski < COLOR_SKIP_KW.length; ski++) { if (n.indexOf(COLOR_SKIP_KW[ski]) !== -1) return false; }
    for (var uki = 0; uki < COLOR_USER_KW.length; uki++) { if (n.indexOf(COLOR_USER_KW[uki]) !== -1) return true; }
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
        var isSolidSC2 = false;
        try { isSolidSC2 = (layer.source.mainSource instanceof SolidSource); } catch(e) {}
        if (!isSolidSC2) continue;
        if (!isUserColorSolid(layer.name)) continue;
        if (solidColorsSeen[layer.name]) continue;
        solidColorsSeen[layer.name] = true;
        var solidColor = layer.source.mainSource.color;
        var hexColor = colorToHex(solidColor);
        var absInSC = getAbsoluteTime(item.name, layer.inPoint).toFixed(3);
        var absOutSC = getAbsoluteTime(item.name, layer.outPoint).toFixed(3);
        L('SOLID_COLOR|comp:' + safeStr(item.name) +
          '|layer:' + safeStr(layer.name) +
          '|hex:' + hexColor +
          '|absIn:' + absInSC + '|absOut:' + absOutSC);
      } catch(e) {}
    }
  }
  L('');

  // ── SECTION 12: POSITION MARKERS ─────────────────────────────────────────────
  L('=== POSITION MARKERS ===');
  var MARKER_KW = ['point','target','anchor','marker','pin','from','to','start','end','connect','loc','location','origin','dest','source','node'];
  function isPositionMarker(name) {
    var n = name.toLowerCase();
    for (var mi2 = 0; mi2 < MARKER_KW.length; mi2++) { if (n.indexOf(MARKER_KW[mi2]) !== -1) return true; }
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
      var lTypePM = getLayerType(layer);
      L('POSITION_MARKER|comp:' + safeStr(item.name) +
        '|layer:' + safeStr(layer.name) +
        '|layerType:' + lTypePM +
        '|x:' + px + '|y:' + py +
        '|visible:' + layer.enabled +
        '|compW:' + item.width + '|compH:' + item.height);
    }
  }
  L('');

  // ── SECTION 13: TOGGLE LAYERS ─────────────────────────────────────────────────
  L('=== TOGGLE LAYERS ===');
  var INTERNAL_KW = ['adjustment','noise','vignette','shade','shadow','blur','glow','overlay','color grade','lut','grain','matte','mask','null','control','rig','expression','guide','helper','reference','temp','test','draft','effect','light','camera','settings','config','bg solid','background solid','white solid','black solid'];
  var GEO_KW = ['africa','america','asia','europe','australia','antarctica','usa','uk','india','china','russia','brazil','canada','germany','france','italy','spain','japan','korea','north','south','east','west','central','region','country','state','province','city','zone','territory','district','county','continent','outlines','mexico','argentina','peru','egypt','nigeria','ethiopia','vietnam','thailand','indonesia','malaysia','pakistan','bangladesh','myanmar','ukraine','poland','netherlands','belgium','sweden','norway','finland','denmark','switzerland','portugal','greece','turkey','iran','iraq','saudi','uae','israel','colombia','venezuela','chile','ecuador','bolivia'];

  function isInternalLayer3(name) {
    var n = name.toLowerCase();
    for (var ii2 = 0; ii2 < INTERNAL_KW.length; ii2++) { if (n.indexOf(INTERNAL_KW[ii2]) !== -1) return true; }
    return name.replace(/\s/g, '').length <= 1;
  }
  function isGeoLayer3(name) {
    var n = name.toLowerCase();
    for (var gi2 = 0; gi2 < GEO_KW.length; gi2++) { if (n.indexOf(GEO_KW[gi2]) !== -1) return true; }
    return false;
  }

  var toggleGroupsFound = {};
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    if (item.numLayers < 3) continue;
    var toggleCandidates = [], geoCount = 0;
    for (var j = 1; j <= item.numLayers; j++) {
      var layer = item.layer(j);
      var lName = layer.name;
      var isTextTG2 = false;
      try { if (layer.property('Source Text')) isTextTG2 = true; } catch(e) {}
      if (isTextTG2) continue;
      try { if (layer.matchName === 'ADBE Camera Layer' || layer.matchName === 'ADBE Light Layer') continue; } catch(e) {}
      if (isInternalLayer3(lName)) continue;
      var tcX = 0, tcY = 0;
      try { var posTG = layer.property('Position').value; tcX = Math.round(posTG[0]); tcY = Math.round(posTG[1]); } catch(e) {}
      var isGeo2 = isGeoLayer3(lName);
      if (isGeo2) geoCount++;
      toggleCandidates.push({ name: lName, visible: layer.enabled, isGeo: isGeo2, x: tcX, y: tcY });
    }
    if (geoCount >= 3) {
      var groupKey = safeStr(item.name) + '_geo';
      if (!toggleGroupsFound[groupKey]) {
        toggleGroupsFound[groupKey] = true;
        L('TOGGLE_GROUP|comp:' + safeStr(item.name) + '|type:geo_map|count:' + geoCount);
        for (var tc2 = 0; tc2 < toggleCandidates.length; tc2++) {
          if (toggleCandidates[tc2].isGeo) {
            L('TOGGLE_LAYER|comp:' + safeStr(item.name) +
              '|layer:' + safeStr(toggleCandidates[tc2].name) +
              '|defaultVisible:' + toggleCandidates[tc2].visible +
              '|type:geo_map|centerX:' + toggleCandidates[tc2].x + '|centerY:' + toggleCandidates[tc2].y);
          }
        }
      }
    } else if (toggleCandidates.length >= 4) {
      var firstPrefix2 = '';
      if (toggleCandidates.length > 0) {
        var parts2 = toggleCandidates[0].name.split(/[\s_\-]/);
        if (parts2.length > 1) firstPrefix2 = parts2[0].toLowerCase();
      }
      var patternCount2 = 0;
      if (firstPrefix2.length > 1) {
        for (var tc3 = 0; tc3 < toggleCandidates.length; tc3++) {
          if (toggleCandidates[tc3].name.toLowerCase().indexOf(firstPrefix2) === 0) patternCount2++;
        }
      }
      if (patternCount2 >= 4) {
        var groupKey3 = safeStr(item.name) + '_pattern';
        if (!toggleGroupsFound[groupKey3]) {
          toggleGroupsFound[groupKey3] = true;
          L('TOGGLE_GROUP|comp:' + safeStr(item.name) + '|type:pattern|count:' + patternCount2 + '|prefix:' + firstPrefix2);
          for (var tc4 = 0; tc4 < toggleCandidates.length; tc4++) {
            if (toggleCandidates[tc4].name.toLowerCase().indexOf(firstPrefix2) === 0) {
              L('TOGGLE_LAYER|comp:' + safeStr(item.name) +
                '|layer:' + safeStr(toggleCandidates[tc4].name) +
                '|defaultVisible:' + toggleCandidates[tc4].visible +
                '|type:pattern|centerX:' + toggleCandidates[tc4].x + '|centerY:' + toggleCandidates[tc4].y);
            }
          }
        }
      }
    }
  }
  L('');

  // ── SECTION 14: SCENE STRUCTURE ──────────────────────────────────────────────
  L('=== SCENE STRUCTURE ===');
  var topComp = null;
  if (renderCandidates.length > 0) topComp = compIndex[renderCandidates[0].name];
  if (!topComp && compIndex['Main']) topComp = compIndex['Main'];
  var sceneContainer = null;
  var visited2 = {};
  var current = topComp;
  while (current && !visited2[current.name]) {
    visited2[current.name] = true;
    var precompChildren = [];
    for (var j = 1; j <= current.numLayers; j++) {
      var lyr = current.layer(j);
      try {
        if (lyr.source instanceof CompItem) {
          var cn2 = lyr.source.name.toLowerCase();
          var skipW2 = ['light','back','color','shape_light','adjustment'];
          var skip3 = false;
          for (var sw2 = 0; sw2 < skipW2.length; sw2++) { if (cn2 === skipW2[sw2] || cn2.indexOf('light') !== -1) { skip3 = true; break; } }
          if (!skip3) precompChildren.push({ layer: lyr, comp: lyr.source });
        }
      } catch(e) {}
    }
    if (precompChildren.length >= 2) { sceneContainer = current; break; }
    else if (precompChildren.length === 1) { current = precompChildren[0].comp; }
    else { break; }
  }
  if (sceneContainer) {
    L('SCENE_CONTAINER|name:' + safeStr(sceneContainer.name) + '|dur:' + sceneContainer.duration.toFixed(3));
    var cameraLayers2 = [];
    for (var j = 1; j <= sceneContainer.numLayers; j++) {
      var lyr = sceneContainer.layer(j);
      try {
        if (lyr.matchName === 'ADBE Camera Layer') {
          var cName2 = lyr.name;
          if (cName2.toLowerCase().indexOf('overall') !== -1) continue;
          if (cName2.toLowerCase().indexOf('position') !== -1) continue;
          cameraLayers2.push({ name: cName2, inPoint: lyr.inPoint, outPoint: lyr.outPoint });
        }
      } catch(e) {}
    }
    cameraLayers2.sort(function(a,b){ return a.inPoint - b.inPoint; });
    if (cameraLayers2.length > 2) {
      L('SCENE_TYPE|camera_based|count:' + cameraLayers2.length);
      for (var ci2 = 0; ci2 < cameraLayers2.length; ci2++) {
        var cam2 = cameraLayers2[ci2];
        var dur3 = (cam2.outPoint - cam2.inPoint).toFixed(3);
        L('SCENE|block:' + safeStr(cam2.name) + '|mainIn:' + cam2.inPoint.toFixed(3) + '|mainOut:' + cam2.outPoint.toFixed(3) + '|dur:' + dur3);
      }
    } else {
      var sceneLayers2 = [];
      for (var j = 1; j <= sceneContainer.numLayers; j++) {
        var lyr = sceneContainer.layer(j);
        try {
          if (lyr.source instanceof CompItem) {
            var cn3 = lyr.source.name.toLowerCase();
            var skipW3 = ['light','shape_light','adjustment'];
            var skip4 = false;
            for (var sw3 = 0; sw3 < skipW3.length; sw3++) { if (cn3.indexOf(skipW3[sw3]) !== -1) { skip4 = true; break; } }
            if (!skip4) sceneLayers2.push({ layer: lyr, comp: lyr.source });
          }
        } catch(e) {}
      }
      sceneLayers2.sort(function(a, b) { return a.layer.inPoint - b.layer.inPoint; });
      for (var si2 = 0; si2 < sceneLayers2.length; si2++) {
        var sl2 = sceneLayers2[si2];
        var childComp2 = sl2.comp;
        var sceneIn2  = sl2.layer.inPoint.toFixed(3);
        var sceneOut2 = sl2.layer.outPoint.toFixed(3);
        var sceneDur2 = (sl2.layer.outPoint - sl2.layer.inPoint).toFixed(3);
        var footageComps2 = [], textLayerNames2 = [];
        for (var k2 = 1; k2 <= childComp2.numLayers; k2++) {
          var cl2 = childComp2.layer(k2);
          var isT2 = false;
          try { if (cl2.property('Source Text')) isT2 = true; } catch(e) {}
          if (isT2) { try { textLayerNames2.push(safeStr(cl2.name)); } catch(e) {} continue; }
          try {
            if (cl2.source instanceof CompItem) {
              var gc2 = cl2.source;
              if (gc2.numLayers === 0) {
                var alreadyIn2 = false;
                for (var fa2 = 0; fa2 < footageComps2.length; fa2++) { if (footageComps2[fa2] === gc2.name) { alreadyIn2 = true; break; } }
                if (!alreadyIn2) footageComps2.push(safeStr(gc2.name));
              }
            }
          } catch(e) {}
        }
        L('SCENE|block:' + safeStr(childComp2.name) +
          '|mainIn:' + sceneIn2 + '|mainOut:' + sceneOut2 + '|dur:' + sceneDur2 +
          '|footageCount:' + footageComps2.length +
          '|footage:' + footageComps2.join(',') +
          '|textLayers:' + textLayerNames2.join(','));
      }
    }
  } else {
    L('SCENE_STRUCTURE_SKIP: could not find scene container');
  }
  L('');

  // ── SECTION 15: MAP CALIBRATION (for globe/map templates) ────────────────────
  L('=== MAP CALIBRATION ===');
  for (var ci3 = 1; ci3 <= app.project.numItems; ci3++) {
    var comp3 = app.project.item(ci3);
    if (!(comp3 instanceof CompItem)) continue;
    var markerProp3 = comp3.markerProperty;
    var pt01Time3 = null, pt02Time3 = null;
    for (var mi3 = 1; mi3 <= markerProp3.numKeys; mi3++) {
      try {
        var mComment3 = markerProp3.keyValue(mi3).comment;
        var mTime3    = markerProp3.keyTime(mi3);
        if (mComment3 === 'Point 01') pt01Time3 = mTime3;
        if (mComment3 === 'Point 02') pt02Time3 = mTime3;
      } catch(e) {}
    }
    if (pt01Time3 === null || pt02Time3 === null) continue;
    L('MAP_MARKERS|comp:' + safeStr(comp3.name) + '|point01Time:' + pt01Time3.toFixed(6) + '|point02Time:' + pt02Time3.toFixed(6));
    for (var li3 = 1; li3 <= comp3.numLayers; li3++) {
      var lyr3 = comp3.layer(li3);
      var afx3 = null;
      try { afx3 = lyr3.property('Effects'); } catch(e) { continue; }
      if (!afx3) continue;
      var angleXAt01 = null, angleXAt02 = null, angleYAt01 = null, angleYAt02 = null;
      var foundAngle3 = false;
      for (var fi3 = 1; fi3 <= afx3.numProperties; fi3++) {
        var ef3 = afx3.property(fi3);
        var efName3 = '';
        try { efName3 = ef3.name.toLowerCase(); } catch(e) { continue; }
        if (efName3.indexOf('angle x') !== -1) {
          try { var axP = ef3.property(1); if (axP.numKeys > 0) { angleXAt01 = axP.valueAtTime(pt01Time3, false); angleXAt02 = axP.valueAtTime(pt02Time3, false); foundAngle3 = true; } } catch(e) {}
        }
        if (efName3.indexOf('angle y') !== -1) {
          try { var ayP = ef3.property(1); if (ayP.numKeys > 0) { angleYAt01 = ayP.valueAtTime(pt01Time3, false); angleYAt02 = ayP.valueAtTime(pt02Time3, false); foundAngle3 = true; } } catch(e) {}
        }
      }
      if (foundAngle3) {
        L('MAP_ANGLES|comp:' + safeStr(comp3.name) +
          '|layer:' + safeStr(lyr3.name) +
          '|angleX_at_pt01:' + (angleXAt01 !== null ? angleXAt01.toFixed(4) : 'null') +
          '|angleY_at_pt01:' + (angleYAt01 !== null ? angleYAt01.toFixed(4) : 'null') +
          '|angleX_at_pt02:' + (angleXAt02 !== null ? angleXAt02.toFixed(4) : 'null') +
          '|angleY_at_pt02:' + (angleYAt02 !== null ? angleYAt02.toFixed(4) : 'null'));
      }
    }
  }
  L('');

  // ── SECTION 16: PROJECT LEVEL FOOTAGE ────────────────────────────────────────
  L('=== PROJECT LEVEL FOOTAGE ===');
  for (var i = 1; i <= app.project.numItems; i++) {
    var item = app.project.item(i);
    if (!(item instanceof FootageItem)) continue;
    var isSolid5 = false;
    try { isSolid5 = (item.mainSource instanceof SolidSource); } catch(e) {}
    if (isSolid5) continue;
    var ext4 = item.name.split('.').pop().toLowerCase();
    var mediaExts4 = ['jpg','jpeg','png','webp','gif','tif','tiff','psd','ai','mp4','mov','avi','webm','mxf'];
    var isMedia4 = false;
    for (var m = 0; m < mediaExts4.length; m++) { if (mediaExts4[m] === ext4) { isMedia4 = true; break; } }
    if (!isMedia4) continue;
    var fp2 = 'no_file';
    try { fp2 = item.mainSource && item.mainSource.file ? item.mainSource.file.fsName : 'no_file'; } catch(e) {}
    var isMissing5 = false;
    try { isMissing5 = item.mainSource ? item.mainSource.isMissing : false; } catch(e) {}
    L('PROJECT_FOOTAGE|id:' + i +
      '|name:' + safeStr(item.name) +
      '|w:' + item.width + '|h:' + item.height +
      '|instances:' + (instanceMap[item.name] || 0) +
      '|missing:' + isMissing5 +
      '|file:' + safeStr(fp2));
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