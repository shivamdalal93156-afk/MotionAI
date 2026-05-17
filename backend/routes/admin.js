const express = require('express');
const router  = express.Router();
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { releaseLock, getQueueStats, readJobFile } = require('../services/jobQueue');
const { flushOrphanAVIs, runScheduledCleanup } = require('../services/cleanup');
const { adminRoutes: rlAdmin } = require('../middleware/rateLimiter');

function requireToken(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  next();
}

router.use(requireToken);

// GET /admin/stats
router.get('/stats', (req, res) => {
  const stats = getQueueStats();
  
  // Read recent jobs
  const queueDir = path.resolve(__dirname, '..', 'queue');
  const files = fs.readdirSync(queueDir).filter(f => !f.includes('PROCESSING'));
  
  const jobs = files.map(f => {
    const jobId = f.replace(/\.(pending|lock|done|error|retry_scheduled)$/, '');
    const status = f.split('.').pop();
    try {
      return readJobFile(jobId);
    } catch { return { jobId, status }; }
  }).filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 20);

  // Disk info
  let diskInfo = null;
  try {
    const result = execSync('powershell -command "Get-PSDrive C | Select-Object Used,Free"', 
      { stdio: 'pipe', timeout: 5000 }).toString();
    const lines = result.trim().split('\n').filter(l => l.trim());
    const nums = lines[lines.length-1].trim().split(/\s+/);
    if (nums.length >= 2) {
      diskInfo = {
        usedGB: (parseInt(nums[0]) / (1024**3)).toFixed(1),
        freeGB: (parseInt(nums[1]) / (1024**3)).toFixed(1),
      };
    }
  } catch {}

  res.json({ stats, jobs, diskInfo, timestamp: Date.now() });
});

// POST /admin/action
router.post('/action', (req, res) => {
  const { action } = req.body;
  try {
    switch (action) {
      case 'kill_ae':
        try { execSync('taskkill /F /IM AfterFX.com /T', { stdio: 'pipe' }); } catch {}
        try { execSync('taskkill /F /IM aerender.exe /T', { stdio: 'pipe' }); } catch {}
        releaseLock();
        return res.json({ ok: true, message: 'AE processes killed, lock released' });
      case 'flush_orphans':
        const count = flushOrphanAVIs();
        return res.json({ ok: true, message: `Deleted ${count} orphan files` });
      case 'cleanup':
        runScheduledCleanup();
        return res.json({ ok: true, message: 'Cleanup complete' });
      case 'release_lock':
        releaseLock();
        return res.json({ ok: true, message: 'Lock released' });
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
// GET /admin/limits — see all IP render counts today
router.get('/limits', (req, res) => {
  // Reuse the rateLimiter's internal store via a fake req/res
  const fakeReq = { query: { key: process.env.ADMIN_KEY || 'aootra-admin-2026', action: 'list' } };
  const fakeRes = { json: (data) => res.json(data), status: () => fakeRes };
  rlAdmin(fakeReq, fakeRes);
});

// POST /admin/limits — reset, block an IP
// body: { action: 'reset'|'block'|'reset-all', ip: 'x.x.x.x' }
router.post('/limits', (req, res) => {
  const { action, ip } = req.body;
  const fakeReq = { query: { key: process.env.ADMIN_KEY || 'aootra-admin-2026', action, ip } };
  const fakeRes = { json: (data) => res.json(data), status: () => fakeRes };
  rlAdmin(fakeReq, fakeRes);
});
module.exports = router;