/**
 * MotionAI — Preview Frame Generator
 * 
 * Run from backend/ directory:
 *   node generate_previews.js
 * 
 * What it does:
 * - Reads all template folders
 * - For each template, finds the most recent output MP4 in backend/outputs/
 *   (matches by checking job logs or just picks latest file)
 * - Extracts frames at scene outpoints using FFmpeg
 * - Saves preview/preview.jpg (thumbnail for gallery card)
 * - Saves preview/scene_1.jpg, preview/scene_2.jpg etc (one per scene)
 * - Also saves preview/preview.mp4 (10s clip from start) for animated card
 */

require('dotenv').config();
const fs      = require('fs');
const path    = require('path');
const { execSync, spawnSync } = require('child_process');

const TEMPLATES_DIR = path.resolve(__dirname, 'templates');
const OUTPUTS_DIR   = path.resolve(__dirname, 'outputs');
const FFMPEG        = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\bin\\ffmpeg.exe';
const FFPROBE       = process.env.FFMPEG_PATH
  ? process.env.FFMPEG_PATH.replace('ffmpeg.exe', 'ffprobe.exe')
  : 'C:\\ffmpeg\\bin\\ffprobe.exe';

// ── helpers ───────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[preview] ${msg}`); }
function warn(msg) { console.warn(`[preview] ⚠  ${msg}`); }
function ok(msg)  { console.log(`[preview] ✓ ${msg}`); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getVideoduration(videoPath) {
  try {
    const result = spawnSync(FFPROBE, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      videoPath
    ]);
    const data = JSON.parse(result.stdout.toString());
    return parseFloat(data.format.duration);
  } catch { return null; }
}

function extractFrame(videoPath, timeSeconds, outputPath) {
  try {
    const args = [
      '-y',
      '-ss', String(Math.max(0, timeSeconds)),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '3',
      '-vf', 'scale=640:-1',
      outputPath
    ];
    const result = spawnSync(`"${FFMPEG}"`, args, { shell: true });
    return fs.existsSync(outputPath);
  } catch { return false; }
}

function extractClip(videoPath, startSeconds, durationSeconds, outputPath) {
  try {
    const args = [
      '-y',
      '-ss', String(Math.max(0, startSeconds)),
      '-i', videoPath,
      '-t', String(durationSeconds),
      '-vf', 'scale=640:-1',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '28',
      '-an', // no audio
      '-movflags', 'faststart',
      outputPath
    ];
    const result = spawnSync(`"${FFMPEG}"`, args, { shell: true });
    return fs.existsSync(outputPath);
  } catch { return false; }
}

