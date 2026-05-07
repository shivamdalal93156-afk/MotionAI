const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Keep original name but prefix with timestamp to avoid collisions
    const ext      = path.extname(file.originalname);
    const base     = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const filename = `${Date.now()}_${base}${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    '.jpg', '.jpeg', '.png', '.webp', '.gif',
    '.mp4', '.mov', '.avi', '.webm',
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
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
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'NO_FILE', message: 'No file received' });
  }

  const filePath = req.file.path.replace(/\\/g, '/');

  res.json({
    ok:           true,
    fileName:     req.file.filename,
    originalName: req.file.originalname,
    filePath:     filePath,
    sizeKB:       Math.round(req.file.size / 1024),
    mimeType:     req.file.mimetype,
  });
});

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