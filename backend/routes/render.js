const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { createJob } = require('../services/jobQueue');

const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');
// GET /api/render/templates — list all available templates with their fields
router.get('/templates', (req, res) => {
  try {
    const dirs = fs.readdirSync(TEMPLATES_DIR).filter(f =>
      fs.statSync(path.join(TEMPLATES_DIR, f)).isDirectory()
    );

    const templates = dirs.map(name => {
      const configPath = path.join(TEMPLATES_DIR, name, 'config.json');
      if (!fs.existsSync(configPath)) return null;
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return {
          id: name,
          compName: config.compName,
          textFields: (config.textLayers || []).map(l => ({
  key:     l.key,
  label:   l.label || l.layerName,
  absIn:   l.absIn,
  absOut:  l.absOut,
  compName: l.compName,
  layerName: l.layerName,
})),
imageFields: (config.imageLayers || []).map(l => ({
  key:       l.key,
  label:     l.label || l.compName || l.key,
  absIn:     l.absIn,
  absOut:    l.absOut,
  compName:  l.compName,
  layerName: l.layerName,
  type:      l.type,
  ratio:     l.ratio,
})),
          fps: config.fps,
          duration: config.duration,
          sceneMap: config.sceneMap || {},}
      } catch { return null; }
    }).filter(Boolean);

    res.json({ templates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router.post('/start', (req, res) => {
  // Guard against empty body
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      error: 'INVALID_BODY',
      message: 'Request body must be JSON. Set Content-Type: application/json'
    });
  }

  const { template, inputData , voiceData } = req.body;

  if (!template || typeof template !== 'string') {
    return res.status(400).json({ error: 'MISSING_TEMPLATE', message: '`template` field is required' });
  }
  if (!inputData || typeof inputData !== 'object') {
    return res.status(400).json({ error: 'MISSING_INPUT', message: '`inputData` object is required' });
  }

  const templateDir = path.join(TEMPLATES_DIR, template);
  if (!fs.existsSync(templateDir) || !fs.statSync(templateDir).isDirectory()) {
    const available = fs.readdirSync(TEMPLATES_DIR)
      .filter(f => fs.statSync(path.join(TEMPLATES_DIR, f)).isDirectory());
    return res.status(400).json({
      error: 'TEMPLATE_NOT_FOUND',
      message: `Template "${template}" not found.`,
      available
    });
  }

  const configPath = path.join(templateDir, 'config.json');
  if (!fs.existsSync(configPath)) {
    return res.status(400).json({
      error: 'TEMPLATE_CONFIG_MISSING',
      message: `Template "${template}" has no config.json`
    });
  }
  // Support both single inputData and multi-chunk array
  let chunks = null;
  if (req.body.chunks && Array.isArray(req.body.chunks)) {
    if (req.body.chunks.length < 2 || req.body.chunks.length > 10) {
      return res.status(400).json({ error: 'INVALID_CHUNKS', message: 'chunks must be array of 2-10 objects' });
    }
    chunks = req.body.chunks;
  }

  const job = createJob(template, inputData, chunks , voiceData||null);

  // const job = createJob(template, inputData);

  return res.status(202).json({
    jobId: job.jobId,
    status: 'pending',
    message: 'Job queued. Poll /api/jobs/:jobId for status.',
    estimatedMinutes: '4–8'
  });
});

module.exports = router;