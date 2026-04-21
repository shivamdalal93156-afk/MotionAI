require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const renderRoutes = require('./routes/render');
const jobRoutes = require('./routes/jobs');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3001;

// Make sure output and uploads dirs exist
['./outputs', './uploads'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve rendered videos as static files
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/render', renderRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n MotionAI Backend running on http://localhost:${PORT}`);
  console.log(` AE Render Path: ${process.env.AE_RENDER_PATH}`);
  console.log(` Template Path: ${process.env.AE_TEMPLATE_PATH}\n`);
});
