// // require('dotenv').config();
// // const fs   = require('fs');
// // const path = require('path');
// // const { spawn } = require('child_process');

// // const templateName = process.argv[2];
// // if (!templateName) {
// //   console.error('Usage: node scan_template.js "templateFolderName"');
// //   process.exit(1);
// // }

// // const templateDir = path.resolve(__dirname,  'templates', templateName);
// // if (!fs.existsSync(templateDir)) {
// //   console.error('Template folder not found:', templateDir);
// //   process.exit(1);
// // }

// // const files   = fs.readdirSync(templateDir);
// // const aepFile = files.find(f => f.toLowerCase().endsWith('.aep'));
// // if (!aepFile) {
// //   console.error('No AEP file found in:', templateDir);
// //   process.exit(1);
// // }

// // const aepPath    = path.join(templateDir, aepFile).replace(/\\/g, '/');
// // const resultPath = path.join(templateDir, 'scan_result.txt').replace(/\\/g, '/');
// // const jsxPath    = path.join(templateDir, '_scan.jsx');
// // const logPath    = path.join(templateDir, '_scan.log').replace(/\\/g, '/');

// // const jsx = `
// // var _log = new File('${logPath}');
// // _log.open('w');
// // function L(msg) { _log.writeln(msg); }

// // try {
// //   L('=== MOTIONAI SCAN v3.0 ===');
// //   L('template: ${templateName}');
// //   L('aep: ${aepPath}');
// //   L('');

// //   var f = new File('${aepPath}');
// //   app.open(f);
// //   L('OPEN OK: ' + app.project.numItems + ' items');
// //   L('');

// //   // ── STEP 1: All project-level footage items ──────────────────
// //   L('=== PROJECT FOOTAGE ITEMS ===');
// //   var footageCount = 0;
// //   var instanceMap = {};

// //   // First pass — count instances of each footage item across all comps
// //   for (var i = 1; i <= app.project.numItems; i++) {
// //     var item = app.project.item(i);
// //     if (!(item instanceof CompItem)) continue;
// //     for (var L2 = 1; L2 <= item.numLayers; L2++) {
// //       var lyr = item.layer(L2);
// //       try {
// //         if (lyr.source instanceof FootageItem) {
// //           var n = lyr.source.name;
// //           instanceMap[n] = (instanceMap[n] || 0) + 1;
// //         }
// //       } catch(e) {}
// //     }
// //   }

// //   // Second pass — list all project-level footage items
// //   for (var i = 1; i <= app.project.numItems; i++) {
// //     var item = app.project.item(i);
// //     if (!(item instanceof FootageItem)) continue;

// //     var isSolid = false;
// //     try { isSolid = (item.mainSource instanceof SolidSource); } catch(e) {}
// //     if (isSolid) continue;

// //     var filePath = 'no_file';
// //     try { 
// //       if (item.mainSource && item.mainSource.file) {
// //         filePath = item.mainSource.file.fsName;
// //       }
// //     } catch(e) { filePath = 'error'; }

// //     var isMissing = false;
// //     try { isMissing = item.mainSource ? item.mainSource.isMissing : false; } catch(e) {}

// //     var instances = instanceMap[item.name] || 0;
// //     var ext = item.name.split('.').pop().toLowerCase();
// //     var isMedia = (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp' || 
// //                    ext === 'gif' || ext === 'tif' || ext === 'tiff' || ext === 'psd' ||
// //                    ext === 'mp4' || ext === 'mov' || ext === 'avi' || ext === 'webm');

// //     L('FOOTAGE|id:' + i + '|name:' + item.name + '|w:' + item.width + '|h:' + item.height + '|instances:' + instances + '|missing:' + isMissing + '|isMedia:' + isMedia + '|file:' + filePath);
// //     footageCount++;
// //   }
// //   L('total_footage: ' + footageCount);
// //   L('');

