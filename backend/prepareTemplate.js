const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

const templateId = process.argv[2];
if (!templateId) {
    console.error("\n[!] Error: Provide a template ID!");
    process.exit(1);
}

const configPath = path.join(__dirname, 'configs', `${templateId}.json`);
if (!fs.existsSync(configPath)) {
    console.error(`[!] Config not found at ${configPath}`);
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const AERENDER_PATH = process.env.AE_RENDER_PATH;
const AFTERFX_PATH = AERENDER_PATH.replace('aerender.exe', 'AfterFX.com');
const templatePath = path.join(__dirname, 'templates', config.aep_file);

const frontendPreviewDir = path.join(__dirname, '..', 'frontend', 'public', 'previews');
if (!fs.existsSync(frontendPreviewDir)) fs.mkdirSync(frontendPreviewDir, { recursive: true });

// ✨ Use the user's manual greenscreen.jpg in the backend folder
const greenScreenPath = path.join(__dirname, 'greenscreen.jpg');
if (!fs.existsSync(greenScreenPath)) {
    console.error("[!] ERROR: Please place a solid neon green 'greenscreen.jpg' in your backend folder!");
    process.exit(1);
}

if (!fs.existsSync(path.join(__dirname, 'temp'))) fs.mkdirSync(path.join(__dirname, 'temp'), { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'outputs'))) fs.mkdirSync(path.join(__dirname, 'outputs'), { recursive: true });

console.log(`\n🚀 Starting Chroma-Key Ingestion Pipeline for: ${templateId}`);

Object.keys(config.image_map).forEach(imageKey => {
    const sceneName = imageKey.replace('image_', 'scene');
    const frameNum = config.scene_frame_times[sceneName];
    const targetComp = config.image_map[imageKey].comp || config.image_map[imageKey];

    console.log(`\n[+] Processing Chroma Window for ${sceneName}`);

    const jobId = Date.now();
    const tempAep = path.join(__dirname, 'temp', `hole_${jobId}.aep`);
    const jsxLogPath = path.join(__dirname, 'temp', `hole_log_${jobId}.txt`);
    const tempAvi = path.join(__dirname, 'outputs', `green_${jobId}.avi`);
    const finalPng = path.join(frontendPreviewDir, `${templateId}_${sceneName}_hole.png`);

    // 1. The JSX Script: Vacuum the comp and inject the Green Screen (Fixes AE Track Mattes!)
    const jsxScript = `
        var logFile = new File("${jsxLogPath.replace(/\\/g, '/')}");
        logFile.open("w");
        function log(msg) { logFile.writeln(msg); }
        
        try {
            var proj = app.open(new File("${templatePath.replace(/\\/g, '/')}"));
            var targetCompName = "${targetComp}";
            var item = null;
            
            for(var i=1; i<=proj.numItems; i++){
                if(proj.item(i) instanceof CompItem && proj.item(i).name === targetCompName) {
                    item = proj.item(i); break;
                }
            }
            
            if(item) {
                var importedGreen = proj.importFile(new ImportOptions(new File("${greenScreenPath.replace(/\\/g, '/')}")));
                
                // Clear the comp and add the green solid
                while(item.numLayers > 0) item.layer(1).remove();
                var greenLayer = item.layers.add(importedGreen);
                
                // Force it to fill the entire comp
                var sX = (item.width / greenLayer.width) * 100;
                var sY = (item.height / greenLayer.height) * 100;
                var maxS = Math.max(sX, sY);
                greenLayer.property("Scale").setValue([maxS, maxS]);
                
                log("Green Screen injected and scaled perfectly.");
            }
            
            proj.save(new File("${tempAep.replace(/\\/g, '/')}"));
            app.quit();
        } catch(e) {
            log("ERROR: " + e.toString());
            app.quit();
        }
    `;

    const jsxPath = path.join(__dirname, 'temp', `jsx_${jobId}.jsx`);
    fs.writeFileSync(jsxPath, jsxScript);

    try {
        console.log("  -> Injecting Green Screen into AE...");
        execSync(`"${AFTERFX_PATH}" -mfr OFF -noui -r "${jsxPath}"`, { stdio: 'pipe' });

        console.log("  -> Rendering Raw Frame with AE Effects...");
        // ✨ Put the OMtemplate flag back so AE doesn't silently skip the render!
        const cmd = `"${AERENDER_PATH}" -project "${tempAep}" -comp "${config.render_comp}" -s ${frameNum} -e ${frameNum} -OMtemplate "Lossless with Alpha" -output "${tempAvi}"`;
        execSync(cmd, { stdio: 'pipe' });

        console.log("  -> Slicing Chroma Key & Exporting Canva UI...");
        // FFmpeg Magic: Strips #00FF00 (Green) and converts it to transparency
        const ffmpegCmd = `ffmpeg -i "${tempAvi}" -vf "chromakey=0x00FF00:0.15:0.1" -frames:v 1 -c:v png "${finalPng}" -y`;
        execSync(ffmpegCmd, { stdio: 'pipe' });

        console.log(`  [✓] Success! Window exported to: /previews/${templateId}_${sceneName}_hole.png`);
        
    } catch (err) {
        console.error(`  [X] Pipeline failed for ${sceneName}:`, err.message);
    } finally {
        // Silent cleanup
        if(fs.existsSync(tempAvi)) fs.unlinkSync(tempAvi);
        if(fs.existsSync(tempAep)) fs.unlinkSync(tempAep);
        if(fs.existsSync(jsxPath)) fs.unlinkSync(jsxPath);
        if(fs.existsSync(jsxLogPath)) fs.unlinkSync(jsxLogPath);
    }
});

console.log(`\n🎉 SaaS Chroma Pipeline Complete! The Frontend UI is ready.\n`);