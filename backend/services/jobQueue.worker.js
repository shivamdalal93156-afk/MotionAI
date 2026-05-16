// const fs   = require('fs');
// const path = require('path');

// const {
//   getOldestPendingJob,
//   acquireLock,
//   releaseLock,
//   markJobProcessing,
//   markJobDone,
//   markJobFailed,
//   scheduleRetry,
//   readJobFile,
//   writeJobFile,
//   getQueueStats,
// } = require('./jobQueue');

// const { runAEInjection, killAllAEProcesses, verifyAEPrefs, rebuildAEPrefs } = require('./aeWorker');
// const { runAERender }  = require('./aerenderWorker');
// const { runFFmpeg }    = require('./ffmpegWorker');
// const { cleanJobDir }  = require('./cleanup');

// const JOBS_DIR      = path.resolve(__dirname, '..', 'jobs');
// const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');
// const LOG_DIR       = path.resolve(__dirname, '..', 'logs', 'jobs');

// // ── Per-job logger ───────────────────────────────────────────────

// function makeJobLogger(jobId) {
//   const logPath = path.join(LOG_DIR, `${jobId}.jsonl`);
//   return function jobLog(event, data = {}) {
//     const line = JSON.stringify({ ts: Date.now(), event, ...data }) + '\n';
//     try { fs.appendFileSync(logPath, line); } catch {}
//     console.log(`[${jobId.slice(0, 8)}] ${event}`, Object.keys(data).length ? data : '');
//   };
// }

// // ── Retry decision engine ────────────────────────────────────────

// const RETRY_MAP = {
//   'AE_HEARTBEAT_TIMEOUT':   { maxRetries: 1, delayMs: 15000,  preAction: 'kill_ae' },
//   'AE_INJECTION_TIMEOUT':   { maxRetries: 1, delayMs: 15000,  preAction: 'kill_ae' },
//   'AE_SCRIPT_INCOMPLETE':   { maxRetries: 1, delayMs: 15000,  preAction: 'kill_ae' },
//   'AE_NO_TEMP_AEP':         { maxRetries: 1, delayMs: 15000,  preAction: 'kill_ae' },
//   'AE_TEMP_AEP_TOO_SMALL':  { maxRetries: 1, delayMs: 15000,  preAction: 'kill_ae' },
//   'AE_SPAWN_ERROR':         { maxRetries: 1, delayMs: 30000,  preAction: 'rebuild_prefs' },
//   'AERENDER_FROZEN':        { maxRetries: 1, delayMs: 10000,  preAction: 'kill_ae' },
//   'AERENDER_CRASH':         { maxRetries: 2, delayMs: 10000,  preAction: 'kill_ae' },
//   'AERENDER_NO_OUTPUT':     { maxRetries: 1, delayMs: 10000,  preAction: 'kill_ae' },
//   'AERENDER_OUTPUT_TOO_SMALL': { maxRetries: 1, delayMs: 10000, preAction: 'kill_ae' },
//   'AERENDER_SPAWN_ERROR':   { maxRetries: 1, delayMs: 10000,  preAction: null },
//   'FFMPEG_FAIL':            { maxRetries: 2, delayMs: 5000,   preAction: null },
//   'FFMPEG_SPAWN_ERROR':     { maxRetries: 1, delayMs: 5000,   preAction: null },
// };

// // Hard abort — never retry these
// const HARD_ABORTS = [
//   'AE_NO_TEMP_AEP_AFTER_RETRY',
//   'TEMPLATE_NOT_FOUND',
//   'TEMPLATE_CONFIG_INVALID',
//   'AE_PREFS_REBUILD_FAILED',
//   'FFMPEG_TIMEOUT',
//   'AERENDER_TIMEOUT',
// ];

// function getFailureCode(errMessage) {
//   // Extract the error code prefix (e.g. 'AE_HEARTBEAT_TIMEOUT') from the message
//   const match = errMessage.match(/^([A-Z_]+):/);
//   return match ? match[1] : 'UNKNOWN';
// }

// async function decideRetry(job, errorMessage) {
//   const code = getFailureCode(errorMessage);

//   if (HARD_ABORTS.some(h => errorMessage.startsWith(h))) {
//     return { retry: false, reason: 'HARD_ABORT' };
//   }

//   const config = RETRY_MAP[code];
//   if (!config) return { retry: false, reason: `NO_RETRY_RULE_FOR_${code}` };

//   if ((job.retryCount || 0) >= config.maxRetries) {
//     return { retry: false, reason: 'MAX_RETRIES_EXCEEDED' };
//   }

