/**
 * POST /api/voice/process
 * 
 * Accepts: multipart form with audio file
 * Returns: { words, adjustedTimings, warnings, audioDuration }
 * 
 * Also handles: GET /api/voice/status (check if whisper is installed)
 */

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { spawnSync } = require('child_process');
const { processVoiceSync } = require('../services/voiceSync');

const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');

// Multer — audio files up to 100MB
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname) || '.mp3';
    cb(null, `${Date.now()}_audio${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.webm', '.mp4'];
    const ext     = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported audio format: ${ext}`));
  },
});

// ── GET /api/voice/status ─────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  // Check if whisper is installed
  const result = spawnSync('py', ['-c', 'import whisper; print(whisper.__version__)'], {
    encoding: 'utf8', timeout: 10000,
  });
  const installed = result.status === 0;
  res.json({
    whisperInstalled: installed,
    version: installed ? result.stdout.trim() : null,
    message: installed
      ? `Whisper ${result.stdout.trim()} ready`
      : 'Whisper not installed. Run: pip install openai-whisper',
  });
});

// ── POST /api/voice/process ───────────────────────────────────────────────────
router.post('/process', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'NO_AUDIO', message: 'No audio file uploaded' });
  }

  // templateConfig comes as JSON string in form body
  let templateConfig;
  try {
    templateConfig = JSON.parse(req.body.templateConfig || '{}');
  } catch {
    return res.status(400).json({ error: 'INVALID_CONFIG', message: 'Invalid templateConfig JSON' });
  }

  const audioPath = req.file.path;

  try {
    const jobLog = (event, data) => console.log(`[voice] ${event}`, data || '');

    const result = await processVoiceSync(audioPath, templateConfig, jobLog);

    res.json({
      success:         true,
      whisperLanguage: result.whisperLanguage,
      audioDuration:   result.audioDuration,
      wordCount:       result.matchedWords.length,
      adjustedTimings: result.adjustedTimings,
      warnings:        result.warnings,
      audioPath:       audioPath, // frontend passes this back in render job
      // For display/debugging
      sceneResults:    result.sceneResults.map(s => ({
        scene:       s.scene,
        speedRatio:  s.speedRatio,
        outOfRange:  s.outOfRange,
        warning:     s.warning,
      })),
    });
  } catch (err) {
    // Clean up audio on failure
    try { fs.unlinkSync(audioPath); } catch {}
    res.status(500).json({ error: 'VOICE_SYNC_FAILED', message: err.message });
  }
});

module.exports = router;
