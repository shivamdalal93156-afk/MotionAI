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
  const aerenderPath      = process.env.AERENDER_PATH;
  const outputPath        = path.join(jobDir, 'output.mp4');
  const compName          = templateConfig.compName;
  const RENDER_TIMEOUT_MS = parseInt(process.env.JOB_TIMEOUT_MS || '1800000');

  const endPoint = calculateEndPoint(templateConfig, job.inputData);

  const args = [
    '-project', `"${tempAepPath}"`,
    '-comp',    `"${compName}"`,
    '-output',  `"${outputPath}"`,
    '-s', '1',                   // disable motion blur — no quality loss, saves 10-20% render time
    '-continueOnMissingFootage',
  ];

  let endFrame = 0;

  if (endPoint !== null) {
    const fps = templateConfig.fps || 25;
    endFrame  = Math.round(endPoint * fps);
    args.push('-e', String(endFrame));
    jobLog('AERENDER_PARTIAL', { endPoint, endFrame });
  } else {
    const fps = templateConfig.fps || 25;
    endFrame  = Math.round((templateConfig.duration || 0) * fps);
    jobLog('AERENDER_FULL');
  }

  jobLog('AERENDER_LAUNCH', { args: args.join(' '), compName });

  return new Promise((resolve, reject) => {
    const aerender = spawn(`"${aerenderPath}"`, args, {
      shell:       true,
      stdio:       ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let settled        = false;
    let lastSize       = 0;
    let lastSizeChange = Date.now();
    let currentFrame   = 0;

    aerender.stdout.on('data', chunk => {
      const text = chunk.toString();
      if (text.trim()) jobLog('AERENDER_STDOUT', { text: text.trim().slice(0, 500) });

      const m = text.match(/PROGRESS:\s+[\d;:]+\s+\((\d+)\)/);
      if (m) {
        currentFrame = parseInt(m[1]);
        try {
          const { writeJobFile, readJobFile } = require('./jobQueue');
          const existing = readJobFile(job.jobId) || {};
          writeJobFile(job.jobId, 'lock', {
            ...existing,
            lastEvent:   'AERENDER_PROGRESS',
            lastFrame:   currentFrame,
            totalFrames: endFrame,
          });
        } catch (e) {
          console.error(`[PROGRESS ERROR]`, e.message);
        }
      }
    });

    aerender.stderr.on('data', chunk => {
      const text = chunk.toString().trim();
      if (text) jobLog('AERENDER_STDERR', { text: text.slice(0, 500) });
    });

    const growthWatchdog = setInterval(() => {
      if (!fs.existsSync(outputPath)) return;
      const size = fs.statSync(outputPath).size;
      if (size > lastSize) {
        lastSize       = size;
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
        exitCode:       code,
        outputPath,
        sizeMB:         (size / 1048576).toFixed(1),
        framesRendered: currentFrame,
        wasPartial:     endPoint !== null,
      });

      resolve({ aviPath: outputPath });
    });

    aerender.on('error', (err) => {
      clearInterval(growthWatchdog);
      clearTimeout(hardTimeout);
      if (!settled) {
        settled = true;
        reject(new Error(`AERENDER_SPAWN_ERROR: ${err.message}`));
      }
    });
  });
}

module.exports = { runAERender };