//   // Check if this failure code has appeared before — if 2x same error, abort
//   const sameCodeCount = (job.failureHistory || []).filter(f => f === code).length;
//   if (sameCodeCount >= 2) {
//     return { retry: false, reason: 'REPEATED_SAME_FAILURE' };
//   }

//   // Run pre-action before scheduling retry
//   if (config.preAction === 'kill_ae') {
//     await killAllAEProcesses();
//   } else if (config.preAction === 'rebuild_prefs') {
//     try {
//       await rebuildAEPrefs();
//     } catch (rebuildErr) {
//       return { retry: false, reason: `PREFS_REBUILD_FAILED: ${rebuildErr.message}` };
//     }
//   }

//   return { retry: true, delayMs: config.delayMs, code };
// }

// // ── Main job executor ────────────────────────────────────────────

// async function executeJob(job) {
//   const jobLog = makeJobLogger(job.jobId);
//   const jobDir = path.join(JOBS_DIR, job.jobId);

//   // Ensure job dir exists (may have been cleaned if this is a retry)
//   if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

//   jobLog('JOB_START', { template: job.template, retryCount: job.retryCount });

//   // ── Load template config ─────────────────────────────────────
//   const templateDir  = path.join(TEMPLATES_DIR, job.template);
//   const configPath   = path.join(templateDir, 'config.json');

//   if (!fs.existsSync(configPath)) {
//     await markJobFailed(job.jobId, 'TEMPLATE_CONFIG_INVALID', `No config.json in ${templateDir}`);
//     return;
//   }

//   let templateConfig;
//   try {
//     templateConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
//   } catch (e) {
//     await markJobFailed(job.jobId, 'TEMPLATE_CONFIG_INVALID', e.message);
//     return;
//   }

//   // Verify the .aep file actually exists
//   const aepPath = path.join(templateDir, templateConfig.aepFile);
//   if (!fs.existsSync(aepPath)) {
//     await markJobFailed(job.jobId, 'TEMPLATE_NOT_FOUND', `AEP not found: ${aepPath}`);
//     return;
//   }

//   markJobProcessing(job.jobId);

//   // ── STAGE 1: AE Injection ─────────────────────────────────────
//   let tempAepPath;
//   try {
//     jobLog('STAGE', { stage: '1/3', name: 'ae_injection' });
//     const aeResult = await runAEInjection(job, templateConfig, jobDir, jobLog);
//     tempAepPath = aeResult.tempAepPath;
//   } catch (err) {
//     jobLog('STAGE_FAIL', { stage: '1/3', error: err.message });
//     const decision = await decideRetry(job, err.message);
//     if (decision.retry) {
//       jobLog('RETRY_SCHEDULED', { delayMs: decision.delayMs, reason: decision.code });
//       scheduleRetry(job.jobId, decision.delayMs);
//     } else {
//       jobLog('JOB_ABORT', { reason: decision.reason });
//       markJobFailed(job.jobId, getFailureCode(err.message), err.message);
//       cleanJobDir(job.jobId);
//     }
//     return;
//   }

//   // ── STAGE 2: AE Render ────────────────────────────────────────
//   let aviPath;
//   try {
//     jobLog('STAGE', { stage: '2/3', name: 'aerender' });
//     const renderResult = await runAERender(job, tempAepPath, jobDir, jobLog, templateConfig);
//     aviPath = renderResult.aviPath;
//   } catch (err) {
//     jobLog('STAGE_FAIL', { stage: '2/3', error: err.message });
//     const decision = await decideRetry(job, err.message);
//     if (decision.retry) {
//       jobLog('RETRY_SCHEDULED', { delayMs: decision.delayMs, reason: decision.code });
//       scheduleRetry(job.jobId, decision.delayMs);
//     } else {
//       jobLog('JOB_ABORT', { reason: decision.reason });
//       markJobFailed(job.jobId, getFailureCode(err.message), err.message);
//       cleanJobDir(job.jobId);
//     }
//     return;
//   }

//   // ── STAGE 3: FFmpeg ───────────────────────────────────────────
//   try {
//     jobLog('STAGE', { stage: '3/3', name: 'ffmpeg' });
//     const { outputUrl } = await runFFmpeg(aviPath, job.jobId, jobLog);
//     markJobDone(job.jobId, outputUrl);
//     cleanJobDir(job.jobId);
//     jobLog('JOB_COMPLETE', { outputUrl });
//   } catch (err) {
//     jobLog('STAGE_FAIL', { stage: '3/3', error: err.message });
//     const decision = await decideRetry(job, err.message);
//     if (decision.retry) {
//       jobLog('RETRY_SCHEDULED', { delayMs: decision.delayMs });
//       scheduleRetry(job.jobId, decision.delayMs);
//     } else {
//       markJobFailed(job.jobId, getFailureCode(err.message), err.message);
//       cleanJobDir(job.jobId);
//     }
//   }
// }

