require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const { runPreflight }          = require('./services/preflight');
const { recoverInterruptedJobs, getQueueStats } = require('./services/jobQueue');
const { runScheduledCleanup }   = require('./services/cleanup');

const app  = express();
const PORT = process.env.PORT || 3001;


// Health gate middleware — rejects render requests if system not ready
app.use((req, res, next) => {
  if (!systemReady && req.path.startsWith('/api/render')) {
    return res.status(503).json({
      error: 'SYSTEM_NOT_READY',
      message: 'Server is still running preflight checks. Try again in a moment.'
    });
  }
  next();
});
// ── Middleware ─────────────────────────────────────────────────


app.use(cors({
  origin:'*',
}));
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});
app.use(express.json({ limit: '2mb' }));

// Serve completed MP4s directly
app.use('/templates', express.static(path.resolve(__dirname, 'templates')));
app.use('/footage', express.static(path.resolve(__dirname, 'templates')));
app.use('/outputs', express.static(path.resolve(__dirname, 'outputs')));
// ── Routes ───────────────────────────────────────────────────────
app.use('/api/upload', require('./routes/upload'));
app.use('/api/render', require('./routes/render'));
app.use('/api/jobs',   require('./routes/jobs'));
app.use('/api/health', require('./routes/health'));
app.use('/admin',      require('./routes/admin'));

// ── Watchdog (loaded after routes so it can import queue) ────────
// Inline here — one less file import at startup
const { readJobFile } = require('./services/jobQueue');

let systemReady = false; // gates requests until preflight passes


// ── Startup sequence ─────────────────────────────────────────────
async function start() {
  console.log('\n[server] MotionAI starting...');

  // 1. Preflight — fatal if any check fails
  try {
    await runPreflight();
    console.log('[server] Preflight passed.\n');
  } catch (err) {
    console.error('\n[server] FATAL: Preflight failed. Server will start but render requests will be rejected.');
    console.error(`[server] Reason: ${err.message}\n`);
    // Don't exit — let /api/health report the failure so the frontend can show it
    // systemReady stays false
  }

  // 2. Recover any jobs that were mid-flight when server last crashed
  const recovered = recoverInterruptedJobs();
  if (recovered > 0) {
    console.log(`[server] Recovered ${recovered} interrupted job(s) — re-queued as pending.`);
  }

  // 3. Start the queue worker loop
  // Imported here to avoid circular deps at module load time
  const { startWorkerLoop } = require('./services/jobQueue.worker');
  startWorkerLoop();

  // 4. Scheduled cleanup — every hour
  setInterval(runScheduledCleanup, 60 * 60 * 1000);
  // Run once on startup too (clean up any mess from last session)
  runScheduledCleanup();

  // 5. Mark system ready
  systemReady = true;

  // 6. Start listening
  app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
    console.log(`[server] Admin panel: http://localhost:${PORT}/admin?token=${process.env.ADMIN_TOKEN}`);
    console.log(`[server] Queue stats: ${JSON.stringify(getQueueStats())}\n`);
  });
}

start().catch(err => {
  console.error('[server] Unhandled startup error:', err);
  process.exit(1);
});