// //   // ── STEP 2: All comps with full layer breakdown ──────────────
// //   L('=== ALL COMPS ===');
// //   for (var i = 1; i <= app.project.numItems; i++) {
// //     var item = app.project.item(i);
// //     if (!(item instanceof CompItem)) continue;

// //     L('COMP|name:' + item.name + '|dur:' + item.duration.toFixed(3) + '|fps:' + item.frameRate.toFixed(3) + '|w:' + item.width + '|h:' + item.height + '|layers:' + item.numLayers);

// //     for (var L2 = 1; L2 <= item.numLayers; L2++) {
// //       var layer = item.layer(L2);
// //       var lName = layer.name;
// //       var lIn   = layer.inPoint.toFixed(3);
// //       var lOut  = layer.outPoint.toFixed(3);

// //       // Text layer
// //       var isText = false;
// //       try { if (layer.property('Source Text')) isText = true; } catch(e) {}
// //       if (isText) {
// //         var tVal = '';
// //         try { tVal = layer.property('Source Text').value.text.replace(/\\n/g, '\\\\n'); } catch(e) {}
// //         L('  TEXT|name:' + lName + '|in:' + lIn + '|out:' + lOut + '|val:' + tVal);
// //         continue;
// //       }

// //       // Null layer
// //       var isNull = false;
// //       try { isNull = (layer instanceof NullLayer); } catch(e) {}
// //       if (isNull) { L('  NULL|name:' + lName); continue; }

// //       // Footage source layer
// //       try {
// //         if (layer.source instanceof FootageItem) {
// //           var src = layer.source;
// //           var isSolid2 = false;
// //           try { isSolid2 = (src.mainSource instanceof SolidSource); } catch(e) {}
// //           if (isSolid2) { L('  SOLID|name:' + lName); continue; }
// //           var srcFile = 'no_file';
// //           try { srcFile = src.mainSource && src.mainSource.file ? src.mainSource.file.fsName : 'no_file'; } catch(e) {}
// //           L('  FOOTAGE|name:' + lName + '|source:' + src.name + '|file:' + srcFile + '|w:' + src.width + '|h:' + src.height + '|in:' + lIn + '|out:' + lOut);
// //           continue;
// //         }
// //       } catch(e) {}

// //       // Precomp layer
// //       try {
// //         if (layer.source instanceof CompItem) {
// //           L('  PRECOMP|name:' + lName + '|source:' + layer.source.name + '|in:' + lIn + '|out:' + lOut);
// //           continue;
// //         }
// //       } catch(e) {}

// //       // Shape layer
// //       var isShape = false;
// //       try { isShape = (layer instanceof ShapeLayer); } catch(e) {}
// //       if (isShape) { L('  SHAPE|name:' + lName); continue; }

// //       L('  OTHER|name:' + lName + '|in:' + lIn + '|out:' + lOut);
// //     }
// //   }
// //   L('');

// //   // ── STEP 3: Root comps (not referenced by anything) ──────────
// //   L('=== ROOT COMPS (candidates for render comp) ===');
// //   var referenced = {};
// //   for (var i = 1; i <= app.project.numItems; i++) {
// //     var item = app.project.item(i);
// //     if (!(item instanceof CompItem)) continue;
// //     for (var L2 = 1; L2 <= item.numLayers; L2++) {
// //       try {
// //         var lyr = item.layer(L2);
// //         if (lyr.source instanceof CompItem) {
// //           referenced[lyr.source.name] = true;
// //         }
// //       } catch(e) {}
// //     }
// //   }
// //   for (var i = 1; i <= app.project.numItems; i++) {
// //     var item = app.project.item(i);
// //     if (!(item instanceof CompItem)) continue;
// //     if (!referenced[item.name]) {
// //       L('ROOT|name:' + item.name + '|dur:' + item.duration.toFixed(3) + '|' + item.width + 'x' + item.height);
// //     }
// //   }
// //   L('');