// // ── Worker loop ──────────────────────────────────────────────────

// let workerRunning = false;

// async function tick() {
//   if (workerRunning) return;

//   // Check for scheduled retries that are ready
//   const queueDir = path.resolve(__dirname, '..', 'queue');
//   const retryFiles = fs.readdirSync(queueDir).filter(f => f.endsWith('.retry_scheduled'));
//   for (const file of retryFiles) {
//     try {
//       const data = JSON.parse(fs.readFileSync(path.join(queueDir, file), 'utf8'));
//       if (Date.now() >= data.retryAt) {
//         console.log(`[worker] Retry ready: ${data.jobId}`);
//         // Re-queue as pending
//         writeJobFile(data.jobId, 'pending', data);
//       }
//     } catch {}
//   }

//   // Pick next pending job
//   const job = getOldestPendingJob();
//   if (!job) return;

//   // Atomic lock — prevents double-execution
//   if (!acquireLock(job.jobId)) {
//     console.log('[worker] Lock busy — skipping tick');
//     return;
//   }

//   workerRunning = true;
//   try {
//     await executeJob(job);
//   } catch (err) {
//     // Unhandled error in executeJob itself — should never happen, but safe fallback
//     console.error('[worker] UNHANDLED ERROR in executeJob:', err);
//     try {
//       markJobFailed(job.jobId, 'WORKER_UNHANDLED_ERROR', err.message);
//       releaseLock();
//       cleanJobDir(job.jobId);
//     } catch {}
//   } finally {
//     workerRunning = false;
//   }
// }

// function startWorkerLoop() {
//   console.log('[worker] Worker loop started — polling every 5s');
//   // Tick every 5 seconds — lightweight, file-based, survives restart
//   setInterval(tick, 5000);
//   // Also tick immediately on startup
//   tick();
// }

// module.exports = { startWorkerLoop };
const fs   = require('fs');
const path = require('path');

const {
  getOldestPendingJob,
  acquireLock,
  releaseLock,
  markJobProcessing,
  markJobDone,
  markJobFailed,
  scheduleRetry,
  writeJobFile,
  getQueueStats,
} = require('./jobQueue');

const { runAEInjection, killAllAEProcesses, rebuildAEPrefs } = require('./aeWorker');
const { runAERender }             = require('./aerenderWorker');
const { runFFmpeg, stitchMP4s }   = require('./ffmpegWorker');
const { cleanJobDir }             = require('./cleanup');

const JOBS_DIR      = path.resolve(__dirname, '..', 'jobs');
const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');
const LOG_DIR       = path.resolve(__dirname, '..', 'logs', 'jobs');

async function applyVoiceAudioIfPresent(job, finalMp4Path, jobLog) {
  if (!job.hasVoice || !job.audioPath) return finalMp4Path;

  const { mergeAudioIntoVideo } = require('./ffmpegWorker');
  const path = require('path');
  const fs   = require('fs');

  const withAudioPath = finalMp4Path.replace('.mp4', '_voiced.mp4');

  try {
    await mergeAudioIntoVideo(finalMp4Path, job.audioPath, withAudioPath, jobLog);
    // Replace original with voiced version
    fs.renameSync(withAudioPath, finalMp4Path);
    jobLog('VOICE_AUDIO_MERGED', { finalMp4Path });
    return finalMp4Path;
  } catch (err) {
    jobLog('VOICE_AUDIO_MERGE_FAILED', { error: err.message });
    // Return original video without audio — don't fail the job
    if (fs.existsSync(withAudioPath)) fs.unlinkSync(withAudioPath);
    return finalMp4Path;
  }
}

function makeJobLogger(jobId) {
  const logPath = path.join(LOG_DIR, `${jobId}.jsonl`);
  return function jobLog(event, data = {}) {
    const line = JSON.stringify({ ts: Date.now(), event, ...data }) + '\n';
    try { fs.appendFileSync(logPath, line); } catch {}
    console.log(`[${jobId.slice(0, 8)}] ${event}`, Object.keys(data).length ? data : '');
  };
}

