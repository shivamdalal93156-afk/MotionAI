const express = require('express');
const router  = express.Router();
const { readJobFile } = require('../services/jobQueue');

router.get('/:id', (req, res) => {
  const job = readJobFile(req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'JOB_NOT_FOUND', jobId: req.params.id });
  }

  // Strip internal fields from client response
  const { jobDir, inputData: _, ...safe } = job;

  return res.json(safe);
});

module.exports = router;