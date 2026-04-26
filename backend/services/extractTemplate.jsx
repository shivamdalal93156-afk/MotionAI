try {
    app.beginSuppressDialogs();
    var project = app.project;
    if (!project) throw new Error("No project open.");

    // 🚀 FIX 1: Decode the URI to remove those ugly '%20' space characters
    var rawTemplateName = project.file ? project.file.name : "Unsaved_Template.aep";
    var cleanTemplateName = decodeURI(rawTemplateName); 
    
    var logMsg = "Analyzing: " + cleanTemplateName + "\n";

    var textMap = {};
    var imageMap = {};
    var sceneOutpoints = {};
    
    // 🚀 FIX 2: Default to the composition you currently have open on your screen!
    var renderCompName = "MAIN_RENDER";
    if (app.project.activeItem && app.project.activeItem instanceof CompItem) {
        renderCompName = app.project.activeItem.name.replace(/^\s+|\s+$/g, '');
    }

    var imageCounter = 1;
    var sceneCounter = 1;

    // 1. Scan for Text and Image Placeholders
    for (var i = 1; i <= project.numItems; i++) {
        var item = project.item(i);
        if (item instanceof CompItem) {
            
            var cleanName = item.name.replace(/^\s+|\s+$/g, '');

            // If we don't have an active item open, try to guess the main render comp
            if (renderCompName === "MAIN_RENDER") {
                if (cleanName.toLowerCase().indexOf("render") !== -1 || cleanName.toLowerCase().indexOf("main") !== -1 || cleanName.toLowerCase().indexOf("final") !== -1) {
                    renderCompName = cleanName;
                }
            }

            // Find Image Placeholders
            if (cleanName.toLowerCase().indexOf("footage") !== -1 || cleanName.toLowerCase().indexOf("image") !== -1 || cleanName.toLowerCase().indexOf("placeholder") !== -1) {
                imageMap["image_" + imageCounter] = cleanName;
                imageCounter++;
            }

            // Find Text Layers
            for (var L = 1; L <= item.numLayers; L++) {
                var layer = item.layer(L);
                var cleanLayerName = layer.name.replace(/^\s+|\s+$/g, '');
                
                if (layer instanceof TextLayer) {
                    textMap["scene" + sceneCounter + "_text"] = cleanLayerName;
                    sceneCounter++;
                }
            }
        }
    }

    // 2. Scan the Main Render Comp for EXACT Outpoints
    for (var i = 1; i <= project.numItems; i++) {
        var item = project.item(i);
        if (item instanceof CompItem && item.name.replace(/^\s+|\s+$/g, '') === renderCompName) {
            var outpointCounter = 1;
            // Scan layers to get their outpoints
            for (var L = item.numLayers; L >= 1; L--) { 
                var layer = item.layer(L);
                var exactOutpoint = Math.round(layer.outPoint * 100) / 100; 
                sceneOutpoints["scene" + outpointCounter] = exactOutpoint;
                outpointCounter++;
            }
            break;
        }
    }

    // 3. Build the Clean JSON
    var jsonStr = "{\n";
    
    // Clean SaaS IDs: "grunge_sport_titles"
    var saasId = cleanTemplateName.replace('.aep', '').toLowerCase().replace(/\s+/g, '_');
    jsonStr += '  "template_id": "' + saasId + '",\n';
    
    // Clean Name: "Grunge Sport Titles"
    jsonStr += '  "name": "' + cleanTemplateName.replace('.aep', '') + '",\n';
    jsonStr += '  "aep_file": "' + cleanTemplateName + '",\n';
    jsonStr += '  "render_comp": "' + renderCompName + '",\n';
    
    jsonStr += '  "text_map": {\n';
    var tKeys = []; for (var k in textMap) tKeys.push('    "' + k + '": "' + textMap[k] + '"');
    jsonStr += tKeys.join(",\n") + '\n  },\n';

    jsonStr += '  "image_map": {\n';
    var iKeys = []; for (var k in imageMap) iKeys.push('    "' + k + '": "' + imageMap[k] + '"');
    jsonStr += iKeys.join(",\n") + '\n  },\n';

    jsonStr += '  "scene_outpoints": {\n';
    var sKeys = []; for (var k in sceneOutpoints) sKeys.push('    "' + k + '": ' + sceneOutpoints[k]);
    jsonStr += sKeys.join(",\n") + '\n  }\n';
    jsonStr += "}";

    // Note: Make sure this path is perfectly matching your PC!
    var outPath = "C:/Users/SHIVAM/Desktop/motionai/backend/configs/auto_extracted.json";
    var outFile = new File(outPath);
    outFile.open("w");
    outFile.write(jsonStr);
    outFile.close();

    app.endSuppressDialogs(false);
    alert("Extraction Complete! Check your configs folder.");
} catch (e) {
    alert("Extraction Failed: " + e.toString());
}