const RETRY_MAP = {
  'AE_HEARTBEAT_TIMEOUT':      { maxRetries: 1, delayMs: 15000, preAction: 'kill_ae' },
  'AE_INJECTION_TIMEOUT':      { maxRetries: 1, delayMs: 15000, preAction: 'kill_ae' },
  'AE_SCRIPT_INCOMPLETE':      { maxRetries: 1, delayMs: 15000, preAction: 'kill_ae' },
  'AE_NO_TEMP_AEP':            { maxRetries: 1, delayMs: 15000, preAction: 'kill_ae' },
  'AE_TEMP_AEP_TOO_SMALL':     { maxRetries: 1, delayMs: 15000, preAction: 'kill_ae' },
  'AE_SPAWN_ERROR':            { maxRetries: 1, delayMs: 30000, preAction: 'rebuild_prefs' },
  'AERENDER_FROZEN':           { maxRetries: 1, delayMs: 10000, preAction: 'kill_ae' },
  'AERENDER_NO_OUTPUT':        { maxRetries: 1, delayMs: 10000, preAction: 'kill_ae' },
  'AERENDER_OUTPUT_TOO_SMALL': { maxRetries: 1, delayMs: 10000, preAction: 'kill_ae' },
  'AERENDER_SPAWN_ERROR':      { maxRetries: 1, delayMs: 10000, preAction: null },
  'FFMPEG_FAIL':               { maxRetries: 2, delayMs: 5000,  preAction: null },
  'FFMPEG_SPAWN_ERROR':        { maxRetries: 1, delayMs: 5000,  preAction: null },
};

const HARD_ABORTS = [
  'TEMPLATE_NOT_FOUND', 'TEMPLATE_CONFIG_INVALID',
  'AE_PREFS_REBUILD_FAILED', 'FFMPEG_TIMEOUT', 'AERENDER_TIMEOUT',
];

function getFailureCode(errMessage) {
  const match = errMessage.match(/^([A-Z_]+):/);
  return match ? match[1] : 'UNKNOWN';
}

async function decideRetry(job, errorMessage) {
  const code = getFailureCode(errorMessage);
  if (HARD_ABORTS.some(h => errorMessage.startsWith(h))) return { retry: false, reason: 'HARD_ABORT' };
  const config = RETRY_MAP[code];
  if (!config) return { retry: false, reason: `NO_RETRY_RULE_FOR_${code}` };
  if ((job.retryCount || 0) >= config.maxRetries) return { retry: false, reason: 'MAX_RETRIES_EXCEEDED' };
  const sameCount = (job.failureHistory || []).filter(f => f === code).length;
  if (sameCount >= 2) return { retry: false, reason: 'REPEATED_SAME_FAILURE' };

  if (config.preAction === 'kill_ae') await killAllAEProcesses();
  else if (config.preAction === 'rebuild_prefs') {
    try { await rebuildAEPrefs(); }
    catch (e) { return { retry: false, reason: `PREFS_REBUILD_FAILED: ${e.message}` }; }
  }
  return { retry: true, delayMs: config.delayMs, code };
}

// ── Render one chunk (one full AE inject + render + FFmpeg pass) ──

async function renderChunk(job, chunkIndex, inputData, templateConfig, jobLog) {
  const jobDir     = path.join(JOBS_DIR, job.jobId);
  const chunkDir   = path.join(jobDir, `chunk_${chunkIndex}`);
  if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });

  // Clone job with this chunk's inputData for AE injection
  const chunkJob = { ...job, inputData, jobDir: chunkDir };

  jobLog(`CHUNK_START`, { chunkIndex, keys: Object.keys(inputData) });

  // Stage 1: AE injection
  const { tempAepPath } = await runAEInjection(chunkJob, templateConfig, chunkDir, jobLog);

  // Stage 2: aerender
  const { aviPath } = await runAERender(chunkJob, tempAepPath, chunkDir, jobLog, templateConfig);

  // Stage 3: FFmpeg — name chunk MP4 as {jobId}_part{n}.mp4
  const fileName = `${job.jobId}_part${chunkIndex}.mp4`;
  const { mp4Path, outputUrl } = await runFFmpeg(aviPath, job.jobId, jobLog, fileName);

  jobLog(`CHUNK_COMPLETE`, { chunkIndex, mp4Path });
  return mp4Path;
}

// ── Main job executor ─────────────────────────────────────────────

