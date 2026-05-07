const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { getQueueStats } = require('../services/jobQueue');

router.get('/', (req, res) => {
  const healthFile = path.resolve(__dirname, '..', 'logs', 'health.json');
  let health = {};
  if (fs.existsSync(healthFile)) {
    try { health = JSON.parse(fs.readFileSync(healthFile, 'utf8')); } catch {}
  }

  const stats = getQueueStats();
  const status = health.systemHalted ? 503 : 200;

  return res.status(status).json({
    status: status === 200 ? 'ok' : 'halted',
    queue: stats,
    health,
    timestamp: Date.now()
  });
});

module.exports = router;