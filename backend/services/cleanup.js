const fs = require('fs');
const path = require('path');

const JOBS_DIR    = path.resolve(__dirname, '..', 'jobs');
const OUTPUTS_DIR = path.resolve(__dirname, '..', 'outputs');
const TEMP_DIR    = path.resolve(__dirname, '..', 'temp');

// Delete a job's entire working directory
function cleanJobDir(jobId) {
  const jobDir = path.join(JOBS_DIR, jobId);
  if (fs.existsSync(jobDir)) {
    fs.rmSync(jobDir, { recursive: true, force: true });
    console.log(`[cleanup] Deleted job dir: ${jobId}`);
  }
}
function purgeOldUploads(maxAgeHours = 2) {
  const uploadsDir = path.resolve(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) return 0;
  let count = 0;
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  for (const file of fs.readdirSync(uploadsDir)) {
    const full = path.join(uploadsDir, file);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full);
        count++;
      }
    } catch {}
  }
  if (count > 0) console.log(`[cleanup] Purged ${count} old uploads`);
  return count;
}

// Find and remove orphaned AVIs (render completed but FFmpeg never ran)
function flushOrphanAVIs() {
  let count = 0;
  if (!fs.existsSync(OUTPUTS_DIR)) return count;

  const files = fs.readdirSync(OUTPUTS_DIR);
  for (const file of files) {
    if (!file.endsWith('.avi')) continue;
    const base = file.replace('.avi', '');
    const mp4  = path.join(OUTPUTS_DIR, `${base}.mp4`);
    if (!fs.existsSync(mp4)) {
      fs.unlinkSync(path.join(OUTPUTS_DIR, file));
      console.log(`[cleanup] Orphan AVI deleted: ${file}`);
      count++;
    }
  }
  return count;
}

// Delete outputs older than maxAgeHours
function purgeOldOutputs(maxAgeHours = 24) {
  let count = 0;
  if (!fs.existsSync(OUTPUTS_DIR)) return count;

  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const files = fs.readdirSync(OUTPUTS_DIR);
  for (const file of files) {
    const full = path.join(OUTPUTS_DIR, file);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
        count++;
      }
    } catch { /* file may have been deleted already */ }
  }
  if (count > 0) console.log(`[cleanup] Purged ${count} outputs older than ${maxAgeHours}h`);
  return count;
}

// Delete temp files older than maxAgeHours (catches anything that leaked)
function purgeStaleTempFiles(maxAgeHours = 2) {
  let count = 0;
  for (const dir of [TEMP_DIR, JOBS_DIR]) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      try {
        const stat = fs.statSync(full);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > maxAgeHours * 60 * 60 * 1000) {
          if (entry.isDirectory()) {
            fs.rmSync(full, { recursive: true, force: true });
          } else {
            fs.unlinkSync(full);
          }
          count++;
        }
      } catch { /* skip locked files */ }
    }
  }
  if (count > 0) console.log(`[cleanup] Purged ${count} stale temp entries`);
  return count;
}

// Full scheduled cleanup — runs every hour
function runScheduledCleanup() {
  console.log('[cleanup] Scheduled run started');
  const orphans    = flushOrphanAVIs();
  const oldOutputs = purgeOldOutputs(24);
  const staleTemps = purgeStaleTempFiles(2);
  const oldUploads = purgeOldUploads(2);
  console.log(`[cleanup] Done — orphans: ${orphans}, old outputs: ${oldOutputs}, stale temps: ${staleTemps}, old uploads: ${oldUploads}`);
}
module.exports = {
  cleanJobDir,
  flushOrphanAVIs,
  purgeOldOutputs,
  purgeStaleTempFiles,
  runScheduledCleanup,
  purgeOldUploads,
};