const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const QUEUE_DIR = path.resolve(__dirname, '..', 'queue');
const JOBS_DIR  = path.resolve(__dirname, '..', 'jobs');
const LOCK_FILE = path.join(QUEUE_DIR, 'PROCESSING.lock');

// ── Job file schema ──────────────────────────────────────────────
// queue/{jobId}.pending  → job is waiting
// queue/{jobId}.lock     → job is being processed
// queue/{jobId}.done     → job completed successfully
// queue/{jobId}.error    → job failed
// jobs/{jobId}/          → working directory (deleted after completion)

function writeJobFile(jobId, status, data = {}) {
  // Remove any existing status files for this job first
  for (const ext of ['pending', 'lock', 'done', 'error', 'retry_scheduled']) {
    const f = path.join(QUEUE_DIR, `${jobId}.${ext}`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  const payload = {
    ...data,        // spread data FIRST
    jobId,          // then overwrite with correct values
    status,         // status is always the new one passed in
    updatedAt: Date.now(),
  };
  fs.writeFileSync(
    path.join(QUEUE_DIR, `${jobId}.${status}`),
    JSON.stringify(payload, null, 2)
  );
  return payload;
}

function readJobFile(jobId) {
  for (const ext of ['done', 'error', 'lock', 'pending', 'retry_scheduled']) {
    const f = path.join(QUEUE_DIR, `${jobId}.${ext}`);
    if (fs.existsSync(f)) {
      try {
        return JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch {
        return { jobId, status: ext, error: 'corrupt job file' };
      }
    }
  }
  return null;
}

function createJob(template, inputData , chunks = null,voiceData) {
  const jobId = uuidv4();
  const jobDir = path.join(JOBS_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const job = writeJobFile(jobId, 'pending', {
    template,
    inputData,
    chunks,
    createdAt: Date.now(),
    retryCount: 0,
    failureHistory: [],
    jobDir,
    adjustedTimings: voiceData?.adjustedTimings || {},
    audioPath:       voiceData?.audioPath       || null,
    hasVoice:        !!voiceData?.audioPath,
  });

  console.log(`[queue] Job created: ${jobId} | template: ${template}| chunks: ${chunks ? chunks.length : 1}`);
  return job;
}

function getOldestPendingJob() {
  const files = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.pending'));
  if (files.length === 0) return null;

  // Sort by mtime — oldest first
  const sorted = files
    .map(f => ({ file: f, mtime: fs.statSync(path.join(QUEUE_DIR, f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime);

  const jobId = sorted[0].file.replace('.pending', '');
  return readJobFile(jobId);
}

function isProcessing() {
  if (!fs.existsSync(LOCK_FILE)) return false;
  try {
    const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    const ageMs = Date.now() - lock.startedAt;
    // If lock is older than timeout + buffer (35 min), treat as stale
    const timeoutMs = parseInt(process.env.JOB_TIMEOUT_MS || '1800000');
    return ageMs < timeoutMs + 5 * 60 * 1000;
  } catch {
    return false;
  }
}

function acquireLock(jobId) {
  if (isProcessing()) return false;
  fs.writeFileSync(LOCK_FILE, JSON.stringify({
    jobId,
    startedAt: Date.now(),
    pid: process.pid
  }));
  return true;
}

function releaseLock() {
  if (fs.existsSync(LOCK_FILE)) {
    fs.unlinkSync(LOCK_FILE);
  }
}

function markJobProcessing(jobId) {
  const existing = readJobFile(jobId);
  return writeJobFile(jobId, 'lock', existing);
}

function markJobDone(jobId, outputUrl) {
  const existing = readJobFile(jobId);
  releaseLock();
  return writeJobFile(jobId, 'done', {
    ...existing,
    outputUrl,
    completedAt: Date.now(),
  });
}

function markJobFailed(jobId, reason, errorDetail = '') {
  const existing = readJobFile(jobId) || {};
  releaseLock();
  return writeJobFile(jobId, 'error', {
    ...existing,
    errorReason: reason,
    errorDetail,
    failedAt: Date.now(),
    failureHistory: [...(existing.failureHistory || []), reason],
  });
}

function scheduleRetry(jobId, delayMs) {
  const existing = readJobFile(jobId) || {};
  releaseLock();
  return writeJobFile(jobId, 'retry_scheduled', {
    ...existing,
    retryAt: Date.now() + delayMs,
    retryCount: (existing.retryCount || 0) + 1,
  });
}

// Called on startup to recover jobs interrupted by a crash/restart
function recoverInterruptedJobs() {
  const files = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.lock'));
  for (const file of files) {
    const jobId = file.replace('.lock', '');
    console.warn(`[queue] Recovering interrupted job: ${jobId}`);
    const existing = readJobFile(jobId) || {};
    // Re-queue it as pending — it will be retried once
    writeJobFile(jobId, 'pending', {
      ...existing,
      retryCount: (existing.retryCount || 0) + 1,
      recoveredAt: Date.now(),
      note: 'recovered after server restart',
    });
  }
  if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  return files.length;
}

function getQueueStats() {
  const files = fs.readdirSync(QUEUE_DIR);
  return {
    pending:         files.filter(f => f.endsWith('.pending')).length,
    processing:      files.filter(f => f.endsWith('.lock')).length,
    done:            files.filter(f => f.endsWith('.done')).length,
    error:           files.filter(f => f.endsWith('.error')).length,
    retry_scheduled: files.filter(f => f.endsWith('.retry_scheduled')).length,
  };
}

module.exports = {
  createJob,
  readJobFile,
  writeJobFile,
  getOldestPendingJob,
  isProcessing,
  acquireLock,
  releaseLock,
  markJobProcessing,
  markJobDone,
  markJobFailed,
  scheduleRetry,
  recoverInterruptedJobs,
  getQueueStats,
};