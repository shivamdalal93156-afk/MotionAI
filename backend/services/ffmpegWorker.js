// const fs        = require('fs');
// const path      = require('path');
// const { spawn } = require('child_process');
// const { execSync } = require('child_process');

// async function runFFmpeg(aviPath, jobId, jobLog) {
//   const outputsDir = path.resolve(__dirname, '..', 'outputs');
//   const mp4Path    = path.join(outputsDir, `${jobId}.mp4`);
//   const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

//   const FFMPEG_TIMEOUT_MS = 15 * 60 * 1000; // 15 min

//   const args = [
//     '-y',                    // overwrite without asking
//     '-i',    aviPath,
//     '-c:v',  'libx264',
//     '-preset', 'fast',       // balance speed vs size
//     '-crf',  '23',           // quality (18=near lossless, 28=smaller file)
//     '-pix_fmt', 'yuv420p',   // maximum browser compatibility
//     '-movflags', '+faststart', // enable progressive streaming
//     '-c:a',  'aac',
//     '-b:a',  '192k',
//     mp4Path,
//   ];

//   jobLog('FFMPEG_LAUNCH', { aviPath, mp4Path });

//   return new Promise((resolve, reject) => {
//     const ff = spawn(`"${ffmpegPath}"`, args, {
//       shell: true,
//       stdio: ['ignore', 'pipe', 'pipe'],
//       windowsHide: true,
//     });

//     let settled   = false;
//     let stderrBuf = '';

//     // FFmpeg writes progress to stderr
//     ff.stderr.on('data', chunk => {
//       const text = chunk.toString();
//       stderrBuf += text;
//       // Only log frame= lines (progress) to avoid flooding
//       if (text.includes('frame=')) {
//         jobLog('FFMPEG_PROGRESS', { text: text.trim().slice(0, 200) });
//       }
//     });

//     ff.stdout.on('data', chunk => {
//       jobLog('FFMPEG_STDOUT', { text: chunk.toString().trim().slice(0, 200) });
//     });

//     const hardTimeout = setTimeout(() => {
//       if (!settled) {
//         settled = true;
//         ff.kill('SIGKILL');
//         _cleanup(aviPath);
//         reject(new Error('FFMPEG_TIMEOUT: exceeded 15 minute limit'));
//       }
//     }, FFMPEG_TIMEOUT_MS);

//     ff.on('close', (code) => {
//       clearTimeout(hardTimeout);
//       if (settled) return;
//       settled = true;

//       // ALWAYS delete AVI — success or failure
//       _cleanup(aviPath);

//       if (code !== 0) {
//         // Delete partial MP4 if it exists
//         if (fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path);
//         return reject(new Error(`FFMPEG_FAIL: exited code ${code}. stderr tail:\n${stderrBuf.slice(-500)}`));
//       }

//       // Verify MP4
//       if (!fs.existsSync(mp4Path)) {
//         return reject(new Error('FFMPEG_NO_OUTPUT: FFmpeg succeeded but MP4 not found'));
//       }
//       const mp4Size = fs.statSync(mp4Path).size;
//       if (mp4Size < 10240) { // less than 10KB is corrupt
//         fs.unlinkSync(mp4Path);
//         return reject(new Error(`FFMPEG_OUTPUT_TOO_SMALL: MP4 only ${mp4Size} bytes`));
//       }

//       // Quick playability check via ffprobe
//       try {
//         execSync(
//           `"${ffmpegPath.replace('ffmpeg', 'ffprobe')}" -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1 "${mp4Path}"`,
//           { stdio: 'pipe', timeout: 10000 }
//         );
//       } catch {
//         // ffprobe not available or check failed — log warning but don't fail
//         jobLog('FFPROBE_SKIP', { note: 'ffprobe check unavailable' });
//       }

//       jobLog('FFMPEG_COMPLETE', {
//         mp4Path,
//         mp4SizeMB: (mp4Size / 1048576).toFixed(1),
//       });
//       resolve({ mp4Path, outputUrl: `/outputs/${jobId}.mp4` });
//     });