async function executeJob(job) {
  const jobLog = makeJobLogger(job.jobId);
  const jobDir = path.join(JOBS_DIR, job.jobId);
  if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

  jobLog('JOB_START', { template: job.template, retryCount: job.retryCount, chunks: job.chunks?.length || 1 });

  // Load template config
  const templateDir  = path.join(TEMPLATES_DIR, job.template);
  const configPath   = path.join(templateDir, 'config.json');

  if (!fs.existsSync(configPath)) {
    markJobFailed(job.jobId, 'TEMPLATE_CONFIG_INVALID', `No config.json in ${templateDir}`);
    return;
  }

  let templateConfig;
  try {
    templateConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    markJobFailed(job.jobId, 'TEMPLATE_CONFIG_INVALID', e.message);
    return;
  }

  const aepPath = path.join(templateDir, templateConfig.aepFile);
  if (!fs.existsSync(aepPath)) {
    markJobFailed(job.jobId, 'TEMPLATE_NOT_FOUND', `AEP not found: ${aepPath}`);
    return;
  }

  markJobProcessing(job.jobId);

  // ── Determine chunks ──────────────────────────────────────────
  // job.chunks = array of inputData objects (multi-chunk)
  // job.inputData = single inputData object (single chunk, backwards compat)
  const chunks = job.chunks || [job.inputData];

  try {
    if (chunks.length === 1) {
      // ── Single chunk — original flow ─────────────────────────
      const mp4Path = await renderChunk(job, 0, chunks[0], templateConfig, jobLog);
      // Rename from _part0.mp4 to {jobId}.mp4
      const finalPath = path.join(path.dirname(mp4Path), '..', '..', 'outputs', `${job.jobId}.mp4`);
      // mp4Path is already in outputs/ as {jobId}_part0.mp4 — rename it
      const outputsDir = path.resolve(__dirname, '..', 'outputs');
      const part0 = path.join(outputsDir, `${job.jobId}_part0.mp4`);
      const final  = path.join(outputsDir, `${job.jobId}.mp4`);
      if (fs.existsSync(part0)) fs.renameSync(part0, final);

      markJobDone(job.jobId, `/outputs/${job.jobId}.mp4`);
      try {
  await cleanJobDir(jobDir);
} catch (cleanupErr) {
  console.log('Non-fatal cleanup error ignored.');
}
      jobLog('JOB_COMPLETE', { outputUrl: `/outputs/${job.jobId}.mp4` });

    } else {
      // ── Multi-chunk — render each, then stitch ────────────────
      const mp4Parts = [];
      for (let i = 0; i < chunks.length; i++) {
        jobLog('MULTI_CHUNK_PROGRESS', { chunk: i + 1, total: chunks.length });
        writeJobFile(job.jobId, 'lock', {
          ...job,
          currentChunk: i + 1,
          totalChunks: chunks.length,
        });
        const mp4Path = await renderChunk(job, i, chunks[i], templateConfig, jobLog);
        mp4Parts.push(mp4Path);
      }

      // Stitch all parts into final
      jobLog('STITCH_START', { parts: mp4Parts.length });
      const { outputUrl } = await stitchMP4s(mp4Parts, job.jobId, jobLog);

      markJobDone(job.jobId, outputUrl);
      cleanJobDir(job.jobId);
      jobLog('JOB_COMPLETE', { outputUrl });
    }

  } catch (err) {
    jobLog('JOB_FAIL', { error: err.message });
    const decision = await decideRetry(job, err.message);
    if (decision.retry) {
      jobLog('RETRY_SCHEDULED', { delayMs: decision.delayMs });
      scheduleRetry(job.jobId, decision.delayMs);
    } else {
      jobLog('JOB_ABORT', { reason: decision.reason });
      markJobFailed(job.jobId, getFailureCode(err.message), err.message);
      cleanJobDir(job.jobId);
    }
  }
}

// ── Worker loop ───────────────────────────────────────────────────

let workerRunning = false;

async function tick() {
  if (workerRunning) return;

  const queueDir = path.resolve(__dirname, '..', 'queue');
  const retryFiles = fs.readdirSync(queueDir).filter(f => f.endsWith('.retry_scheduled'));
  for (const file of retryFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(queueDir, file), 'utf8'));
      if (Date.now() >= data.retryAt) {
        writeJobFile(data.jobId, 'pending', data);
      }
    } catch {}
  }

  const job = getOldestPendingJob();
  if (!job) return;

  if (!acquireLock(job.jobId)) return;

  workerRunning = true;
  try {
    await executeJob(job);
  } catch (err) {
    console.error('[worker] UNHANDLED ERROR:', err);
    try { markJobFailed(job.jobId, 'WORKER_UNHANDLED_ERROR', err.message); releaseLock(); cleanJobDir(job.jobId); } catch {}
  } finally {
    workerRunning = false;
  }
}

function startWorkerLoop() {
  console.log('[worker] Worker loop started — polling every 5s');
  setInterval(tick, 5000);
  tick();
}

module.exports = { startWorkerLoop };