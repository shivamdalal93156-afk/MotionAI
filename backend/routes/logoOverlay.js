'use strict';

/**
 * backend/routes/logoOverlay.js
 * POST /api/logo-overlay
 * 
 * Body (multipart/form-data):
 *   logo     — PNG file
 *   videoUrl — path or URL of the rendered MP4 (server path)
 *   jobId    — to locate the output file
 *   x        — 0-100 (percent from left)
 *   y        — 0-100 (percent from top)
 *   scale    — 0-100 (logo size as % of video width)
 *   startSec — logo appears at this second
 *   endSec   — logo disappears at this second (-1 = until end)
 */

const express  = require('express');
const router   = express.Router();
const fs       = require('fs');
const path     = require('path');
const { spawn } = require('child_process');
const multer   = require('multer');

const OUTPUTS_DIR = path.resolve(__dirname, '..', 'outputs');
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB logo max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') cb(null, true);
    else cb(new Error('Logo must be PNG or JPG'));
  }
});

router.post('/', upload.single('logo'), async (req, res) => {
  const { jobId, x, y, scale, startSec, endSec } = req.body;

  if (!req.file) return res.status(400).json({ error: 'No logo file uploaded' });
  if (!jobId)   return res.status(400).json({ error: 'jobId required' });

  // Find the rendered output file
  const inputPath = path.join(OUTPUTS_DIR, `${jobId}.mp4`);
  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: 'Rendered video not found' });
  }

  const logoPath   = req.file.path;
  const outputName = `${jobId}_logo.mp4`;
  const outputPath = path.join(OUTPUTS_DIR, outputName);

  // Parse params with safe defaults
  const px    = Math.max(0, Math.min(100, parseFloat(x)     || 5));
  const py    = Math.max(0, Math.min(100, parseFloat(y)     || 5));
  const sc    = Math.max(1, Math.min(80,  parseFloat(scale) || 15));
  const tStart = Math.max(0, parseFloat(startSec) || 0);
  const tEnd   = parseFloat(endSec);
  const useEnd = !isNaN(tEnd) && tEnd > 0;

  // FFmpeg overlay filter
  // overlay_w = video_width * (scale/100)
  // x position = (video_width - overlay_w) * (px/100)  — handles edge correctly
  // y position = (video_height - overlay_h) * (py/100)
  const scaleFilter  = `[1:v]scale=iw*${(sc/100).toFixed(4)}:-1[logo]`;
  const posX = `(W-w)*${(px/100).toFixed(4)}`;
  const posY = `(H-h)*${(py/100).toFixed(4)}`;

  let enableExpr;
  if (useEnd) {
    enableExpr = `enable='between(t,${tStart},${tEnd})'`;
  } else {
    enableExpr = `enable='gte(t,${tStart})'`;
  }

  const overlayFilter = `[video][logo]overlay=${posX}:${posY}:${enableExpr}`;
  const filterComplex = `${scaleFilter};[0:v]copy[video];${overlayFilter}[out]`;

  const ffmpegArgs = [
    '-i', inputPath,
    '-i', logoPath,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-map', '0:a?',           // keep audio if present
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '18',
    '-c:a', 'copy',
    '-y',
    outputPath
  ];

  console.log(`[logo-overlay] Starting FFmpeg for job ${jobId}`);

  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  ffmpeg.stderr.on('data', d => { stderr += d.toString(); });

  ffmpeg.on('close', code => {
    // Clean up logo temp file
    try { fs.unlinkSync(logoPath); } catch {}

    if (code !== 0) {
      console.error(`[logo-overlay] FFmpeg failed:`, stderr.slice(-500));
      return res.status(500).json({ error: 'Logo overlay failed', detail: stderr.slice(-300) });
    }

    console.log(`[logo-overlay] Done: ${outputName}`);
    res.json({
      success:   true,
      outputUrl: `/outputs/${outputName}`,
      outputJobId: jobId + '_logo',  // ← add this
      filename:  outputName
    });
  });

  ffmpeg.on('error', err => {
    try { fs.unlinkSync(logoPath); } catch {}
    res.status(500).json({ error: 'FFmpeg not found or failed to start', detail: err.message });
  });
});

module.exports = router;