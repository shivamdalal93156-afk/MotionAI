// /**
//  * JSX Generator
//  * Builds the ExtendScript (.jsx) that After Effects runs to inject
//  * all text values into the template before rendering.
//  *
//  * Your template has:
//  *   - EDIT Placeholders folder: "placeholder 1" ... "placeholder 12"  (full-screen cinematic titles)
//  *   - EDIT Textholders folder:
//  *       Textholder 1 -> WORD_1, WORD_2
//  *       Textholder 2-7 -> Edit Textholder X.1, Edit Textholder X.2
//  *
//  * The JSX script:
//  *  1. Opens the main comp (MAIN_COMP)
//  *  2. Recursively searches all compositions for text layers by name
//  *  3. Sets the text sourceText to the value from our data object
//  *  4. Saves the project
//  */

// function buildJSX(textData) {
//   // textData is an object like:
//   // {
//   //   "WORD_1": "GRAND OPENING",
//   //   "WORD_2": "The most awaited event of the year",
//   //   "placeholder 1": "GRAND OPENING",
//   //   "placeholder 2": "SINCE 2010",
//   //   "Edit Textholder 2.1": "PREMIUM QUALITY",
//   //   "Edit Textholder 2.2": "Handcrafted with love and passion",
//   //   ...
//   // }

//   // Serialize the data object into JSX-safe format
//   const dataEntries = Object.entries(textData)
//     .map(([key, value]) => {
//       // Escape backslashes and double quotes for JSX string safety
//       const safeKey = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
//       const safeValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
//       return `  "${safeKey}": "${safeValue}"`;
//     })
//     .join(',\n');

//   const jsx = `
// // MotionAI - Auto-generated ExtendScript
// // Do not edit manually

// var textData = {
// ${dataEntries}
// };

// var project = app.project;
// var matchCount = 0;
// var noMatchCount = 0;
// var log = [];

// // Search all compositions in the project
// function searchAndReplace(comp) {
//   for (var i = 1; i <= comp.numLayers; i++) {
//     var layer = comp.layer(i);

//     // If this layer is a pre-comp, recurse into it
//     if (layer.source && layer.source instanceof CompItem) {
//       searchAndReplace(layer.source);
//     }

//     // Check if layer is a text layer and name matches our data
//     if (layer instanceof TextLayer) {
//       var layerName = layer.name;
//       if (textData.hasOwnProperty(layerName)) {
//         try {
//           var textProp = layer.property("Source Text");
//           var textDoc = textProp.value;
//           textDoc.text = textData[layerName];
//           textProp.setValue(textDoc);
//           matchCount++;
//           log.push("OK: " + layerName + " = " + textData[layerName]);
//         } catch (e) {
//           log.push("ERROR: " + layerName + " -> " + e.toString());
//         }
//       }
//     }
//   }
// }

// // Find and process MAIN_COMP
// var mainComp = null;
// for (var i = 1; i <= project.numItems; i++) {
//   var item = project.item(i);
//   if (item instanceof CompItem && item.name === "MAIN_COMP") {
//     mainComp = item;
//     break;
//   }
// }

// if (!mainComp) {
//   alert("ERROR: MAIN_COMP not found in project.");
// } else {
//   searchAndReplace(mainComp);
//   app.project.save();

//   // Write log to a temp file so Node.js can read results
//   var logFile = new File($.fileName.replace(/\\\\/g, "/").replace(/[^/]*$/, "") + "inject_log.txt");
//   logFile.open("w");
//   logFile.write("MATCHED: " + matchCount + "\\n");
//   logFile.write(log.join("\\n"));
//   logFile.close();

//   // Alert summary (visible when running in AE interactively)
//   // alert("MotionAI Injection Complete!\\nMatched: " + matchCount + " layers");
// }
// `;

//   return jsx;
// }

// module.exports = { buildJSX };
/**
 * JSX Generator
 * Production-Grade Injection Script
 */

/**
 * JSX Generator
 * Production-Grade Injection Script
 */

function buildJSX(textData, templatePath, tempProjectSavePath, logFilePath) {
  const dataEntries = Object.entries(textData)
    .map(([key, value]) => {
      const safeKey = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const safeValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      return `  "${safeKey}": "${safeValue}"`;
    })
    .join(',\n');

  // Safely format Windows paths for After Effects scripting (forcing forward slashes)
  const safeTemplatePath = templatePath.replace(/\\/g, '/');
  const safeSavePath = tempProjectSavePath.replace(/\\/g, '/');
  const safeLogPath = logFilePath.replace(/\\/g, '/');

  const jsx = `
var textData = {
${dataEntries}
};

// 1. Explicitly open the Master Template
var templateFile = new File("${safeTemplatePath}");
if (templateFile.exists) {
    app.open(templateFile);
} else {
    alert("Template not found at:\\n" + "${safeTemplatePath}");
    app.quit();
}

var project = app.project;
var matchCount = 0;
var log = [];

// 2. Deep scan and replace text
function searchAndReplace(comp) {
  for (var i = 1; i <= comp.numLayers; i++) {
    var layer = comp.layer(i);
    if (layer.source && layer.source instanceof CompItem) {
      searchAndReplace(layer.source);
    }
    if (layer instanceof TextLayer) {
      var layerName = layer.name;
      if (textData.hasOwnProperty(layerName)) {
        try {
          var textProp = layer.property("Source Text");
          var textDoc = textProp.value;
          textDoc.text = textData[layerName];
          textProp.setValue(textDoc);
          matchCount++;
          log.push("OK: " + layerName);
        } catch (e) {
          log.push("ERROR: " + layerName + " -> " + e.toString());
        }
      }
    }
  }
}

var mainComp = null;
for (var i = 1; i <= project.numItems; i++) {
  var item = project.item(i);
  if (item instanceof CompItem && item.name === "MAIN_COMP") {
    mainComp = item;
    break;
  }
}

if (mainComp) {
  searchAndReplace(mainComp);
}

// 3. Save as a TEMPORARY project (protects your master file!)
var saveFile = new File("${safeSavePath}");
app.project.save(saveFile);

// 4. Write log
var logFile = new File("${safeLogPath}");
logFile.open("w");
logFile.write("MATCHED: " + matchCount + "\\n");
logFile.write(log.join("\\n"));
logFile.close();

// 5. Force Quit to prevent zombie background processes
app.quit();
`;
  return jsx;
}

module.exports = { buildJSX };