// //   L('SCAN_COMPLETE');
// // } catch(e) {
// //   L('EXCEPTION: ' + e.toString() + ' line:' + e.line);
// // }
// // _log.close();

// // // Copy log to result
// // var src2 = new File('${logPath}');
// // var dst2 = new File('${resultPath}');
// // src2.open('r');
// // dst2.open('w');
// // var line2 = src2.readln();
// // while (!src2.eof) {
// //   dst2.writeln(line2);
// //   line2 = src2.readln();
// // }
// // dst2.writeln(line2);
// // src2.close();
// // dst2.close();

// // app.quit();
// // `;

// // fs.writeFileSync(jsxPath, jsx, 'utf8');
// // console.log('Scanning:', templateName);
// // console.log('AEP:', aepFile);
// // console.log('Waiting for AE to open and scan...\n');

// // const aePath = process.env.AE_PATH;
// // const ae = spawn(`"${aePath}"`, ['-r', `"${jsxPath.replace(/\\/g, '/')}"`], {
// //   shell: true,
// //   detached: false,
// //   stdio: 'inherit',
// //   windowsHide: false,
// // });

// // ae.on('close', () => {
// //   const resultFile = resultPath.replace(/\//g, '\\');
// //   if (!fs.existsSync(resultFile)) {
// //     console.error('FAILED: No scan_result.txt created');
// //     console.error('Try running AE manually: File > Scripts > Run Script File > _scan.jsx in template folder');
// //     process.exit(1);
// //   }

// //   const content = fs.readFileSync(resultFile, 'utf8');
// //   if (!content.includes('SCAN_COMPLETE')) {
// //     console.error('SCAN INCOMPLETE. Partial result:');
// //     console.log(content.slice(-500));
// //     process.exit(1);
// //   }

// //   console.log('\n=== SCAN RESULT ===\n');
// //   console.log(content);
// //   console.log('\nScan complete. Copy the output above and share it.');
// // });

// // ae.on('error', (err) => {
// //   console.error('AE spawn error:', err.message);
// //   process.exit(1);
// // });
// require('dotenv').config();
// const fs   = require('fs');
// const path = require('path');
// const { spawn } = require('child_process');

// const templateName = process.argv[2];
// if (!templateName) {
//   console.error('Usage: node scan_template.js "templateFolderName"');
//   process.exit(1);
// }

// const templateDir = path.resolve(__dirname,  'templates', templateName);
// if (!fs.existsSync(templateDir)) {
//   console.error('Template folder not found:', templateDir);
//   process.exit(1);
// }

// const files   = fs.readdirSync(templateDir);
// const aepFile = files.find(f => f.toLowerCase().endsWith('.aep'));
// if (!aepFile) {
//   console.error('No AEP file found in:', templateDir);
//   process.exit(1);
// }

// const aepPath    = path.join(templateDir, aepFile).replace(/\\/g, '/');
// const resultPath = path.join(templateDir, 'scan_result.txt').replace(/\\/g, '/');
// const jsxPath    = path.join(templateDir, '_scan.jsx');
// const logPath    = path.join(templateDir, '_scan.log').replace(/\\/g, '/');

// const jsx = `
// var AEP_PATH    = "${aepPath}";
// var LOG_PATH    = "${logPath}";
// var RESULT_PATH = "${resultPath}";
// var TEMPLATE    = "${templateName}";

// var _log = new File(LOG_PATH);
// _log.open('w');
// function L(msg) { _log.writeln(msg); }

// try {
//   L('=== MOTIONAI COMPLETE SCAN v4.0 ===');
//   L('template: ' + TEMPLATE);
//   L('aep: ' + AEP_PATH);
//   L('scanned_at: ' + new Date().toString());
//   L('');

//   var f = new File(AEP_PATH);
//   app.open(f);
//   L('OPEN_OK|items:' + app.project.numItems);
//   L('');
// `.replace(/\\/g, '/');

