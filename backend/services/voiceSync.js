/**
 * MotionAI — Voice Sync Service
 * 
 * 1. Runs voice_sync.py (Whisper) on uploaded audio
 * 2. Matches Whisper word timestamps to template text layers
 * 3. Returns adjusted layer timings for AE injection
 * 4. Calculates speed ratio per scene (safe range: 0.85x–1.25x)
 */

const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PYTHON         = 'py';   // Windows: 'py', Linux/Mac: 'python3'
const VOICE_SCRIPT   = path.resolve(__dirname, '..', 'voice_sync.py');
const WHISPER_MODEL  = 'medium'; // best accuracy for Hindi+English

// Safe speed adjustment range
const MIN_SPEED = 0.85;
const MAX_SPEED = 1.25;

// ── Run Whisper ───────────────────────────────────────────────────────────────
function runWhisper(audioPath, language = null) {
  const resultPath = audioPath + '.whisper.json';

  const args = [
    VOICE_SCRIPT,
    '--audio',  audioPath,
    '--output', resultPath,
    '--model',  WHISPER_MODEL,
  ];
  if (language) { args.push('--language', language); }

  const result = spawnSync(PYTHON, args, {
    timeout: 5 * 60 * 1000, // 5 min max
    encoding: 'utf8',
  });

  if (result.error) throw new Error(`Whisper spawn error: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Whisper failed: ${result.stderr || result.stdout}`);

  if (!fs.existsSync(resultPath)) throw new Error('Whisper produced no output file');

  const data = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  fs.unlinkSync(resultPath); // cleanup

  if (data.error) throw new Error(`Whisper error: ${data.message}`);
  return data; // { words: [{word, start, end, confidence}], language, duration, text }
}

// ── Fix missing words ─────────────────────────────────────────────────────────
// If Whisper missed a word, interpolate timing between prev and next
function fillMissingWords(whisperWords, templateWords) {
  /**
   * templateWords: array of strings (the text layer values user typed)
   * whisperWords:  array of {word, start, end, confidence}
   * 
   * Strategy: match by normalized text similarity
   * Missing = word in template not found in whisper output
   * For missing: interpolate between surrounding found words
   */

  const normalize = s => s.toLowerCase().replace(/[^a-z0-9\u0900-\u097f]/g, '').trim();

  // Build a matched array: one entry per template word
  const matched = [];
  let wIdx = 0; // pointer into whisperWords

  for (let i = 0; i < templateWords.length; i++) {
    const tWord = normalize(templateWords[i]);
    let found   = null;

    // Scan forward in whisper words for a match
    for (let j = wIdx; j < Math.min(wIdx + 8, whisperWords.length); j++) {
      const wWord = normalize(whisperWords[j].word);
      // exact or partial match
      if (wWord === tWord || wWord.includes(tWord) || tWord.includes(wWord)) {
        found = { ...whisperWords[j], matched: true };
        wIdx  = j + 1;
        break;
      }
    }

    matched.push(found || { word: templateWords[i], start: null, end: null, matched: false });
  }

  // Fill nulls by interpolation
  for (let i = 0; i < matched.length; i++) {
    if (matched[i].start !== null) continue;

    // Find prev known
    let prevEnd = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (matched[j].end !== null) { prevEnd = matched[j].end; break; }
    }
    // Find next known
    let nextStart = matched[matched.length - 1]?.end || prevEnd + 1;
    for (let j = i + 1; j < matched.length; j++) {
      if (matched[j].start !== null) { nextStart = matched[j].start; break; }
    }

    // Count how many consecutive nulls
    let nullCount = 0;
    for (let j = i; j < matched.length && matched[j].start === null; j++) nullCount++;

    const gap      = nextStart - prevEnd;
    const slotSize = gap / (nullCount + 1);

    for (let j = 0; j < nullCount; j++) {
      matched[i + j].start = round3(prevEnd + slotSize * (j + 1) - slotSize * 0.4);
      matched[i + j].end   = round3(prevEnd + slotSize * (j + 1));
      matched[i + j].interpolated = true;
    }
    i += nullCount - 1;
  }

  return matched;
}

function round3(n) { return Math.round(n * 1000) / 1000; }

