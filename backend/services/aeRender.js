const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const { updateJob } = require('./jobStore');
const { buildJSX } = require('./jsxGenerator');
const { getCompNameForStrategy } = require('./templateManifest');

const execAsync = util.promisify(exec);

const AERENDER_PATH = process.env.AE_RENDER_PATH;
// afterfx is just aerender.exe replaced with AfterFX.com
const AFTERFX_PATH = AERENDER_PATH.replace('aerender.exe', 'AfterFX.com');
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || './outputs');
const TEMP_DIR = path.resolve(path.join(__dirname, '../temp'));

async function renderVideo(jobId, config, textData, hiddenLayerNames, imageData, strategy, start, duration, chunkIndex = 0, isMultipart = false) {
  try {
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // Read the config name to resolve corresponding JSON from /configs directory
    const template_id = typeof config === 'string' ? config : (config.template_id || 'dynamic_typography');
    const dynamicConfigPath = path.join(__dirname, '../configs', `${template_id}.json`);

    let activeConfig = typeof config === 'object' ? config : {};

    // Explicitly load configuration from /configs/ to extract aep_file natively
    if (fs.existsSync(dynamicConfigPath)) {
      activeConfig = JSON.parse(fs.readFileSync(dynamicConfigPath, 'utf8'));
    }

    // Extract the aep_file value from the loaded JSON
    const aepFileName = activeConfig.aep_file;
    if (!aepFileName) {
      throw new Error(`Critical Error: aep_file is missing from ${template_id}.json`);
    }

    // Construct the dynamic, specific absolute path into the /templates/ directory
    const templatePath = path.resolve(path.join(__dirname, '../templates', aepFileName));

    const tempAepPath = path.join(TEMP_DIR, `temp_${jobId}.aep`);
    const tempJsxPath = path.join(TEMP_DIR, `inject_${jobId}.jsx`);
    const logFilePath = path.join(TEMP_DIR, `log_${jobId}.txt`);

    // Outputs
    // Output native .avi, but prepare a specific .mp4 for each chunk
    const outputPath = isMultipart ? path.join(OUTPUT_DIR, `${jobId}_part${chunkIndex}.avi`) : path.join(OUTPUT_DIR, `${jobId}.avi`);
    const finalOutput = isMultipart ? path.join(OUTPUT_DIR, `${jobId}_part${chunkIndex}.mp4`) : path.join(OUTPUT_DIR, `${jobId}.mp4`);

    // Force-Erase logic removed as payload structure is now array-based and handled securely in the routes.

    // 1. Build and write the JSX script
    updateJob(jobId, { status: 'processing', progress: 10, message: 'Generating injection script...' });
    // Remap imageData slot keys to actual AE comp names using image_map
const remappedImageData = {};
if (activeConfig.image_map && imageData) {
  Object.keys(imageData).forEach(slotKey => {
    const imgConfig = activeConfig.image_map[slotKey];
const aeCompName = typeof imgConfig === 'object' ? imgConfig.comp : imgConfig;
    if (aeCompName) {
      remappedImageData[aeCompName] = imageData[slotKey];
    }
  });
}
let jsxContent = buildJSX(activeConfig, textData, hiddenLayerNames, remappedImageData, templatePath, tempAepPath, logFilePath);


    let trimCommand = "";
    if (start !== undefined && duration !== undefined) {
      const renderCompName = activeConfig.render_comp || 'MAIN_RENDER';
      trimCommand = `
// Crop the main composition timeline
var startTime = ${start};
var renderDuration = ${duration};
var mainComp = null;
for (var i = 1; i <= app.project.numItems; i++) {
    if (app.project.item(i) instanceof CompItem && app.project.item(i).name === "${renderCompName}") {
        mainComp = app.project.item(i);
        break;
    }
}

if (mainComp !== null) {
    mainComp.workAreaStart = startTime;
    mainComp.workAreaDuration = renderDuration;
    // Don't change duration
}
`;
    }

    const safeTempFolder = TEMP_DIR.replace(/\\/g, '/');
    const safeErrorLogPath = `${safeTempFolder}/jsx_error.log`;

    jsxContent = `
try {
    app.beginSuppressDialogs();
${jsxContent}
${trimCommand}
    app.endSuppressDialogs(false);
    app.quit();
} catch (e) {
    var errFile = new File("${safeErrorLogPath}");
    errFile.open("w");
    errFile.writeln(e.toString());
    errFile.close();
    app.quit();
}
`;

    fs.writeFileSync(tempJsxPath, jsxContent, 'utf8');

    // 2. Inject text & save temp AEP using AfterFX.com
    updateJob(jobId, { status: 'processing', progress: 20, message: 'Injecting text into After Effects...' });
    // Kill any existing AE instances first
try { execSync('taskkill /F /IM AfterFX.exe /T', {stdio:'ignore'}); } catch(e) {}
try { execSync('taskkill /F /IM afterfx.com /T', {stdio:'ignore'}); } catch(e) {}
await new Promise(resolve => setTimeout(resolve, 1000));
    const injectCmd = `"${AFTERFX_PATH}" -noui -r "${tempJsxPath}"`;
    try {
      const { stdout, stderr } = await execAsync(injectCmd, { timeout: 300000 });
      if (stdout) console.log('[ExtendScript stdout]', stdout);
      if (stderr) console.error('[ExtendScript stderr]', stderr);
    } catch (e) {
      console.error('[ExtendScript Execution Error]', e);
      // Don't throw if AE quit successfully (check log file exists)
  if (!fs.existsSync(tempAepPath)) {
    throw new Error(`ExtendScript injection failed: ${e.message}`);
  }
  console.log('[ExtendScript] AE exited with signal but temp AEP exists — continuing...');
    }

    // Wait for Windows file locks to release
await new Promise(resolve => setTimeout(resolve, 3000));
try { require('child_process').execSync('taskkill /F /IM AfterFX.exe /T', {stdio:'ignore'}); } catch(e) {}
try { require('child_process').execSync('taskkill /F /IM afterfx.com /T', {stdio:'ignore'}); } catch(e) {}
await new Promise(resolve => setTimeout(resolve, 2000));
    // Verify temp AEP was created
    if (!fs.existsSync(tempAepPath)) {
      throw new Error(`Injection failed, temp AEP not found at ${tempAepPath}`);
    }

    // 3. Render via aerender.exe
    updateJob(jobId, { status: 'processing', progress: 40, message: 'Rendering... (this takes several minutes)' });

    const compName = getCompNameForStrategy(activeConfig, strategy);

    const aeArgs = [
      '-project', tempAepPath,
      '-comp', activeConfig.render_comp || 'MAIN_COMP',
      '-OMtemplate', 'Lossless',
      '-output', outputPath,
      '-sound', 'OFF',
      '-close', 'DO_NOT_SAVE_CHANGES'
    ];

    if (start !== undefined && duration !== undefined && duration !== null) {
      const startFrame = Math.floor(start * 30);
      const endFrame = Math.floor((start + duration) * 30);
      aeArgs.push('-s', startFrame.toString(), '-e', endFrame.toString());
    }

    console.log(`Starting aerender. Watch terminal for frame progress...`);
    const aerenderProcess = require('child_process').spawn(process.env.AE_RENDER_PATH, aeArgs);

    aerenderProcess.stdout.on('data', (data) => {
      console.log(data.toString());
    });

    aerenderProcess.stderr.on('data', (data) => {
      console.error(`AE Warning/Error: ${data.toString()}`);
    });

    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.error(`[Job ${jobId}] aerender process timed out after 10 minutes. Killing process...`);
        aerenderProcess.kill('SIGKILL');
        reject(new Error("aerender process timed out after 10 minutes"));
      }, 120 * 60 * 1000); // 2 hours

      aerenderProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code !== 0) {
          console.warn(`aerender exited with code ${code}, verifying output file before throwing error...`);
        }
        resolve();
      });
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error(`Aerender failed, output file not found at ${outputPath}`);
    }

    const stats = fs.statSync(outputPath);
    if (stats.size < 1024 * 1024) {
      throw new Error(`Aerender failed, output file is too small/corrupted at ${outputPath}. Size: ${stats.size} bytes`);
    }

    // 4. Compress via FFmpeg (ALWAYS RUN THIS TO SAVE 30GB)
    updateJob(jobId, { status: 'processing', progress: 85, message: `Compressing part to save space...` });

    let ffmpegCmd = '';
    if (strategy === 'overlay') {
      const baseVideoPath = path.resolve(path.join(__dirname, '../templates/configs', activeConfig.base_video));
      ffmpegCmd = `ffmpeg -i "${baseVideoPath}" -i "${outputPath}" -filter_complex "[0:v][1:v]overlay=0:0" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -y "${finalOutput}"`;
    } else {
      ffmpegCmd = `ffmpeg -i "${outputPath}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -y "${finalOutput}"`;
    }

    await execAsync(ffmpegCmd);

    if (!fs.existsSync(finalOutput)) {
      throw new Error(`FFmpeg failed, MP4 not found at ${finalOutput}`);
    }

    // IMMEDIATELY DELETE THE HEAVY .AVI FILE
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    // Only mark the job as completely "done" here if it's a single-part render.
    // If it's multipart, render.js will trigger the stitcher and mark it done later.
    if (!isMultipart) {
      updateJob(jobId, {
        status: 'done',
        progress: 100,
        message: 'Render complete!',
        outputUrl: `/outputs/${jobId}.mp4`
      });
    }

    // 5. Cleanup temp files for all jobs
    try {
      if (fs.existsSync(tempAepPath)) fs.unlinkSync(tempAepPath);
      if (fs.existsSync(tempJsxPath)) fs.unlinkSync(tempJsxPath);
      if (fs.existsSync(logFilePath)) fs.unlinkSync(logFilePath);
    } catch (cleanupErr) {
      console.error(`[Job ${jobId}] Cleanup error:`, cleanupErr);
    }

    return finalOutput;

  } catch (error) {
    console.error(`[Job ${jobId}] Render error:`, error);
    updateJob(jobId, { status: 'error', progress: 0, message: `Render failed: ${error.message}` });
    throw error;
  }
}
// Paste this near the bottom of aeRender.js
async function stitchMp4Videos(jobId, totalParts) {
  const OUTPUT_DIR = path.join(__dirname, '../outputs');
  const listPath = path.join(OUTPUT_DIR, `${jobId}_list.txt`);
  const finalOutputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  // Create a text file that FFmpeg uses to know which MP4s to stitch
  let fileContent = '';
  for (let i = 0; i < totalParts; i++) {
    const partName = `${jobId}_part${i}.mp4`;
    fileContent += `file '${partName}'\n`;
  }
  require('fs').writeFileSync(listPath, fileContent);

  return new Promise((resolve, reject) => {
    // -c copy tells FFmpeg to stitch them instantly without re-encoding
    const cmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${finalOutputPath}"`;
    
    require('child_process').exec(cmd, (error) => {
      if (error) {
        console.error("Stitching error:", error);
        return reject(error);
      }
      
      // Clean up the text file and the individual MP4 parts to save space
      try {
        require('fs').unlinkSync(listPath);
        for (let i = 0; i < totalParts; i++) {
          require('fs').unlinkSync(path.join(OUTPUT_DIR, `${jobId}_part${i}.mp4`));
        }
      } catch (cleanupErr) {
        console.warn("Cleanup error (ignored):", cleanupErr);
      }
      
      resolve(finalOutputPath);
    });
  });
}

// Make sure you export BOTH functions at the very bottom!
module.exports = { renderVideo, stitchMp4Videos };

