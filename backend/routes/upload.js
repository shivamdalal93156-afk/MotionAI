const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync('./uploads', { recursive: true });
    cb(null, './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// POST /api/upload
router.post('/', (req, res) => {
  try {
    fs.mkdirSync('./uploads', { recursive: true });
    
    upload.single('file')(req, res, function (err) {
      if (err) {
        console.error('Upload error:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
      
      try {
        if (!req.file) {
          throw new Error('No file attached');
        }
        // Respond with both path strings to be safe against different frontend expectations
        res.json({ 
          success: true, 
          filePath: `/uploads/${req.file.filename}`,
          path: `/uploads/${req.file.filename}` 
        });
      } catch(err) {
        console.error('Upload error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });
  } catch(err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