// fs.writeFileSync(jsxPath, jsx, 'utf8');
// console.log('Scanning:', templateName);
// console.log('AEP:', aepFile);
// console.log('Waiting for AE...\n');

// const aePath = process.env.AE_PATH;
// const ae = spawn(`"${aePath}"`, ['-r', `"${jsxPath.replace(/\\/g, '/')}"`], {
//   shell: true, detached: false, stdio: 'inherit', windowsHide: false,
// });

// ae.on('close', () => {
//   const resultFile = resultPath.replace(/\//g, '\\');
//   if (!fs.existsSync(resultFile)) {
//     console.error('FAILED: No scan_result.txt created');
//     console.error('Open AE manually: File > Scripts > Run Script File > _scan.jsx in template folder');
//     process.exit(1);
//   }
//   const content = fs.readFileSync(resultFile, 'utf8');
//   if (!content.includes('SCAN_COMPLETE')) {
//     console.error('SCAN INCOMPLETE:');
//     console.log(content.slice(-1000));
//     process.exit(1);
//   }
//   console.log('\n=== SCAN RESULT ===\n');
//   console.log(content);
//   console.log('\nDone. Paste output to get config.json');
// });

// ae.on('error', err => {
//   console.error('Spawn error:', err.message);
//   process.exit(1);
// });
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const templateName = process.argv[2];
if (!templateName) {
  console.error('Usage: node scan_template.js "templateFolderName"');
  process.exit(1);
}

const templateDir = path.resolve(__dirname, 'templates', templateName);
if (!fs.existsSync(templateDir)) {
  console.error('Template folder not found:', templateDir);
  process.exit(1);
}

const files   = fs.readdirSync(templateDir);
const aepFile = files.find(f => f.toLowerCase().endsWith('.aep'));
if (!aepFile) {
  console.error('No AEP file found in:', templateDir);
  process.exit(1);
}

const aepPath    = path.join(templateDir, aepFile).replace(/\\/g, '/');
const resultPath = path.join(templateDir, 'scan_result.txt').replace(/\\/g, '/');
const jsxPath    = path.join(templateDir, '_scan.jsx');
const logPath    = path.join(templateDir, '_scan.log').replace(/\\/g, '/');

// Read the static core JSX
const coreJsx = fs.readFileSync(
  path.resolve(__dirname,  'scan_core.jsx'), 'utf8'
);

// Inject only the 4 path variables at the top — no template literal interpolation in JSX body
const header = [
  `var AEP_PATH    = "${aepPath}";`,
  `var LOG_PATH    = "${logPath}";`,
  `var RESULT_PATH = "${resultPath}";`,
  `var TEMPLATE    = "${templateName}";`,
  '',
].join('\n');

fs.writeFileSync(jsxPath, header + coreJsx, 'utf8');

console.log('Scanning:', templateName);
console.log('AEP:', aepFile);
console.log('Waiting for AE...\n');

const aePath = process.env.AE_PATH;
const ae = spawn(`"${aePath}"`, ['-r', `"${jsxPath.replace(/\\/g, '/')}"`], {
  shell: true, detached: false, stdio: 'inherit', windowsHide: false,
});

ae.on('close', () => {
  const resultFile = resultPath.replace(/\//g, '\\');
  if (!fs.existsSync(resultFile)) {
    console.error('FAILED: No scan_result.txt created');
    process.exit(1);
  }
  const content = fs.readFileSync(resultFile, 'utf8');
  if (!content.includes('SCAN_COMPLETE')) {
    console.error('SCAN INCOMPLETE:');
    console.log(content.slice(-500));
    process.exit(1);
  }
  console.log('\n=== SCAN RESULT ===\n');
  console.log(content);
  console.log('\nDone. Paste output to get config.json');
});

ae.on('error', err => {
  console.error('Spawn error:', err.message);
  process.exit(1);
});