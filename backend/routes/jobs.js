const express = require('express');
const router = express.Router();
const { getJob, getAllJobs } = require('../services/jobStore');

/**
 * GET /api/jobs
 * Returns all jobs (most recent first)
 */
router.get('/', (req, res) => {
  res.json({ success: true, jobs: getAllJobs() });
});

/**
 * GET /api/jobs/:jobId
 * Returns status of a specific job
 * Frontend polls this every 3 seconds
 */
router.get('/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  res.json({ success: true, job });
});

module.exports = router;
