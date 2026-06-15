const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { createAutomaticImageMask } = require('../services/maskWorker');

const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
  const mimeToExt = {
    'image/jpeg': '.jpg', 'image/png': '.png',
    'image/webp': '.webp', 'image/gif': '.gif',
    'video/mp4': '.mp4', 'video/quicktime': '.mov',
    'video/webm': '.webm',
  };
  const ext = path.extname(file.originalname).toLowerCase()
    || mimeToExt[file.mimetype]
    || '.jpg';
  const base = path.basename(file.originalname, path.extname(file.originalname))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40) || 'upload';
  const filename = `${Date.now()}_${base}${ext}`;
  cb(null, filename);
},
})
const fileFilter = (req, file, cb) => {
  const allowed = [
    '.jpg', '.jpeg', '.png', '.webp', '.gif',
    '.mp4', '.mov', '.avi', '.webm',
  ];
  const allowedMime = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/avi', 'video/webm',
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext) || allowedMime.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${ext}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max
});

// POST /api/upload
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'NO_FILE', message: 'No file received' });
  }

  let finalPath = req.file.path;
  let finalFilename = req.file.filename;
  let masked = false;

  // Run automatic background masking on images
  try {
    const maskedPath = await createAutomaticImageMask(req.file.path);
    if (maskedPath !== req.file.path) {
      finalPath = maskedPath;
      finalFilename = path.basename(maskedPath);
      masked = true;
    }
  } catch (e) {
    console.error('[Upload] Masking failed, using original file:', e.message);
  }

  const absolutePath = finalPath.replace(/\\/g, '/');
  const serverPath   = `/uploads/${finalFilename}`;

  res.json({
    ok:           true,
    fileName:     finalFilename,
    originalName: req.file.originalname,
    filePath:     absolutePath,   // full path for AE injection
    path:         absolutePath,   // alias — some frontend code uses this
    serverPath:   serverPath,     // web-accessible URL for preview
    sizeKB:       Math.round(fs.statSync(finalPath).size / 1024),
    mimeType:     req.file.mimetype,
    masked:       masked,
  });
})
// DELETE /api/upload/:filename — cleanup after render
router.delete('/:filename', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, path.basename(req.params.filename));
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return res.json({ ok: true });
    }
    res.status(404).json({ error: 'FILE_NOT_FOUND' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;