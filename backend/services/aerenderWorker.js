// const fs        = require('fs');
// const path      = require('path');
// const { spawn } = require('child_process');

// async function runAERender(job, tempAepPath, jobDir, jobLog, templateConfig) {
//   const aerenderPath = process.env.AERENDER_PATH;
//   const aviPath      = path.join(jobDir, 'output.avi');
//   const compName     = templateConfig.compName;

//   const RENDER_TIMEOUT_MS = parseInt(process.env.JOB_TIMEOUT_MS || '1800000'); // 30 min

//   // Build aerender args — only what's needed, nothing extra
//   const args = [
//     '-project',  `"${tempAepPath}"`,
//     '-comp',     `"${compName}"`,
//     '-output',   `"${aviPath}"`,
//     '-s',        '1',           // start frame
//     // '-RStemplate', 'Best Settings',
//     // '-OMtemplate', 'Lossless',
//   ];

//   jobLog('AERENDER_LAUNCH', { args: args.join(' '), compName });

//   return new Promise((resolve, reject) => {
//     const aerender = spawn(`"${aerenderPath}"`, args, {
//       shell: true,
//       stdio: ['ignore', 'pipe', 'pipe'],
//       windowsHide: true,
//     });

//     let settled       = false;
//     let lastAviSize   = 0;
//     let lastSizeChange = Date.now();
//     let totalFrames   = 0;
//     let currentFrame  = 0;

//     // ── stdout: parse progress ───────────────────────────────────
//     aerender.stdout.on('data', chunk => {
//       const text = chunk.toString();

//       // Parse frame progress from aerender output
//       // Format: "PROGRESS:  0:00:00:10 (10)"
//       const progressMatch = text.match(/PROGRESS:\s+[\d:]+\s+\((\d+)\)/);
//       if (progressMatch) {
//         currentFrame = parseInt(progressMatch[1]);
//         jobLog('AERENDER_PROGRESS', { frame: currentFrame, totalFrames });
//       }

//       // Parse total frames
//       const totalMatch = text.match(/Total Time Elapsed.*?(\d+)\s+frames/);
//       if (totalMatch) totalFrames = parseInt(totalMatch[1]);

//       // Log everything — no filtering
//       if (text.trim()) jobLog('AERENDER_STDOUT', { text: text.trim().slice(0, 500) });
//     });

//     // ── stderr: log everything, detect GPU issues ────────────────
//     aerender.stderr.on('data', chunk => {
//       const text = chunk.toString().trim();
//       if (!text) return;
//       const severity = text.toLowerCase().includes('error') ? 'error' : 'warn';
//       jobLog('AERENDER_STDERR', { text: text.slice(0, 500), severity });
//     });

//     // ── AVI growth watchdog ──────────────────────────────────────
//     // If AVI stops growing for 5 minutes, aerender is frozen
//     const growthWatchdog = setInterval(() => {
//       if (!fs.existsSync(aviPath)) return;
//       const currentSize = fs.statSync(aviPath).size;
//       if (currentSize > lastAviSize) {
//         lastAviSize    = currentSize;
//         lastSizeChange = Date.now();
//         jobLog('AERENDER_AVI_GROWTH', { sizeMB: (currentSize / 1048576).toFixed(1) });
//       } else {
//         const staleMs = Date.now() - lastSizeChange;
//         if (staleMs > 5 * 60 * 1000 && !settled) {
//           clearInterval(growthWatchdog);
//           settled = true;
//           aerender.kill('SIGKILL');
//           reject(new Error(`AERENDER_FROZEN: AVI unchanged for ${Math.round(staleMs / 60000)} minutes`));
//         }
//       }
//     }, 30000);

//     // ── Hard timeout ─────────────────────────────────────────────
//     const hardTimeout = setTimeout(() => {
//       if (!settled) {
//         clearInterval(growthWatchdog);
//         settled = true;
//         aerender.kill('SIGKILL');
//         reject(new Error(`AERENDER_TIMEOUT: exceeded ${RENDER_TIMEOUT_MS / 60000} minutes`));
//       }
//     }, RENDER_TIMEOUT_MS);

//     aerender.on('close', (code) => {
//       clearInterval(growthWatchdog);
//       clearTimeout(hardTimeout);
//       if (settled) return;
//       settled = true;

//       // Verify AVI exists and has substance
//       if (!fs.existsSync(aviPath)) {
//         return reject(new Error(`AERENDER_NO_OUTPUT: aerender exited (code ${code}) but no AVI produced`));
//       }
//       const aviSize = fs.statSync(aviPath).size;
//       if (aviSize < 1048576) { // less than 1MB is certainly wrong
//         return reject(new Error(`AERENDER_OUTPUT_TOO_SMALL: AVI is only ${aviSize} bytes`));
//       }

//       jobLog('AERENDER_COMPLETE', {
//         exitCode: code,
//         aviPath,
//         aviSizeMB: (aviSize / 1048576).toFixed(1),
//         framesRendered: currentFrame,
//       });
//       resolve({ aviPath });
//     });

