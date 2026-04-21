// const { exec } = require('child_process');
// const path = require('path');
// const fs = require('fs');
// const { buildJSX } = require('./jsxGenerator');
// const { updateJob } = require('./jobStore');

// const AE_RENDER_PATH = process.env.AE_RENDER_PATH;
// const AE_TEMPLATE_PATH = process.env.AE_TEMPLATE_PATH;
// const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || './outputs');

// /**
//  * Main render function
//  * @param {string} jobId - unique job ID
//  * @param {object} textData - all 26 text layer values
//  * @returns {Promise<string>} - path to output video
//  */
// async function renderVideo(jobId, textData) {
//   const jsxDir = path.join(__dirname, '..', 'temp');
//   if (!fs.existsSync(jsxDir)) fs.mkdirSync(jsxDir, { recursive: true });

//   const jsxPath = path.join(jsxDir, `inject_${jobId}.jsx`);
//   const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`).replace(/\\/g, '/');
//   const logPath = path.join(jsxDir, 'inject_log.txt');

//   try {
//     // Step 1: Generate JSX injection script
//     updateJob(jobId, { status: 'processing', progress: 10, message: 'Generating injection script...' });
//     const jsxContent = buildJSX(textData);
//     fs.writeFileSync(jsxPath, jsxContent, 'utf8');

//     // Step 2: Run JSX script via aerender to inject text into the template
//     updateJob(jobId, { progress: 25, message: 'Injecting text into After Effects template...' });
//     await runAEScript(jsxPath);

//     // Step 3: Read log to confirm injection worked
//     if (fs.existsSync(logPath)) {
//       const logContent = fs.readFileSync(logPath, 'utf8');
//       const matchLine = logContent.split('\n')[0];
//       console.log(`[Job ${jobId}] Injection log: ${matchLine}`);
//     }

//     // Step 4: Render the template
//     updateJob(jobId, { progress: 40, message: 'After Effects is rendering your video... (this takes 1-3 mins)' });
//     await runAERender(outputPath);

//     // Step 5: Verify output exists
//     if (!fs.existsSync(outputPath)) {
//       throw new Error('Render completed but output file not found. Check AE render queue.');
//     }

//     const outputUrl = `/outputs/${jobId}.mp4`;
//     updateJob(jobId, {
//       status: 'done',
//       progress: 100,
//       message: 'Render complete!',
//       outputPath,
//       outputUrl
//     });

//     // Cleanup temp JSX
//     cleanupTemp(jsxPath, logPath);

//     return outputUrl;

//   } catch (err) {
//     updateJob(jobId, {
//       status: 'error',
//       progress: 0,
//       message: `Render failed: ${err.message}`
//     });
//     cleanupTemp(jsxPath, logPath);
//     throw err;
//   }
// }

// /**
//  * Run the JSX injection script using aerender
//  * Uses -r flag to run a script without rendering
//  */
// function runAEScript(jsxPath) {
//   return new Promise((resolve, reject) => {
//     // aerender can run a JSX script using -r (run script) mode
//     // We use afterfx.exe (interactive) for script execution, not aerender
//     // because aerender doesn't support -run flag for standalone scripts.
//     // We call aerender with the template - it will pick up the saved project state.

//     // Actually: best approach is to use aerender with -s flag (script)
//     const cmd = `"${AE_RENDER_PATH}" -project "${AE_TEMPLATE_PATH}" -s "${jsxPath}"`;

//     console.log(`[AE Script] Running: ${cmd}`);

//     exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
//       if (stdout) console.log('[AE Script stdout]', stdout);
//       if (stderr) console.log('[AE Script stderr]', stderr);

//       // aerender returns non-zero even on success sometimes - check output file instead
//       // For script-only run, we just proceed
//       resolve();
//     });
//   });
// }

// /**
//  * Run the actual AE render via aerender.exe
//  */
// function runAERender(outputPath) {
//   return new Promise((resolve, reject) => {
//     // -project: the .aep file
//     // -comp: the composition name to render
//     // -output: where to save the file
//     // -OMtemplate: output module template (H.264 or your AE preset)
//     const cmd = [
//       `"${AE_RENDER_PATH}"`,
//       `-project "${AE_TEMPLATE_PATH}"`,
//       `-comp "MAIN_COMP"`,
//       `-output "${outputPath}"`,
//       `-OMtemplate "H.264"`,
//       `-RStemplate "Best Settings"`,
//       `-close DO_NOT_SAVE_CHANGES`
//     ].join(' ');

//     console.log(`[AE Render] Running: ${cmd}`);

//     // Render can take 1-5 minutes for a 44s comp
//     exec(cmd, { timeout: 600000 }, (error, stdout, stderr) => {
//       if (stdout) console.log('[AE Render stdout]', stdout.substring(0, 500));
//       if (stderr) console.log('[AE Render stderr]', stderr.substring(0, 500));

