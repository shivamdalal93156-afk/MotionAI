const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REQUIRED_DIRS = [
  'jobs', 'queue', 'outputs', 'logs', 'temp',
  path.join('logs', 'jobs')
];

function checkDirs() {
  for (const dir of REQUIRED_DIRS) {
    const full = path.resolve(__dirname, '..', dir);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full, { recursive: true });
    }
    // verify writable
    const probe = path.join(full, '.write_probe');
    fs.writeFileSync(probe, '1');
    fs.unlinkSync(probe);
  }
  return { pass: true, check: 'dirs' };
}

function checkAE() {
  const aePath = process.env.AE_PATH;
  if (!aePath) throw new Error('AE_PATH not set in .env');
  if (!fs.existsSync(aePath)) {
    throw new Error(`AfterFX.com not found at: ${aePath}`);
  }
  return { pass: true, check: 'ae_binary', path: aePath };
}

function checkAERender() {
  const aerenderPath = process.env.AERENDER_PATH;
  if (!aerenderPath) throw new Error('AERENDER_PATH not set in .env');
  if (!fs.existsSync(aerenderPath)) {
    throw new Error(`aerender.exe not found at: ${aerenderPath}`);
  }
  return { pass: true, check: 'aerender_binary', path: aerenderPath };
}

function checkFFmpeg() {
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  try {
    execSync(`"${ffmpegPath}" -version`, { stdio: 'pipe', timeout: 5000 });
    return { pass: true, check: 'ffmpeg' };
  } catch {
    throw new Error(`FFmpeg not found or not executable at: ${ffmpegPath}`);
  }
}

function checkDisk() {
  // Windows: use wmic. Falls back gracefully if unavailable.
  try {
    const result = execSync(
      'wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace /value',
      { stdio: 'pipe', timeout: 5000 }
    ).toString();
    const match = result.match(/FreeSpace=(\d+)/);
    if (match) {
      const freeGB = parseInt(match[1]) / (1024 ** 3);
      const critGB = parseFloat(process.env.DISK_CRITICAL_GB || '5');
      if (freeGB < critGB) {
        throw new Error(`Disk critically low: ${freeGB.toFixed(1)}GB free (min: ${critGB}GB)`);
      }
      return { pass: true, check: 'disk', freeGB: parseFloat(freeGB.toFixed(1)) };
    }
  } catch (e) {
    if (e.message.includes('Disk critically')) throw e;
    // wmic unavailable — skip disk check, log warning
    return { pass: true, check: 'disk', freeGB: null, warning: 'wmic unavailable' };
  }
}

function checkZombieProcesses() {
  try {
    const result = execSync(
      'tasklist /FI "IMAGENAME eq AfterFX.com" /FO CSV /NH',
      { stdio: 'pipe', timeout: 5000 }
    ).toString();
    const zombies = result.split('\n').filter(l => l.includes('AfterFX.com'));
    if (zombies.length > 0) {
      console.warn(`[preflight] WARNING: ${zombies.length} AfterFX.com process(es) already running. Killing...`);
      execSync('taskkill /F /IM AfterFX.com /T', { stdio: 'pipe' });
    }

    const aerenderResult = execSync(
      'tasklist /FI "IMAGENAME eq aerender.exe" /FO CSV /NH',
      { stdio: 'pipe', timeout: 5000 }
    ).toString();
    const aerenderZombies = aerenderResult.split('\n').filter(l => l.includes('aerender.exe'));
    if (aerenderZombies.length > 0) {
      console.warn(`[preflight] WARNING: ${aerenderZombies.length} aerender.exe process(es) already running. Killing...`);
      execSync('taskkill /F /IM aerender.exe /T', { stdio: 'pipe' });
    }
    return { pass: true, check: 'zombies', killed: zombies.length + aerenderZombies.length };
  } catch (e) {
    if (e.message.includes('taskkill') || e.message.includes('tasklist')) {
      return { pass: true, check: 'zombies', warning: 'tasklist unavailable' };
    }
    throw e;
  }
}

function checkStaleLocks() {
  const queueDir = path.resolve(__dirname, '..', 'queue');
  const lockFile = path.join(queueDir, 'PROCESSING.lock');
  if (fs.existsSync(lockFile)) {
    const stat = fs.statSync(lockFile);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > 30 * 60 * 1000) { // older than 30 minutes
      console.warn('[preflight] Stale PROCESSING.lock found — removing');
      fs.unlinkSync(lockFile);
      return { pass: true, check: 'stale_locks', action: 'removed_stale_lock', ageMs };
    }
    // Lock is fresh — a job may be genuinely mid-run
    return { pass: true, check: 'stale_locks', note: 'fresh lock found — job may be running' };
  }
  return { pass: true, check: 'stale_locks' };
}

async function runPreflight() {
  const results = [];
  const checks = [
    checkDirs,
    checkAE,
    checkAERender,
    checkFFmpeg,
    checkDisk,
    checkZombieProcesses,
    checkStaleLocks,
  ];

  for (const check of checks) {
    try {
      const result = check();
      results.push(result);
      console.log(`[preflight] ✓ ${result.check}${result.warning ? ' (warn: ' + result.warning + ')' : ''}`);
    } catch (err) {
      console.error(`[preflight] ✗ FAILED: ${err.message}`);
      results.push({ pass: false, check: err.message });
      // All preflight failures are fatal — do not start accepting requests
      throw err;
    }
  }

  return results;
}

module.exports = { runPreflight };