// ── Match words to scenes ─────────────────────────────────────────────────────
function matchToScenes(matchedWords, sceneMap, templateConfig) {
  /**
   * For each scene:
   * - Find which template text layers belong to it
   * - Find the corresponding matched words
   * - Calculate: audioStart, audioEnd (from whisper), videoStart, videoEnd (from config)
   * - Calculate speedRatio = audioDuration / videoDuration
   * - Clamp to safe range, flag if out of range
   */

  const textLayers = templateConfig.textLayers || [];
  const scenes     = Object.entries(sceneMap);
  const results    = [];

  let wordIdx = 0; // sequential word pointer across all scenes

  for (const [sceneName, sceneData] of scenes) {
    const sceneKeys    = sceneData.keys || [];
    const textKeys     = sceneKeys.filter(k => textLayers.find(l => l.key === k));
    const sceneLayers  = textKeys.map(k => textLayers.find(l => l.key === k)).filter(Boolean);

    if (sceneLayers.length === 0) {
      results.push({ scene: sceneName, hasText: false });
      continue;
    }

    // Grab the next N words for this scene
    const sceneWords = matchedWords.slice(wordIdx, wordIdx + sceneLayers.length);
    wordIdx += sceneLayers.length;

    // Video timing for this scene
    const videoStart = sceneLayers[0].absIn;
    const videoEnd   = sceneData.outpoint || sceneLayers[sceneLayers.length - 1].absOut;
    const videoDur   = videoEnd - videoStart;

    // Audio timing for this scene
    const audioStart = sceneWords[0]?.start ?? videoStart;
    const audioEnd   = sceneWords[sceneWords.length - 1]?.end ?? videoEnd;
    const audioDur   = audioEnd - audioStart;

    // Speed ratio: how much to stretch/compress video to match audio
    const rawRatio   = audioDur > 0 ? videoDur / audioDur : 1;
    const clamped    = Math.max(MIN_SPEED, Math.min(MAX_SPEED, rawRatio));
    const outOfRange = rawRatio < MIN_SPEED || rawRatio > MAX_SPEED;

    // Per-layer adjusted timings
    const adjustedLayers = sceneLayers.map((layer, i) => {
      const word       = sceneWords[i];
      const audioWordStart = word?.start ?? null;
      const audioWordEnd   = word?.end   ?? null;
      return {
        key:          layer.key,
        layerName:    layer.layerName,
        compName:     layer.compName,
        originalIn:   layer.absIn,
        originalOut:  layer.absOut,
        // New timing: shift layer to appear when word is spoken
        adjustedIn:   audioWordStart !== null ? round3(audioWordStart) : layer.absIn,
        adjustedOut:  audioWordEnd   !== null ? round3(audioWordEnd + (layer.absOut - layer.absIn)) : layer.absOut,
        interpolated: word?.interpolated || false,
        wordFound:    word?.matched !== false,
      };
    });

    results.push({
      scene:         sceneName,
      hasText:       true,
      videoStart, videoEnd, videoDur,
      audioStart, audioEnd, audioDur,
      speedRatio:    round3(rawRatio),
      clampedRatio:  round3(clamped),
      outOfRange,
      warning:       outOfRange ? `Scene "${sceneName}" needs ${round3(rawRatio)}x speed — clamped to ${round3(clamped)}x. Consider adjusting your script duration.` : null,
      layers:        adjustedLayers,
    });
  }

  return results;
}

// ── Main export ───────────────────────────────────────────────────────────────
async function processVoiceSync(audioPath, templateConfig, jobLog) {
  jobLog('VOICE_SYNC_START', { audioPath });

  // 1. Run Whisper
  jobLog('WHISPER_START', { model: WHISPER_MODEL });
  const whisperResult = runWhisper(audioPath);
  jobLog('WHISPER_DONE', {
    language:   whisperResult.language,
    wordCount:  whisperResult.words.length,
    duration:   whisperResult.duration,
  });

  // 2. Get template words (text layer values from inputData)
  // These are what the user typed into the text fields
  const templateTextLayers = templateConfig.textLayers || [];
  const templateWords      = templateTextLayers.map(l => l.value || l.layerName || '');

  // 3. Match whisper words to template words
  const matchedWords = fillMissingWords(whisperResult.words, templateWords);
  const missingCount = matchedWords.filter(w => w.interpolated).length;
  if (missingCount > 0) {
    jobLog('VOICE_WORDS_INTERPOLATED', { count: missingCount });
  }

  // 4. Match to scenes
  const sceneResults = matchToScenes(matchedWords, templateConfig.sceneMap || {}, templateConfig);

  // 5. Collect warnings
  const warnings = sceneResults
    .filter(s => s.outOfRange)
    .map(s => s.warning);

  // 6. Build adjusted layer map for AE injection
  const adjustedTimings = {};
  for (const scene of sceneResults) {
    if (!scene.hasText) continue;
    for (const layer of (scene.layers || [])) {
      adjustedTimings[layer.key] = {
        absIn:  layer.adjustedIn,
        absOut: layer.adjustedOut,
      };
    }
  }

  jobLog('VOICE_SYNC_DONE', {
    scenes:   sceneResults.length,
    warnings: warnings.length,
  });

  return {
    success:         true,
    whisperLanguage: whisperResult.language,
    audioDuration:   whisperResult.duration,
    matchedWords,
    sceneResults,
    adjustedTimings, // key → { absIn, absOut } — inject into AE
    warnings,        // show to user on frontend
    audioPath,       // pass to FFmpeg to merge into final MP4
  };
}

module.exports = { processVoiceSync, runWhisper };
