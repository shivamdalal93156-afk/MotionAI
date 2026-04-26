const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const execPromise = util.promisify(exec);

async function extract(previewFile, jobId) {
  const ext = path.extname(previewFile).toLowerCase();
  if (['.jpg', '.jpeg', '.png'].includes(ext)) {
    return [previewFile];
  }

  // Assuming ffmpeg is available globally or path is in env
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  
  // 1. Get duration
  let duration = 10;
  try {
    const { stdout } = await execPromise(`"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${previewFile}"`);
    const parsed = parseFloat(stdout.trim());
    if (!isNaN(parsed) && parsed > 0) duration = parsed;
  } catch (e) {
    console.warn('[FrameExtractor] ffprobe failed or missing, defaulting duration to 10s. Error:', e.message);
  }

  // Calculate interval (avoid 0)
  const interval = Math.max(0.1, duration / 10);
  const tempDir = path.dirname(previewFile);
  const outPattern = path.join(tempDir, `frame_${jobId}_%02d.jpg`);
  
  const frames = [];

  // 2. Extract evenly spaced frames
  try {
    // -y to overwrite, -vf fps=1/interval
    const cmd1 = `"${ffmpegPath}" -y -i "${previewFile}" -vf "fps=1/${interval}" -q:v 2 "${outPattern}"`;
    console.log('[FrameExtractor] Running ffmpeg:', cmd1);
    await execPromise(cmd1);
    
    // read all generated frame files
    for (let i = 1; i <= 20; i++) { // cap at 20 just in case
      const p = path.join(tempDir, `frame_${jobId}_${String(i).padStart(2, '0')}.jpg`);
      if (fs.existsSync(p)) frames.push(p);
    }
  } catch (e) {
    console.error('[FrameExtractor] Error extracting even frames:', e.message);
  }

  // 3. Extract 1 frame at 0.5s for title cards
  try {
    const p05 = path.join(tempDir, `frame_${jobId}_05s.jpg`);
    const cmd2 = `"${ffmpegPath}" -y -ss 0.5 -i "${previewFile}" -vframes 1 -q:v 2 "${p05}"`;
    await execPromise(cmd2);
    if (fs.existsSync(p05)) {
      // Keep it first or last, adding to start
      frames.unshift(p05);
    }
  } catch (e) {
    console.error('[FrameExtractor] Error extracting 0.5s frame:', e.message);
  }

  // Return max 11 frames (10 evenly spaced + 1 at 0.5s)
  // Ensure we limit it in case of extra frames
  return frames.slice(0, 11);
}

module.exports = { extract };