//     ff.on('error', (err) => {
//       clearTimeout(hardTimeout);
//       _cleanup(aviPath);
//       if (!settled) { settled = true; reject(new Error(`FFMPEG_SPAWN_ERROR: ${err.message}`)); }
//     });
//   });
// }

// function _cleanup(aviPath) {
//   try {
//     if (fs.existsSync(aviPath)) {
//       fs.unlinkSync(aviPath);
//       console.log(`[ffmpeg] AVI deleted: ${aviPath}`);
//     }
//   } catch (e) {
//     console.warn(`[ffmpeg] Could not delete AVI: ${e.message}`);
//   }
// }

// module.exports = { runFFmpeg };
const fs           = require('fs');
const path         = require('path');
const { spawn }    = require('child_process');
const { execSync } = require('child_process');

async function runFFmpeg(aviPath, jobId, jobLog, outputFileName) {
  const outputsDir = path.resolve(__dirname, '..', 'outputs');
  const fileName   = outputFileName || `${jobId}.mp4`;
  const finalPath  = path.join(outputsDir, fileName);

  // If input is already MP4 (aerender on AE 2026), just move it
  if (aviPath.endsWith('.mp4')) {
    jobLog('FFMPEG_SKIP', { note: 'Input is already MP4 — moving to outputs' });
    fs.renameSync(aviPath, finalPath);
    const size = fs.statSync(finalPath).size;
    jobLog('FFMPEG_COMPLETE', { mp4Path: finalPath, mp4SizeMB: (size / 1048576).toFixed(1) });
    return { mp4Path: finalPath, outputUrl: `/outputs/${fileName}` };
  }
}
  // Otherwise run full FFmpeg conversion (AVI input)
  // ... rest of existing ffmpeg code unchanged

// Stitch multiple MP4s into one final file
async function stitchMP4s(mp4Paths, jobId, jobLog) {
  const outputsDir  = path.resolve(__dirname, '..', 'outputs');
  const ffmpegPath  = process.env.FFMPEG_PATH || 'ffmpeg';
  const concatList  = path.join(outputsDir, `${jobId}_concat.txt`);
  const finalPath   = path.join(outputsDir, `${jobId}_final.mp4`);

  // Write concat file — FFmpeg concat demuxer format
  const lines = mp4Paths.map(p => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(concatList, lines, 'utf8');

  jobLog('FFMPEG_STITCH_START', { parts: mp4Paths.length, concatList });

  const args = [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', `"${concatList}"`,
    '-c', 'copy',
    `"${finalPath}"`,
  ];

  return new Promise((resolve, reject) => {
    const ff = spawn(`"${ffmpegPath}"`, args, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let settled   = false;
    let stderrBuf = '';

    ff.stderr.on('data', chunk => { stderrBuf += chunk.toString(); });

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ff.kill('SIGKILL');
        reject(new Error('FFMPEG_STITCH_TIMEOUT'));
      }
    }, 5 * 60 * 1000);

    ff.on('close', (code) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;

      // Cleanup intermediate files + concat list
      for (const p of mp4Paths) _deleteFile(p);
      _deleteFile(concatList);

      if (code !== 0 || !fs.existsSync(finalPath)) {
        return reject(new Error(`FFMPEG_STITCH_FAIL: code ${code}\n${stderrBuf.slice(-300)}`));
      }

      jobLog('FFMPEG_STITCH_COMPLETE', {
        finalPath,
        sizeMB: (fs.statSync(finalPath).size / 1048576).toFixed(1)
      });
      resolve({ mp4Path: finalPath, outputUrl: `/outputs/${jobId}_final.mp4` });
    });

    ff.on('error', (err) => {
      clearTimeout(timeout);
      if (!settled) { settled = true; reject(new Error(`FFMPEG_STITCH_SPAWN_ERROR: ${err.message}`)); }
    });
  });
}

function _deleteFile(filePath) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
}

module.exports = { runFFmpeg, stitchMP4s };