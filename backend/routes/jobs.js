const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { readJobFile } = require('../services/jobQueue');

const LOG_DIR = path.resolve(__dirname, '..', 'logs', 'jobs');

router.get('/:id', (req, res) => {
  const job = readJobFile(req.params.id);
  if (!job) return res.status(404).json({ error: 'JOB_NOT_FOUND', jobId: req.params.id });

  // Read last few events from job log to show progress
  let lastEvent  = '';
  let lastFrame  = 0;
  let totalFrames = 0;
  let stageName  = '';

  try {
    const logPath = path.join(LOG_DIR, `${req.params.id}.jsonl`);
    if (fs.existsSync(logPath)) {
      const lines = fs.readFileSync(logPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .slice(-30); // last 30 events

      for (const line of lines) {
        try {
          const e = JSON.parse(line);
          lastEvent = e.event || lastEvent;
          if (e.event === 'AERENDER_PROGRESS') {
            lastFrame   = e.frame   || lastFrame;
            totalFrames = e.totalFrames || totalFrames;
          }
          if (e.event === 'STAGE') {
            stageName = e.stage || stageName;
          }
        } catch {}
      }
    }
  } catch {}

  const { jobDir, inputData: _, ...safe } = job;

  return res.json({
    ...safe,
    lastEvent,
    lastFrame,
    totalFrames,
    stageName,
  });
});

module.exports = router;