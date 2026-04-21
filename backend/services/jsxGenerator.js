/**
 * Safely escapes user text for inclusion securely inside a JSX string.
 */
function escapeForExtendScript(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/**
 * Ensures a Windows path is compatible with ExtendScript (which prefers forward slashes).
 */
function escapePath(winPath) {
  if (!winPath) return '';
  return winPath.replace(/\\/g, '/');
}

/**
 * Builds the ExtendScript (.jsx) string to be injected into After Effects.
 */
function buildJSX(config, textData, hiddenLayerNames, imageData, templatePath, tempProjectSavePath, logFilePath) {
  // Convert payload values into JSX variable strings
  const safeTemplatePath = templatePath.replace(/\\/g, '/');
  const safeSavePath = tempProjectSavePath.replace(/\\/g, '/');
  const safeLogPath = logFilePath.replace(/\\/g, '/');

  // Stringify the data so ExtendScript can parse it natively as an object
  // Text Data
  let textDataJsStr = 'var textData = {';
  Object.keys(textData).forEach(key => {
    textDataJsStr += `"${key}": "${escapeForExtendScript(textData[key])}",`;
  });
  textDataJsStr += '};\n';

  // Hidden Layers
  let hiddenLayersJsStr = 'var hiddenLayers = {';
  hiddenLayerNames.forEach(key => {
    hiddenLayersJsStr += `"${key}": true,`;
  });
  hiddenLayersJsStr += '};\n';

  // Image Data
  let imageDataJsStr = 'var imageData = {';
  Object.keys(imageData).forEach(key => {
    let safePath = imageData[key].replace(/\\/g, '/');
    if (!safePath.startsWith('file:///')) {
      safePath = 'file:///' + safePath;
    }
    imageDataJsStr += `"${key}": "${safePath}",`;
  });
  imageDataJsStr += '};\n';

  // The actual ExtendScript code to run in AE
  const jsxScript = `
    ${textDataJsStr}
    ${hiddenLayersJsStr}
    ${imageDataJsStr}

    var safeTemplatePath = "${safeTemplatePath}";
    var safeSavePath = "${safeSavePath}";

    var logFile = new File("${safeLogPath}");
    logFile.open("w");
    function logMessage(msg) {
        logFile.writeln(msg);
    }

    var stats = { textMatched: 0, hidden: 0, imagesReplaced: 0, errors: 0 };

    try {
        logMessage("Starting Script...");
        
        var templateFile = new File(safeTemplatePath);
        if (!templateFile.exists) {
            throw new Error("Template file does not exist: " + safeTemplatePath);
        }
        
        var project = app.open(templateFile);
        if (!project) throw new Error("Failed to open project.");

        logMessage("Project opened successfully.");

        // --- START INJECTED JSX LOGIC ---
        var processedComps = {};

        function replaceTextRecursively(comp) {
            if (!comp || processedComps[comp.id]) return;
            processedComps[comp.id] = true;

            for (var i = 1; i <= comp.numLayers; i++) {
                var layer = comp.layer(i);
                var lName = layer.name;

                // Match exact layer name to the keys provided in textData
                if (textData.hasOwnProperty(lName)) {
                    if (layer instanceof TextLayer) {
                        try {
                            var newText = textData[lName];
                            if (newText === "" || newText === null || newText === undefined) {
                                newText = " "; // Force a blank space to erase default text
                            }
                            layer.property("Source Text").setValue(newText);
                            
                            var scaleProp = layer.property("Scale");
                            var autoScaleExpr = "var maxWidth = 2500; var textRect = sourceRectAtTime(time, false); if (textRect.width > maxWidth) { var scaleFactor = maxWidth / textRect.width; [value[0] * scaleFactor, value[1] * scaleFactor]; } else { value; }";
                            scaleProp.expression = autoScaleExpr;
                            
                            stats.textMatched++;
                            logMessage("Successfully updated text for layer: " + lName);
                        } catch(e) {
                            stats.errors++;
                            logMessage("Error updating text for " + lName + ": " + e.toString());
                        }
                    }
                }

                // Recursively search inside Pre-Compositions
                if (layer.source instanceof CompItem) {
                    replaceTextRecursively(layer.source);
                }
            }
        }

        // Loop through all items in the project bin to ensure we catch every composition
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                replaceTextRecursively(item);
            }
        }
        // --- END INJECTED JSX LOGIC ---

        // Deep scan all compositions
        for (var i = 1; i <= project.numItems; i++) {
            var item = project.item(i);
            if (item instanceof CompItem) {
                for (var j = 1; j <= item.numLayers; j++) {
                    var layer = item.layer(j);
                    var lName = layer.name;

                    // 2. Hide Empty Layers
                    if (hiddenLayers.hasOwnProperty(lName)) {
                        try {
                            var opacityProp = layer.property("Opacity");
                            if (opacityProp) {
                                opacityProp.setValue(0);
                                stats.hidden++;
                                logMessage("Hid layer: " + lName);
                            }
                        } catch(e) {
                            stats.errors++;
                            logMessage("Error hiding layer " + lName + ": " + e.toString());
                        }
                    }
                }
            }
        }

        // 3. Execute Image Replacement (Targeting composition named like "Edit Placeholder 1")
        for (var imgKey in imageData) {
            if (imageData.hasOwnProperty(imgKey)) {
                var foundComp = null;
                for (var c = 1; c <= project.numItems; c++) {
                    if (project.item(c) instanceof CompItem && project.item(c).name === imgKey) {
                        foundComp = project.item(c);
                        break;
                    }
                }

                if (foundComp) {
                    try {
                        var imgFile = new File(imageData[imgKey]);
                        if (imgFile.exists) {
                            var io = new ImportOptions(imgFile);
                            var importedItem = project.importFile(io);
                            
                            // Hide all existing layers inside the placeholder comp (e.g. "Dark Gray Solid 3")
                            for (var cl = 1; cl <= foundComp.numLayers; cl++) {
                                foundComp.layer(cl).enabled = false;
                            }
                            
                            // Add the newly imported image to the composition
                            foundComp.layers.add(importedItem);
                            stats.imagesReplaced++;
                            logMessage("Successfully imported and replaced composition: " + imgKey);
                        } else {
                            logMessage("Image file missing at path: " + imageData[imgKey]);
                        }
                    } catch(e) {
                        stats.errors++;
                        logMessage("Error inserting image for " + imgKey + ": " + e.toString());
                    }
                } else {
                    logMessage("Target composition for image upload not found: " + imgKey);
                }
            }
        }

        logMessage("Stats - Text Matched: " + stats.textMatched + ", Hidden: " + stats.hidden + ", Images: " + stats.imagesReplaced + ", Errors: " + stats.errors);

        // Save Temp Project
        var saveFile = new File(safeSavePath);
        project.save(saveFile);
        logMessage("Saved temp project to: " + safeSavePath);

    } catch(err) {
        logMessage("CRITICAL ERROR: " + err.toString());
    } finally {
        logMessage("Exiting AE...");
        logFile.close();
        app.quit(); // CRITICAL FIX: DO NOT EXPOSE ZOMBIE ENGINES
    }
  `;

  return jsxScript;
}

module.exports = {
  buildJSX
};