//     aerender.on('error', (err) => {
//       clearInterval(growthWatchdog);
//       clearTimeout(hardTimeout);
//       if (!settled) { settled = true; reject(new Error(`AERENDER_SPAWN_ERROR: ${err.message}`)); }
//     });
//   });
// }

// module.exports = { runAERender };
const fs        = require('fs');
const path      = require('path');
const { spawn } = require('child_process');

function calculateEndPoint(templateConfig, inputData) {
  const sceneMap = templateConfig.sceneMap;
  if (!sceneMap) return null;

  let lastFilledOutpoint = null;
  for (const [sceneName, scene] of Object.entries(sceneMap)) {
    const anyFilled = scene.keys.some(key => {
      const val = inputData[key];
      return val && String(val).trim() !== '';
    });
    if (anyFilled) lastFilledOutpoint = scene.outpoint;
  }
  return lastFilledOutpoint;
}

async function runAERender(job, tempAepPath, jobDir, jobLog, templateConfig) {
  const aerenderPath = process.env.AERENDER_PATH;
  const outputPath   = path.join(jobDir, 'output.mp4');  // AE 2026 outputs MP4 directly
  const compName     = templateConfig.compName;
  const RENDER_TIMEOUT_MS = parseInt(process.env.JOB_TIMEOUT_MS || '1800000');

  const endPoint = calculateEndPoint(templateConfig, job.inputData);

  const args = [
    '-project', `"${tempAepPath}"`,
    '-comp',    `"${compName}"`,
    '-output',  `"${outputPath}"`,
    '-s', '1',
    '-continueOnMissingFootage',
  ];

  if (endPoint !== null) {
    // Convert seconds to frame number (comp is 25fps)
    const fps = templateConfig.fps || 25;
    const endFrame = Math.round(endPoint * fps);
    args.push('-e', String(endFrame));
    jobLog('AERENDER_PARTIAL', { endPoint,endFrame });
  } else {
    jobLog('AERENDER_FULL', {});
  }

  jobLog('AERENDER_LAUNCH', { args: args.join(' '), compName });

  return new Promise((resolve, reject) => {
    const aerender = spawn(`"${aerenderPath}"`, args, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let settled        = false;
    let lastSize       = 0;
    let lastSizeChange = Date.now();
    let currentFrame   = 0;

    aerender.stdout.on('data', chunk => {
      const text = chunk.toString();
      const m = text.match(/PROGRESS:\s+[\d:]+\s+\((\d+)\)/);
      if (m) {
        currentFrame = parseInt(m[1]);
        jobLog('AERENDER_PROGRESS', { frame: currentFrame });
      }
      if (text.trim()) jobLog('AERENDER_STDOUT', { text: text.trim().slice(0, 500) });
    });

    aerender.stderr.on('data', chunk => {
      const text = chunk.toString().trim();
      if (text) jobLog('AERENDER_STDERR', { text: text.slice(0, 500) });
    });

    // Growth watchdog — monitors output.mp4 size
    const growthWatchdog = setInterval(() => {
      if (!fs.existsSync(outputPath)) return;
      const size = fs.statSync(outputPath).size;
      if (size > lastSize) {
        lastSize = size;
        lastSizeChange = Date.now();
      } else {
        const staleMs = Date.now() - lastSizeChange;
        if (staleMs > 5 * 60 * 1000 && !settled) {
          clearInterval(growthWatchdog);
          settled = true;
          aerender.kill('SIGKILL');
          reject(new Error(`AERENDER_FROZEN: output unchanged for ${Math.round(staleMs / 60000)} minutes`));
        }
      }
    }, 30000);

    const hardTimeout = setTimeout(() => {
      if (!settled) {
        clearInterval(growthWatchdog);
        settled = true;
        aerender.kill('SIGKILL');
        reject(new Error(`AERENDER_TIMEOUT: exceeded ${RENDER_TIMEOUT_MS / 60000} minutes`));
      }
    }, RENDER_TIMEOUT_MS);

    aerender.on('close', (code) => {
      clearInterval(growthWatchdog);
      clearTimeout(hardTimeout);
      if (settled) return;
      settled = true;

      if (!fs.existsSync(outputPath)) {
        return reject(new Error(`AERENDER_NO_OUTPUT: aerender exited code ${code} but no output.mp4 found`));
      }
      const size = fs.statSync(outputPath).size;
      if (size < 1048576) {
        return reject(new Error(`AERENDER_OUTPUT_TOO_SMALL: only ${size} bytes`));
      }

      jobLog('AERENDER_COMPLETE', {
        exitCode: code,
        outputPath,
        sizeMB: (size / 1048576).toFixed(1),
        framesRendered: currentFrame,
        wasPartial: endPoint !== null,
      });
      resolve({ aviPath: outputPath }); // named aviPath for compatibility with worker
    });

    aerender.on('error', (err) => {
      clearInterval(growthWatchdog);
      clearTimeout(hardTimeout);
      if (!settled) { settled = true; reject(new Error(`AERENDER_SPAWN_ERROR: ${err.message}`)); }
    });
  });
}

module.exports = { runAERender };