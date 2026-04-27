/**
 * generateHotspots.js
 * Run: node generateHotspots.js <template_id>
 * Example: node generateHotspots.js 3d_photo_slideshow
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
require('dotenv').config();

const templateId = process.argv[2];
if (!templateId) {
  console.error('Usage: node generateHotspots.js <template_id>');
  process.exit(1);
}

const configPath = path.join(__dirname, 'configs', `${templateId}.json`);
if (!fs.existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const templatePath = path.join(__dirname, 'templates', config.aep_file).replace(/\\/g, '/');
const renderComp = config.render_comp || 'MAIN_RENDER';
const AFTERFX_PATH = process.env.AE_RENDER_PATH.replace('aerender.exe', 'AfterFX.com');
const AERENDER_PATH = process.env.AE_RENDER_PATH;
const tempDir = path.join(__dirname, 'temp');
const jsxPath = path.join(tempDir, `hotspot_${templateId}.jsx`);
const tempAepPath = path.join(tempDir, `hotspot_${templateId}.aep`);
const framePngPath = path.join(tempDir, `hotspot_${templateId}.png`);

const SLOT_COLORS = [
  { r: 255, g: 0,   b: 0   },
  { r: 0,   g: 255, b: 0   },
  { r: 0,   g: 0,   b: 255 },
  { r: 255, g: 255, b: 0   },
  { r: 0,   g: 255, b: 255 },
  { r: 255, g: 0,   b: 255 },
  { r: 255, g: 128, b: 0   },
  { r: 128, g: 0,   b: 255 },
  { r: 0,   g: 255, b: 128 },
  { r: 255, g: 0,   b: 128 },
  { r: 128, g: 255, b: 0   },
  { r: 0,   g: 128, b: 255 },
  { r: 255, g: 64,  b: 64  },
  { r: 64,  g: 255, b: 64  },
];

function sleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {}
}

const imageSlots = {};
Object.keys(config.image_map).forEach((slotKey, index) => {
  const val = config.image_map[slotKey];
  const compName = typeof val === 'object' ? val.comp : val;
  imageSlots[slotKey] = {
    comp: compName,
    color: SLOT_COLORS[index] || { r: index * 17, g: 255 - index * 17, b: 128 }
  };
});

let slotDataStr = 'var slots = [\n';
Object.keys(imageSlots).forEach(slotKey => {
  const slot = imageSlots[slotKey];
  slotDataStr += `  { name: "${slotKey}", comp: "${slot.comp}", r: ${slot.color.r}, g: ${slot.color.g}, b: ${slot.color.b} },\n`;
});
slotDataStr += '];\n';

const safeTempAep = tempAepPath.replace(/\\/g, '/');
const safeLogPath = path.join(tempDir, `hotspot_${templateId}_log.txt`).replace(/\\/g, '/');

// Build JSX — using string concatenation instead of template literals for method calls
// to avoid any markdown corruption issues
const jsxLines = [
  'try {',
  '    app.beginSuppressDialogs();',
  '    var logFile = new File("' + safeLogPath + '");',
  '    logFile.open("w");',
  '    function log(msg) { logFile.writeln(msg); }',
  '    log("Opening template: ' + templatePath + '");',
  '    var templateFile = new File("' + templatePath + '");',
  '    if (!templateFile.exists) throw new Error("Template not found");',
  '    var project = app.open(templateFile);',
  '    if (!project) throw new Error("Failed to open project");',
  '    log("Project opened");',
  '    ' + slotDataStr,
  '    for (var s = 0; s < slots.length; s++) {',
  '        var slot = slots[s];',
  '        var targetComp = null;',
  '        for (var i = 1; i <= project.numItems; i++) {',
  '            if (project.item(i) instanceof CompItem && project.item(i).name === slot.comp) {',
  '                targetComp = project.item(i);',
  '                break;',
  '            }',
  '        }',
  '        if (!targetComp) {',
  '            log("WARNING: Comp not found: " + slot.comp);',
  '            continue;',
  '        }',
  '        for (var l = 1; l <= targetComp.numLayers; l++) {',
  '            targetComp.layer(l).enabled = false;',
  '        }',
  '        var solidLayer = targetComp.layers.addSolid(',
  '            [slot.r / 255, slot.g / 255, slot.b / 255],',
  '            "HOTSPOT_" + slot.name,',
  '            targetComp.width,',
  '            targetComp.height,',
  '            targetComp.pixelAspect',
  '        );',
  '        solidLayer.moveToBeginning();',
  '        log("Colored: " + slot.comp);',
  '    }',
  '    var saveFile = new File("' + safeTempAep + '");',
  '    project.save(saveFile);',
  '    log("Saved temp AEP");',
  '    app.endSuppressDialogs(false);',
  '    app.quit();',
  '} catch(e) {',
  '    var errLog = new File("' + safeLogPath + '");',
  '    errLog.open("w");',
  '    errLog.writeln("ERROR: " + e.toString());',
  '    errLog.close();',
  '    app.quit();',
  '}'
];

const jsxScript = jsxLines.join('\n');

// STEP 1: Write JSX and run in AE
console.log('Step 1: Coloring placeholder comps in After Effects...');
fs.writeFileSync(jsxPath, jsxScript, 'utf8');

// Verify no corruption
const written = fs.readFileSync(jsxPath, 'utf8');
if (written.includes('](http')) {
  console.error('ERROR: JSX file is corrupted with markdown links. Aborting.');
  process.exit(1);
}
console.log('✓ JSX written and verified clean');

try { execSync('taskkill /F /IM AfterFX.exe /T', { stdio: 'ignore' }); } catch(e) {}
try { execSync('taskkill /F /IM afterfx.com /T', { stdio: 'ignore' }); } catch(e) {}
sleep(2000);

try {
  execSync(`"${AFTERFX_PATH}" -r "${jsxPath}"`, {
    timeout: 300000,
    stdio: 'inherit'
  });
} catch(e) {}

sleep(3000);

try { execSync('taskkill /F /IM AfterFX.exe /T', { stdio: 'ignore' }); } catch(e) {}
try { execSync('taskkill /F /IM afterfx.com /T', { stdio: 'ignore' }); } catch(e) {}
sleep(2000);

const logPath = path.join(tempDir, `hotspot_${templateId}_log.txt`);
if (fs.existsSync(logPath)) {
  console.log('AE Log:', fs.readFileSync(logPath, 'utf8'));
}

if (!fs.existsSync(tempAepPath)) {
  console.error('ERROR: Temp AEP not created. Check AE log above.');
  process.exit(1);
}
console.log('✓ Temp AEP created with colored comps');

// STEP 2: Render one frame
// STEP 2: Render one frame PER SCENE
console.log('\nStep 2: Rendering frames for each scene...');

const sceneOutpoints = config.scene_outpoints || {};
const slotKeys = Object.keys(imageSlots);
const allResults = {};

slotKeys.forEach((slotKey, index) => {
  const sceneName = `scene${index + 1}`;
  const sceneEnd = sceneOutpoints[sceneName] || (index + 1) * 5;
  const sceneStart = index * 5;
  const midTime = sceneStart + (sceneEnd - sceneStart) / 2;
  const midFrame = Math.floor(midTime * 25); // 25fps

  console.log(`\nRendering frame ${midFrame} for ${slotKey} (${sceneName})...`);

  const sceneAviPath = path.join(tempDir, `hotspot_${templateId}_${slotKey}.avi`);
  const scenePngPath = path.join(tempDir, `hotspot_${templateId}_${slotKey}.png`);

  if (fs.existsSync(sceneAviPath)) fs.unlinkSync(sceneAviPath);
//   if (fs.existsSync(scenePngPath)) fs.unlinkSync(scenePngPath);

  const cmd = `"${AERENDER_PATH}" -project "${tempAepPath}" -comp "${renderComp}" -s ${midFrame} -e ${midFrame} -OMtemplate "Lossless" -output "${sceneAviPath}"`;

  try {
    execSync(cmd, { timeout: 120000, stdio: 'inherit' });
  } catch(e) {}

  let attempts = 0;
  while (!fs.existsSync(sceneAviPath) && attempts < 30) {
    sleep(1000);
    attempts++;
  }

  if (!fs.existsSync(sceneAviPath)) {
    console.warn(`⚠ AVI not created for ${slotKey}`);
    return;
  }

  try {
    execSync(`ffmpeg -i "${sceneAviPath}" -frames:v 1 -update 1 "${scenePngPath}" -y`, {
      timeout: 30000, stdio: 'inherit'
    });
  } catch(e) {}

  if (fs.existsSync(sceneAviPath)) fs.unlinkSync(sceneAviPath);

  if (!fs.existsSync(scenePngPath)) {
    console.warn(`⚠ PNG not created for ${slotKey}`);
    return;
  }

  // Scan this frame for the slot's color
  const slot = imageSlots[slotKey];
  const { r: tr, g: tg, b: tb } = slot.color;
  const pngData = fs.readFileSync(scenePngPath);
  const png = PNG.sync.read(pngData);
  const { width, height, data } = png;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let pixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const brightness = r + g + b;

      if (Math.abs(r - tr) <= 60 &&
          Math.abs(g - tg) <= 60 &&
          Math.abs(b - tb) <= 60 &&
          brightness > 200) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        pixelCount++;
      }
    }
  }

  if (fs.existsSync(scenePngPath)) fs.unlinkSync(scenePngPath);

  if (pixelCount < 100) {
    console.warn(`⚠ ${slotKey}: Not found (${pixelCount} pixels)`);
    allResults[slotKey] = null;
    return;
  }

  allResults[slotKey] = {
    preview_x: Math.round((minX / width) * 1000) / 10,
    preview_y: Math.round((minY / height) * 1000) / 10,
    preview_w: Math.round(((maxX - minX) / width) * 1000) / 10,
    preview_h: Math.round(((maxY - minY) / height) * 1000) / 10,
  };

  console.log(`✓ ${slotKey}: x=${allResults[slotKey].preview_x}% y=${allResults[slotKey].preview_y}% w=${allResults[slotKey].preview_w}% h=${allResults[slotKey].preview_h}% (${pixelCount} pixels)`);
});
// STEP 3: Scan PNG for colored bounding boxes
console.log('\nStep 3: Scanning frame for hotspot positions...');

const pngData = fs.readFileSync(framePngPath);
const png = PNG.sync.read(pngData);
const { width, height, data } = png;

console.log(`Image size: ${width}x${height}`);

const results = {};
const TOLERANCE = 60;

Object.keys(imageSlots).forEach(slotKey => {
  const slot = imageSlots[slotKey];
  const { r: tr, g: tg, b: tb } = slot.color;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let pixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (Math.abs(r - tr) <= TOLERANCE &&
          Math.abs(g - tg) <= TOLERANCE &&
          Math.abs(b - tb) <= TOLERANCE &&
        r>180) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        pixelCount++;
      }
    }
  }

  if (pixelCount < 100) {
    console.warn(`⚠ ${slotKey} (${slot.comp}): Not found (${pixelCount} pixels)`);
    results[slotKey] = null;
    return;
  }

  results[slotKey] = {
    preview_x: Math.round((minX / width) * 1000) / 10,
    preview_y: Math.round((minY / height) * 1000) / 10,
    preview_w: Math.round(((maxX - minX) / width) * 1000) / 10,
    preview_h: Math.round(((maxY - minY) / height) * 1000) / 10,
  };

  console.log(`✓ ${slotKey}: x=${results[slotKey].preview_x}% y=${results[slotKey].preview_y}% w=${results[slotKey].preview_w}% h=${results[slotKey].preview_h}% (${pixelCount} pixels)`);
});

// STEP 4: Build output config
console.log('\nStep 4: Building config output...');

const configOutput = {};
Object.keys(config.image_map).forEach(slotKey => {
  const existing = config.image_map[slotKey];
  const isObject = typeof existing === 'object';
  const coords = allResults[slotKey];
  configOutput[slotKey] = {
    comp: isObject ? existing.comp : existing,
    ratio: isObject ? existing.ratio : '16:9',
    hint: isObject ? existing.hint : 'Landscape',
    ...(coords ? {
      preview_x: coords.preview_x,
      preview_y: coords.preview_y,
      preview_w: coords.preview_w,
      preview_h: coords.preview_h
    } : {})
  };
});

const finalOutput = { image_map: configOutput };

const hotspotsPath = path.join(__dirname, 'configs', `${templateId}_hotspots.json`);
fs.writeFileSync(hotspotsPath, JSON.stringify(finalOutput, null, 2));

console.log('\n✓ Done! Add this to your config image_map:\n');
console.log(JSON.stringify(finalOutput, null, 2));
console.log(`\n✓ Saved to: ${hotspotsPath}`);