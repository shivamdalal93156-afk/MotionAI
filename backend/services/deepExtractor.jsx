// deepExtractor.jsx

function trim(str) {
    if (!str) return "";
    return str.toString().replace(/^\s+|\s+$/g, '');
}

// Escape quotes for manual JSON building
function escapeJSON(str) {
    if (!str) return "";
    return str.toString()
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

function getLayerType(layer) {
    try {
        if (layer instanceof TextLayer) return "TEXT";
        if (layer instanceof CameraLayer) return "CAMERA";
        if (layer instanceof LightLayer) return "LIGHT";
        if (layer instanceof ShapeLayer) return "SHAPE";
        if (layer.source instanceof CompItem) return "PRECOMP";
        if (layer.source instanceof FootageItem) {
            // Check if solid
            if (layer.source.mainSource && layer.source.mainSource.color) return "SOLID";
            return "FOOTAGE";
        }
        if (layer.nullLayer) return "NULL";
    } catch(e) {}
    return "UNKNOWN";
}

function getTextValue(layer) {
    try {
        var textProp = layer.property("Source Text");
        if (textProp && textProp.value) {
            return trim(textProp.value.text);
        }
    } catch(e) {}
    return null;
}

function isImageSlot(comp) {
    if (comp.numLayers === 0) return true;
    for (var i = 1; i <= comp.numLayers; i++) {
        var type = getLayerType(comp.layer(i));
        if (type !== "SOLID" && type !== "NULL") return false;
    }
    return true;
}

function extractProject(outputPath) {
    var proj = app.project;
    if (!proj) return;

    var totalComps = 0;
    var maxDuration = 0;
    var longestCompName = "";
    
    var compsData = [];

    for (var i = 1; i <= proj.numItems; i++) {
        var item = proj.item(i);
        if (item instanceof CompItem) {
            totalComps++;
            
            var compName = trim(item.name);
            var duration = item.duration;
            var width = item.width;
            var height = item.height;
            var layerCount = item.numLayers;
            var empty = isImageSlot(item);

            if (duration > maxDuration) {
                maxDuration = duration;
                longestCompName = compName;
            }

            var layersData = [];
            for (var j = 1; j <= layerCount; j++) {
                var layer = item.layer(j);
                var lName = trim(layer.name);
                var lType = getLayerType(layer);
                var lIn = layer.inPoint;
                var lOut = layer.outPoint;
                var lVisible = layer.enabled && !layer.shy;
                
                var lTextValue = "";
                if (lType === "TEXT") {
                    var val = getTextValue(layer);
                    if (val) lTextValue = val;
                }
                
                var lLinksTo = "";
                if (lType === "PRECOMP" && layer.source) {
                    lLinksTo = trim(layer.source.name);
                }

                // Build layer JSON string
                var layerStr = "{" +
                    '"name": "' + escapeJSON(lName) + '",' +
                    '"type": "' + escapeJSON(lType) + '",' +
                    '"inPoint": ' + lIn + ',' +
                    '"outPoint": ' + lOut + ',' +
                    '"isVisible": ' + (lVisible ? "true" : "false");

                if (lType === "TEXT") {
                    layerStr += ',"textValue": "' + escapeJSON(lTextValue) + '"';
                }
                if (lType === "PRECOMP") {
                    layerStr += ',"linksTo": "' + escapeJSON(lLinksTo) + '"';
                }
                layerStr += "}";
                layersData.push(layerStr);
            }

            // Build comp JSON string
            var compStr = "{" +
                '"name": "' + escapeJSON(compName) + '",' +
                '"duration": ' + duration + ',' +
                '"width": ' + width + ',' +
                '"height": ' + height + ',' +
                '"isEmpty": ' + (empty ? "true" : "false") + ',' +
                '"layerCount": ' + layerCount + ',' +
                '"layers": [' + layersData.join(",") + ']' +
                "}";

            compsData.push(compStr);
        }
    }

    var projName = proj.file ? trim(proj.file.name) : "Untitled";

    // Build final JSON
    var jsonStr = "{" +
        '"projectName": "' + escapeJSON(projName) + '",' +
        '"totalComps": ' + totalComps + ',' +
        '"longestComp": {' +
            '"name": "' + escapeJSON(longestCompName) + '",' +
            '"duration": ' + maxDuration +
        '},' +
        '"comps": [' + compsData.join(",") + ']' +
        "}";

    // Write to file
    var f = new File(outputPath);
    f.open("w");
    f.encoding = "UTF-8";
    f.write(jsonStr);
    f.close();
}

// Check if arguments are provided (expected via doScript or similar, but since we use afterfx.exe -r, we must read an env var or we inject the path directly in the runner)
// We will rely on dumpRunner.js to dynamically replace "{{OUTPUT_PATH}}" with actual path.
// We will rely on dumpRunner.js to dynamically replace "{{OUTPUT_PATH}}" with actual path.
try {
    var OUT_PATH = "{{OUTPUT_PATH}}";
    extractProject(OUT_PATH);
} catch(e) {
    var errFile = new File("C:/Users/SHIVAM/Desktop/motionai/backend/temp/dump_error.txt");
    errFile.open("w");
    errFile.writeln("FATAL: " + e.toString());
    errFile.writeln("Line: " + e.line);
    errFile.close();
}
app.quit();