// Find the most recent MP4 in outputs/ that was rendered from a given template
// Strategy: check job log files in logs/jobs/ for template name match
// Fallback: use the most recently modified MP4 in outputs/
function findLatestOutputForTemplate(templateName) {
  const logsDir = path.resolve(__dirname, 'logs', 'jobs');
  
  // Try matching via job logs
  if (fs.existsSync(logsDir)) {
    const logFiles = fs.readdirSync(logsDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        path: path.join(logsDir, f),
        mtime: fs.statSync(path.join(logsDir, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime); // newest first

    for (const logFile of logFiles) {
      try {
        const lines = fs.readFileSync(logFile.path, 'utf8').split('\n').filter(Boolean);
        const firstLine = JSON.parse(lines[0]);
        if (firstLine.template === templateName || firstLine.data?.template === templateName) {
          // Find the output file — look for DONE status line
          for (const line of lines.reverse()) {
            try {
              const entry = JSON.parse(line);
              const outputFile = entry.data?.outputFile || entry.outputFile;
              if (outputFile) {
                const fullPath = path.resolve(__dirname, 'outputs', path.basename(outputFile));
                if (fs.existsSync(fullPath)) return fullPath;
              }
            } catch {}
          }
        }
      } catch {}
    }
  }

  // Fallback: just use the most recently modified MP4 in outputs/
  if (!fs.existsSync(OUTPUTS_DIR)) return null;
  const mp4s = fs.readdirSync(OUTPUTS_DIR)
    .filter(f => f.endsWith('.mp4'))
    .map(f => ({ name: f, path: path.join(OUTPUTS_DIR, f), mtime: fs.statSync(path.join(OUTPUTS_DIR, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);

  return mp4s.length > 0 ? mp4s[0].path : null;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('MotionAI Preview Frame Generator');
  log(`FFmpeg: ${FFMPEG}`);
  log(`Templates: ${TEMPLATES_DIR}`);
  log(`Outputs: ${OUTPUTS_DIR}`);
  log('');

  if (!fs.existsSync(FFMPEG.replace(/"/g, ''))) {
    warn(`FFmpeg not found at ${FFMPEG}. Set FFMPEG_PATH in .env`);
    process.exit(1);
  }

  const templateDirs = fs.readdirSync(TEMPLATES_DIR)
    .filter(f => fs.statSync(path.join(TEMPLATES_DIR, f)).isDirectory());

  log(`Found ${templateDirs.length} templates\n`);

  for (const templateName of templateDirs) {
    const templateDir = path.join(TEMPLATES_DIR, templateName);
    const configPath  = path.join(templateDir, 'config.json');
    const previewDir  = path.join(templateDir, 'preview');

    log(`Processing: ${templateName}`);

    // Read config for scene outpoints
    let config = null;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      warn(`  No config.json — skipping`);
      continue;
    }

    const sceneMap  = config.sceneMap  || {};
    const duration  = config.duration  || 30;
    const scenes    = Object.entries(sceneMap);

    // Find a rendered output video for this template
    const videoPath = findLatestOutputForTemplate(templateName);
    if (!videoPath) {
      warn(`  No rendered output found — skipping frame extraction`);
      warn(`  Render this template first, then re-run this script`);
      continue;
    }

    log(`  Using video: ${path.basename(videoPath)}`);
    const videoDuration = getVideoduration(videoPath);
    log(`  Video duration: ${videoDuration?.toFixed(2)}s`);

    ensureDir(previewDir);

    // 1. Gallery card thumbnail — frame at 3s (or 10% into video)
    const thumbTime  = Math.min(3, (videoDuration || duration) * 0.1);
    const thumbPath  = path.join(previewDir, 'preview.jpg');
    if (!fs.existsSync(thumbPath)) {
      if (extractFrame(videoPath, thumbTime, thumbPath)) {
        ok(`  preview.jpg → ${thumbTime.toFixed(1)}s`);
      } else {
        warn(`  Failed to extract preview.jpg`);
      }
    } else {
      log(`  preview.jpg already exists — skipping`);
    }

    // 2. Animated preview clip — first 8 seconds
    const clipPath = path.join(previewDir, 'preview.mp4');
    if (!fs.existsSync(clipPath)) {
      const clipDur = Math.min(8, videoDuration || 8);
      if (extractClip(videoPath, 0, clipDur, clipPath)) {
        ok(`  preview.mp4 → 0–${clipDur}s clip`);
      } else {
        warn(`  Failed to extract preview.mp4`);
      }
    } else {
      log(`  preview.mp4 already exists — skipping`);
    }

    // 3. Scene frames — one frame per scene at scene start time
    if (scenes.length > 0) {
      for (let i = 0; i < scenes.length; i++) {
        const [sceneName, sceneData] = scenes[i];
        const sceneEnd   = sceneData.outpoint || 0;
        // frame at start of scene (previous scene's outpoint + 0.5s, or 0.5s for first)
        const prevEnd    = i === 0 ? 0 : (scenes[i-1][1].outpoint || 0);
        const frameTime  = prevEnd + Math.max(0.5, (sceneEnd - prevEnd) * 0.3);
        const safeTime   = Math.min(frameTime, (videoDuration || duration) - 0.1);
        const framePath  = path.join(previewDir, `scene_${i + 1}.jpg`);

        if (!fs.existsSync(framePath)) {
          if (extractFrame(videoPath, safeTime, framePath)) {
            ok(`  scene_${i+1}.jpg → ${safeTime.toFixed(2)}s (${sceneName})`);
          } else {
            warn(`  Failed: scene_${i+1}.jpg`);
          }
        } else {
          log(`  scene_${i+1}.jpg already exists — skipping`);
        }
      }
    } else {
      // No scene map — extract frames at 25%, 50%, 75% of video
      const checkpoints = [0.25, 0.5, 0.75];
      checkpoints.forEach((pct, i) => {
        const t = (videoDuration || duration) * pct;
        const framePath = path.join(previewDir, `scene_${i+1}.jpg`);
        if (!fs.existsSync(framePath)) {
          if (extractFrame(videoPath, t, framePath)) {
            ok(`  scene_${i+1}.jpg → ${t.toFixed(2)}s`);
          }
        }
      });
    }

    log('');
  }

  log('Done. Put these files in backend/templates/{name}/preview/');
  log('The frontend will automatically load them.');
}

main().catch(err => {
  console.error('[preview] Fatal error:', err);
  process.exit(1);
});
