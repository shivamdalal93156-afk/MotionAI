const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { renderVideo } = require('../services/aeRender');
const { createJob } = require('../services/jobStore');
const { validateTextData, getEmptyTextData, TEMPLATE_MANIFEST } = require('../services/templateManifest');

/**
 * GET /api/render/manifest
 * Returns the full template manifest so the frontend
 * can build the form dynamically
 */
router.get('/manifest', (req, res) => {
  res.json({
    success: true,
    manifest: TEMPLATE_MANIFEST,
    emptyData: getEmptyTextData()
  });
});

/**
 * POST /api/render/start
 * Body: { textData: { "WORD_1": "...", "placeholder 1": "...", ... } }
 * Returns: { jobId }
 */
router.post('/start', (req, res) => {
  const { textData } = req.body;

  if (!textData || typeof textData !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'textData object is required in request body'
    });
  }

  // Validate all layers present and word limits respected
  const validation = validateTextData(textData);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      missing: validation.missing,
      tooLong: validation.tooLong
    });
  }

  // Create job
  const jobId = uuidv4();
  createJob(jobId);

  // Fire render async — don't await, respond immediately with jobId
  renderVideo(jobId, textData).catch(err => {
    console.error(`[Job ${jobId}] Render error:`, err.message);
  });

  res.json({
    success: true,
    jobId,
    message: 'Render job started. Poll /api/jobs/:jobId for status.'
  });
});

module.exports = router;