//       if (error && error.code !== 0) {
//         // Check if output was actually created despite non-zero exit code
//         // aerender sometimes returns error codes even on success
//         if (fs.existsSync(outputPath)) {
//           console.log('[AE Render] Non-zero exit but output file exists, treating as success');
//           resolve();
//         } else {
//           reject(new Error(`aerender exited with code ${error.code}. Check AE logs.`));
//         }
//       } else {
//         resolve();
//       }
//     });
//   });
// }

// function cleanupTemp(...files) {
//   files.forEach(f => {
//     try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
//   });
// }

// module.exports = { renderVideo };
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { buildJSX } = require('./jsxGenerator');
const { updateJob } = require('./jobStore');

const AE_RENDER_PATH = process.env.AE_RENDER_PATH;
const AE_TEMPLATE_PATH = process.env.AE_TEMPLATE_PATH;
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || '../outputs');

async function renderVideo(jobId, textData) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const jsxDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(jsxDir)) fs.mkdirSync(jsxDir, { recursive: true });

  const jsxPath = path.join(jsxDir, `inject_${jobId}.jsx`);
  const tempAepPath = path.join(jsxDir, `temp_${jobId}.aep`);
  const logPath = path.join(jsxDir, `log_${jobId}.txt`);
  
  const rawAviPath = path.join(OUTPUT_DIR, `${jobId}.avi`);
  const finalMp4Path = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  try {
    updateJob(jobId, { status: 'processing', progress: 10, message: 'Generating injection script...' });
    
    const jsxContent = buildJSX(textData, AE_TEMPLATE_PATH, tempAepPath, logPath);
    fs.writeFileSync(jsxPath, jsxContent, 'utf8');

    updateJob(jobId, { progress: 20, message: 'Injecting text into After Effects...' });
    await runAEScript(jsxPath);

    if (!fs.existsSync(tempAepPath)) throw new Error("Injection failed.");

    updateJob(jobId, { progress: 40, message: 'Rendering heavy graphics... (Grab a coffee, this will take a while)' });
    
    // 1. Render AVI with NO TIMEOUT
    await runAERender(tempAepPath, rawAviPath);

    if (!fs.existsSync(rawAviPath)) throw new Error('Render completed but raw AVI not found.');

    updateJob(jobId, { progress: 90, message: 'Compressing massive video to MP4...' });

    // 2. Compress to MP4
    await runFFmpeg(rawAviPath, finalMp4Path);

    const outputUrl = `/outputs/${jobId}.mp4`;
    updateJob(jobId, {
      status: 'done',
      progress: 100,
      message: 'Render complete!',
      outputPath: finalMp4Path,
      outputUrl
    });

    // Clean up the massive AVI to save your hard drive
    cleanupTemp(jsxPath, tempAepPath, logPath, rawAviPath);
    return outputUrl;

  } catch (err) {
    updateJob(jobId, { status: 'error', progress: 0, message: `Render failed: ${err.message}` });
    cleanupTemp(jsxPath, tempAepPath, logPath, rawAviPath);
    throw err;
  }
}

function runAEScript(jsxPath) {
  return new Promise((resolve) => {
    const aeExePath = AE_RENDER_PATH.replace("aerender.exe", "AfterFX.com");
    exec(`"${aeExePath}" -r "${jsxPath}"`, { timeout: 120000 }, () => resolve());
  });
}

function runAERender(aepPath, outputPath) {
  return new Promise((resolve, reject) => {
    const safeOutPath = outputPath.replace(/\\/g, '/');
    const cmd = [
      `"${AE_RENDER_PATH}"`,
      `-project "${aepPath}"`,
      `-comp "MAIN_COMP"`,
      `-output "${safeOutPath}"`,
      `-OMtemplate "H.264"`,
      `-close DO_NOT_SAVE_CHANGES`
    ].join(' ');

    // CRITICAL FIX: timeout is set to 0 (infinite). Node will never murder AE again.
    exec(cmd, { timeout: 0, maxBuffer: 1024 * 1024 * 100 }, (error, stdout) => {
      if (error && error.code !== 0) {
        console.log('\n❌ --- AFTER EFFECTS CRASHED --- ❌\n', stdout.slice(-1500), '\n------------------------------------\n');
        reject(new Error(`After Effects crashed (Code ${error.code}).`));
      } else {
        resolve();
      }
    });
  });
}

function runFFmpeg(inputAvi, outputMp4) {
  return new Promise((resolve, reject) => {
    const cmd = `ffmpeg -i "${inputAvi}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -y "${outputMp4}"`;
    exec(cmd, { timeout: 600000 }, (error) => {
      if (error) reject(new Error(`FFmpeg failed: ${error.message}`));
      else resolve();
    });
  });
}

function cleanupTemp(...files) {
  files.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} });
}

module.exports = { renderVideo };