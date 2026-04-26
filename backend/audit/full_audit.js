
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync, spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ─── Reporting Infrastructure ───────────────────────────────────────────────
const REPORT = [];
const PASS = '✅ PASS';
const FAIL = '❌ FAIL';
const WARN = '⚠️  WARN';

const counters = {
  env: { pass: 0, total: 0 },
  configs: { pass: 0, total: 0 },
  templates: { pass: 0, total: 0 },
  ffmpeg: { pass: 0, total: 0 },
  aerender: { pass: 0, total: 0 },
  jsx: { pass: 0, total: 0 },
  fullRender: { pass: 0, total: 0 },
  api: { pass: 0, total: 0 },
  frontend: { pass: 0, total: 0 },
};
const criticalIssues = [];
const warnings = [];

function log(section, status, message, detail = '') {
  const line = `[${section}] ${status}: ${message}${detail ? '\n   Detail: ' + detail : ''}`;
  console.log(line);
  REPORT.push(line);
  if (status === FAIL) criticalIssues.push(`${section}: ${message}`);
  if (status === WARN) warnings.push(`${section}: ${message}`);
}

function sep(title) {
  const line = `\n${'─'.repeat(60)}\n## ${title}\n${'─'.repeat(60)}`;
  console.log(line);
  REPORT.push(line);
}

function writeReport() {
  try {
    const summary = buildSummary();
    const output = `# MotionAI Full System Audit\nGenerated: ${new Date().toISOString()}\n\n${REPORT.join('\n')}\n\n${summary}`;
    const outPath = path.join(__dirname, 'AUDIT_REPORT.md');
    fs.mkdirSync(__dirname, { recursive: true });
    fs.writeFileSync(outPath, output, 'utf8');
    console.log('\n\n=== AUDIT COMPLETE. Report written to backend/audit/AUDIT_REPORT.md ===');
  } catch (e) {
    console.error('FATAL: Could not write report:', e.message);
  }
}

function buildSummary() {
  const c = counters;
  const lines = [
    '\n## === SUMMARY ===',
    `Environment:     ${c.env.pass}/${c.env.total} checks passed`,
    `Configs:         ${c.configs.pass}/${c.configs.total} valid`,
    `Templates:       ${c.templates.pass}/${c.templates.total} matched`,
    `FFmpeg:          ${c.ffmpeg.pass > 0 ? PASS : FAIL}`,
    `aerender:        ${c.aerender.pass}/${c.aerender.total} templates renderable`,
    `JSX Generator:   ${c.jsx.pass}/${c.jsx.total} templates injectable`,
    `Full Render:     ${c.fullRender.pass > 0 ? PASS : (c.fullRender.total > 0 ? FAIL : 'SKIPPED')}`,
    `API Routes:      ${c.api.pass}/${c.api.total} routes working`,
    `Frontend Build:  ${c.frontend.pass > 0 ? PASS : (c.frontend.total > 0 ? FAIL : 'SKIPPED')}`,
    '',
    '### CRITICAL ISSUES (must fix before system works):',
    ...(criticalIssues.length ? criticalIssues.map(i => `- ${i}`) : ['- None']),
    '',
    '### WARNINGS (degraded but not broken):',
    ...(warnings.length ? warnings.map(w => `- ${w}`) : ['- None']),
  ];
  return lines.join('\n');
}

// Always write the report on exit
process.on('exit', writeReport);
process.on('uncaughtException', (e) => {
  log('FATAL', FAIL, 'Uncaught exception — audit aborted early', e.message);
  process.exit(1);
});

// ─── Helpers ────────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const CONFIGS_DIR = path.join(ROOT, 'configs');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const TEMP_DIR = path.join(ROOT, 'temp');
const OUTPUTS_DIR = path.join(ROOT, 'outputs');
const UPLOADS_DIR = path.join(ROOT, 'uploads');

function fileExists(p) { try { return fs.existsSync(p); } catch { return false; } }
function isWritable(p) {
  try {
    const test = path.join(p, '.audit_write_test');
    fs.writeFileSync(test, 'x');
    fs.unlinkSync(test);
    return true;
  } catch { return false; }
}
function mbSize(p) {
  try { return (fs.statSync(p).size / 1048576).toFixed(2) + ' MB'; } catch { return 'unknown'; }
}

// ─── SECTION 1: Environment & Paths ─────────────────────────────────────────
function auditEnvironment() {
  sep('SECTION 1 — Environment & Paths');

  // AE_RENDER_PATH / AERENDER_PATH
  const aerenderPath = process.env.AE_RENDER_PATH || process.env.AERENDER_PATH;
  counters.env.total++;
  if (aerenderPath && fileExists(aerenderPath)) {
    log('ENV', PASS, 'aerender.exe found', aerenderPath);
    counters.env.pass++;
  } else {
    log('ENV', FAIL, 'aerender.exe NOT found', `Checked: ${aerenderPath}`);
  }

  // AE_EXECUTABLE (afterfx.com/.exe)
  const aeExe = process.env.AE_EXECUTABLE;
  const aeConsole = aeExe ? aeExe.replace('afterfx.exe', 'afterfx.com') : null;
  counters.env.total++;
  if (aeExe && fileExists(aeExe)) {
    log('ENV', PASS, 'AE_EXECUTABLE (afterfx.exe) found', aeExe);
    counters.env.pass++;
  } else {
    log('ENV', FAIL, 'AE_EXECUTABLE not found', `Checked: ${aeExe}`);
  }
  counters.env.total++;
  if (aeConsole && fileExists(aeConsole)) {
    log('ENV', PASS, 'afterfx.com (console) found', aeConsole);
    counters.env.pass++;
  } else {
    log('ENV', WARN, 'afterfx.com not found — injection may fail', `Checked: ${aeConsole}`);
  }

  // FFMPEG
  counters.env.total++;
  try {
    const r = spawnSync('ffmpeg', ['-version'], { timeout: 8000, encoding: 'utf8' });
    if (r.status === 0 || (r.stdout && r.stdout.includes('ffmpeg version'))) {
      log('ENV', PASS, 'ffmpeg responds to -version');
      counters.env.pass++;
    } else {
      log('ENV', FAIL, 'ffmpeg returned non-zero', r.stderr || '');
    }
  } catch (e) { log('ENV', FAIL, 'ffmpeg not callable', e.message); }

  // FFPROBE
  counters.env.total++;
  const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  try {
    const r = spawnSync(ffprobePath, ['-version'], { timeout: 8000, encoding: 'utf8' });
    if (r.status === 0 || (r.stdout && r.stdout.includes('ffprobe version'))) {
      log('ENV', PASS, 'ffprobe responds to -version', ffprobePath);
      counters.env.pass++;
    } else {
      log('ENV', WARN, 'ffprobe returned non-zero or not found', ffprobePath);
    }
  } catch (e) { log('ENV', WARN, 'ffprobe not callable', e.message); }

  // GEMINI_API_KEY
  counters.env.total++;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.length > 5 && !geminiKey.includes('your_key')) {
    log('ENV', PASS, 'GEMINI_API_KEY is set');
    counters.env.pass++;
  } else {
    log('ENV', WARN, 'GEMINI_API_KEY is not set or is placeholder');
  }

  // Directories
  const dirs = [
    ['TEMP_DIR', TEMP_DIR],
    ['UPLOADS_DIR', UPLOADS_DIR],
    ['TEMPLATES_DIR', TEMPLATES_DIR],
    ['CONFIGS_DIR', CONFIGS_DIR],
    ['OUTPUTS_DIR', OUTPUTS_DIR],
  ];
  for (const [label, dir] of dirs) {
    counters.env.total++;
    if (!fileExists(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    }
    if (fileExists(dir) && isWritable(dir)) {
      log('ENV', PASS, `${label} exists and is writable`, dir);
      counters.env.pass++;
    } else if (fileExists(dir)) {
      log('ENV', WARN, `${label} exists but is NOT writable`, dir);
    } else {
      log('ENV', FAIL, `${label} does not exist`, dir);
    }
  }
}

// ─── SECTION 2: Config Files ─────────────────────────────────────────────────
const REQUIRED_CONFIG_FIELDS = ['template_id', 'name', 'aep_file', 'render_comp'];
const validConfigs = [];

function auditConfigs() {
  sep('SECTION 2 — Config Files');
  let files;
  try { files = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json')); }
  catch (e) { log('CONFIG', FAIL, 'Cannot read configs dir', e.message); return; }

  log('CONFIG', PASS, `Found ${files.length} config file(s)`);

  for (const file of files) {
    counters.configs.total++;
    const filePath = path.join(CONFIGS_DIR, file);
    let cfg;
    try { cfg = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (e) { log('CONFIG', FAIL, `${file} — invalid JSON`, e.message); continue; }

    const missing = REQUIRED_CONFIG_FIELDS.filter(f => !cfg[f]);
    if (missing.length) {
      log('CONFIG', WARN, `${file} — missing fields: ${missing.join(', ')}`);
    }

    const aepPath = path.join(TEMPLATES_DIR, cfg.aep_file || '');
    const aepExists = cfg.aep_file && fileExists(aepPath);
    if (!aepExists) {
      log('CONFIG', FAIL, `${file} — aep_file NOT found on disk`, `Expected: ${aepPath}`);
    } else {
      const textSlots = cfg.text_map ? Object.keys(cfg.text_map).length : (cfg.layers ? cfg.layers.filter(l => l.type === 'text').length : 0);
      const imgSlots = cfg.image_map ? Object.keys(cfg.image_map).length : (cfg.layers ? cfg.layers.filter(l => l.type === 'image').length : 0);
      log('CONFIG', PASS, `${file} — OK | text slots: ${textSlots} | image slots: ${imgSlots}`, `AEP: ${cfg.aep_file}`);
      counters.configs.pass++;
      validConfigs.push({ file, cfg, aepPath });
    }
  }
}

// ─── SECTION 3: Template Files ───────────────────────────────────────────────
function auditTemplates() {
  sep('SECTION 3 — Template Files');
  let aepFiles;
  try { aepFiles = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.aep')); }
  catch (e) { log('TEMPLATE', FAIL, 'Cannot read templates dir', e.message); return; }

  const configAepFiles = validConfigs.map(v => v.cfg.aep_file);

  for (const aep of aepFiles) {
    counters.templates.total++;
    const size = mbSize(path.join(TEMPLATES_DIR, aep));
    if (configAepFiles.includes(aep)) {
      log('TEMPLATE', PASS, `${aep} — has matching config | size: ${size}`);
      counters.templates.pass++;
    } else {
      log('TEMPLATE', WARN, `${aep} — ORPHANED (no config references this file) | size: ${size}`);
    }
  }

  // Check for configs whose AEP is missing
  for (const { file, cfg } of validConfigs) {
    if (cfg.aep_file && !aepFiles.includes(cfg.aep_file)) {
      log('TEMPLATE', FAIL, `Config ${file} references missing AEP: ${cfg.aep_file}`);
    }
  }
}

// ─── SECTION 4: FFmpeg ───────────────────────────────────────────────────────
function auditFFmpeg() {
  sep('SECTION 4 — FFmpeg');
  counters.ffmpeg.total++;
  try {
    const r = spawnSync('ffmpeg', ['-version'], { timeout: 10000, encoding: 'utf8' });
    if (r.stdout && r.stdout.includes('ffmpeg version')) {
      const ver = r.stdout.split('\n')[0];
      log('FFMPEG', PASS, 'ffmpeg -version succeeded', ver);
      counters.ffmpeg.pass++;
    } else {
      log('FFMPEG', FAIL, 'ffmpeg -version did not return expected output', r.stderr || '');
    }
  } catch (e) { log('FFMPEG', FAIL, 'ffmpeg not runnable', e.message); }

  // ffprobe on first mp4
  const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  let mp4 = null;
  for (const dir of [OUTPUTS_DIR, TEMP_DIR]) {
    try {
      const found = fs.readdirSync(dir).find(f => f.endsWith('.mp4'));
      if (found) { mp4 = path.join(dir, found); break; }
    } catch {}
  }

  if (!mp4) {
    log('FFMPEG', WARN, 'No MP4 found to test ffprobe — skipping probe test');
  } else {
    try {
      const r = spawnSync(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mp4], { timeout: 10000, encoding: 'utf8' });
      if (r.stdout && r.stdout.trim()) {
        log('FFMPEG', PASS, `ffprobe on ${path.basename(mp4)} → duration: ${r.stdout.trim()}s`);
      } else {
        log('FFMPEG', WARN, 'ffprobe ran but returned no duration', r.stderr || '');
      }
    } catch (e) { log('FFMPEG', WARN, 'ffprobe failed', e.message); }
  }
}

// ─── SECTION 5: aerender Basic Test ─────────────────────────────────────────
function auditAerender() {
  sep('SECTION 5 — aerender Basic Test (frame 0 per template)');
  const aerenderPath = process.env.AE_RENDER_PATH || process.env.AERENDER_PATH;
  if (!aerenderPath || !fileExists(aerenderPath)) {
    log('AERENDER', FAIL, 'aerender.exe not found — skipping all tests');
    return;
  }

  for (const { file, cfg, aepPath } of validConfigs) {
    counters.aerender.total++;
    const outJpg = path.join(TEMP_DIR, `audit_frame_${cfg.template_id}.jpg`);
    if (fileExists(outJpg)) try { fs.unlinkSync(outJpg); } catch {}

    log('AERENDER', WARN, `Testing ${cfg.template_id} — running aerender (60s timeout)...`);
    try {
      const r = spawnSync(
        aerenderPath,
        ['-project', aepPath, '-comp', cfg.render_comp, '-s', '0', '-e', '0', '-OMtemplate', 'JPEG', '-output', outJpg, '-continueOnMissingFootage'],
        { timeout: 60000, encoding: 'utf8' }
      );
      const combined = (r.stdout || '') + (r.stderr || '');
      if (combined.includes('No comp was found')) {
        log('AERENDER', FAIL, `${cfg.template_id} — comp "${cfg.render_comp}" not found in AEP`, combined.slice(0, 300));
      } else if (fileExists(outJpg)) {
        log('AERENDER', PASS, `${cfg.template_id} — test frame created`, mbSize(outJpg));
        counters.aerender.pass++;
        try { fs.unlinkSync(outJpg); } catch {}
      } else {
        log('AERENDER', FAIL, `${cfg.template_id} — aerender exited but no JPG created`, combined.slice(0, 300));
      }
    } catch (e) {
      log('AERENDER', FAIL, `${cfg.template_id} — aerender threw or timed out`, e.message);
    }
  }
}

// ─── SECTION 6: JSX Injection Dry Run ───────────────────────────────────────
function auditJsxGenerator() {
  sep('SECTION 6 — JSX Generator Dry Run');
  let generateJsx;
  try {
    ({ generateJsx } = require('../services/jsxGenerator'));
  } catch (e) {
    log('JSX', FAIL, 'Could not require jsxGenerator.js', e.message);
    return;
  }

  for (const { file, cfg } of validConfigs) {
    counters.jsx.total++;
    try {
      // Build dummy text and image data from config
      const dummyText = {};
      const dummyImages = {};

      if (cfg.text_map) {
        for (const v of Object.values(cfg.text_map)) dummyText[v] = ['Audit Test'];
      } else if (cfg.layers) {
        cfg.layers.filter(l => l.type === 'text').forEach(l => { dummyText[l.name] = ['Audit Test']; });
      }

      const fakeTpl = path.join(TEMPLATES_DIR, cfg.aep_file).replace(/\\/g, '/');
      const fakeSave = path.join(TEMP_DIR, `audit_dry_${cfg.template_id}.aep`).replace(/\\/g, '/');

      const jsx = generateJsx('audit', fakeTpl, fakeSave, cfg.render_comp, dummyText, dummyImages, null, 0, '');

      if (typeof jsx !== 'string' || jsx.length < 50) {
        log('JSX', FAIL, `${cfg.template_id} — generator returned empty/short string`);
        continue;
      }

      const issues = [];
      if (jsx.includes('\\')) issues.push('contains backslashes in path');
      if (!jsx.includes('try {')) issues.push('missing try block');
      if (!jsx.includes('app.quit()')) issues.push('missing app.quit()');
      if (!jsx.includes('app.project.save')) issues.push('missing app.project.save');

      // Check layer names appear
      const layerNames = Object.keys(dummyText);
      const missingLayers = layerNames.filter(n => !jsx.includes(n));
      if (missingLayers.length) issues.push(`layer names missing from JSX: ${missingLayers.join(', ')}`);

      if (issues.length) {
        log('JSX', WARN, `${cfg.template_id} — generated but has issues`, issues.join(' | '));
      } else {
        log('JSX', PASS, `${cfg.template_id} — JSX generated OK (${jsx.length} chars, no backslashes, try/catch present)`);
        counters.jsx.pass++;
      }
    } catch (e) {
      log('JSX', FAIL, `${cfg.template_id} — generateJsx threw`, e.message);
    }
  }
}

// ─── SECTION 7: Full Render Test ─────────────────────────────────────────────
async function auditFullRender() {
  sep('SECTION 7 — Full Render Test (first passing config, no images)');

  const candidate = validConfigs.find(v => v.cfg.render_comp);
  if (!candidate) {
    log('RENDER', WARN, 'No valid config with render_comp found — skipping full render');
    return;
  }

  counters.fullRender.total++;
  log('RENDER', WARN, `Running full render for: ${candidate.cfg.template_id} (may take several minutes)`);

  let renderVideo;
  try {
    ({ renderVideo } = require('../services/aeRender'));
  } catch (e) {
    log('RENDER', FAIL, 'Could not require aeRender.js', e.message);
    return;
  }

  const { createJob, updateJob } = require('../services/jobStore');
  const jobId = `audit_${Date.now()}`;
  createJob(jobId);

  // Build dummy text
  const dummyText = {};
  const cfg = candidate.cfg;
  if (cfg.text_map) {
    for (const v of Object.values(cfg.text_map)) dummyText[v] = ['Audit'];
  } else if (cfg.layers) {
    cfg.layers.filter(l => l.type === 'text').forEach(l => { dummyText[l.name] = 'Audit'; });
  }

  const start = Date.now();
  try {
    const output = await renderVideo(jobId, cfg, dummyText, [], {}, null, 0, 5, 0, false);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    if (output && fileExists(output)) {
      log('RENDER', PASS, `${cfg.template_id} — render complete in ${elapsed}s`, `Output: ${output} (${mbSize(output)})`);
      counters.fullRender.pass++;
    } else {
      log('RENDER', FAIL, `${cfg.template_id} — renderVideo returned but output not found`, `elapsed: ${elapsed}s`);
    }
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log('RENDER', FAIL, `${cfg.template_id} — renderVideo threw after ${elapsed}s`, e.message);
  }
}

// ─── SECTION 8: API Routes Check ─────────────────────────────────────────────
async function auditApiRoutes() {
  sep('SECTION 8 — API Routes Check');

  const PORT = process.env.PORT || 3001;
  const BASE = `http://localhost:${PORT}`;

  // Use http module (built-in, no axios needed)
  const http = require('http');
  function httpGet(url) {
    return new Promise((resolve) => {
      const req = http.get(url, { timeout: 5000 }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', (e) => resolve({ status: null, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: null, error: 'timeout' }); });
    });
  }
  function httpPost(url, data) {
    return new Promise((resolve) => {
      const body = JSON.stringify(data);
      const opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 5000,
      };
      const u = new URL(url);
      opts.hostname = u.hostname; opts.port = u.port; opts.path = u.pathname;
      const req = http.request(opts, (res) => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => resolve({ status: res.statusCode, body: b }));
      });
      req.on('error', (e) => resolve({ status: null, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: null, error: 'timeout' }); });
      req.write(body);
      req.end();
    });
  }

  const routes = [
    { label: 'GET /api/health', method: 'GET', url: `${BASE}/api/health` },
    { label: 'GET /api/render/templates', method: 'GET', url: `${BASE}/api/render/templates` },
    { label: 'POST /api/render/start (malformed)', method: 'POST', url: `${BASE}/api/render/start`, body: {} },
  ];

  for (const route of routes) {
    counters.api.total++;
    try {
      const res = route.method === 'POST'
        ? await httpPost(route.url, route.body)
        : await httpGet(route.url);

      if (res.error) {
        log('API', FAIL, `${route.label} — connection error`, res.error);
      } else if (res.status >= 200 && res.status < 500) {
        // 4xx on malformed POST is acceptable (route exists)
        log('API', PASS, `${route.label} — responded with HTTP ${res.status}`);
        counters.api.pass++;

        // Extra: count templates
        if (route.label.includes('templates')) {
          try {
            const j = JSON.parse(res.body);
            log('API', PASS, `Templates endpoint returned ${(j.templates || []).length} template(s)`);
          } catch {}
        }
      } else {
        log('API', FAIL, `${route.label} — HTTP ${res.status}`, res.body.slice(0, 200));
      }
    } catch (e) {
      log('API', FAIL, `${route.label} — threw`, e.message);
    }
  }
}

// ─── SECTION 9: Frontend Build ────────────────────────────────────────────────
function auditFrontendBuild() {
  sep('SECTION 9 — Frontend Build Check');
  counters.frontend.total++;

  const frontendDir = path.join(ROOT, '../frontend');
  const pkgJson = path.join(frontendDir, 'package.json');

  if (!fileExists(pkgJson)) {
    log('FRONTEND', FAIL, 'frontend/package.json not found', frontendDir);
    return;
  }
  log('FRONTEND', PASS, 'frontend/package.json exists');

  log('FRONTEND', WARN, 'Running npm run build in frontend (may take 30-60s)...');
  try {
    const r = spawnSync('npm', ['run', 'build'], {
      cwd: frontendDir,
      timeout: 120000,
      encoding: 'utf8',
      shell: true,
    });

    const combined = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0) {
      log('FRONTEND', PASS, 'npm run build succeeded');
      counters.frontend.pass++;

      // Check dist folder
      const distDir = path.join(frontendDir, 'dist');
      if (fileExists(distDir)) {
        log('FRONTEND', PASS, 'dist/ folder created by build');
      } else {
        log('FRONTEND', WARN, 'Build succeeded but no dist/ folder found');
      }
    } else {
      // Extract first error line
      const errLine = combined.split('\n').find(l => l.toLowerCase().includes('error')) || combined.slice(0, 400);
      log('FRONTEND', FAIL, 'npm run build failed', errLine);
    }

    // Log any warnings about missing imports
    const warnLines = combined.split('\n').filter(l => l.toLowerCase().includes('warn') || l.toLowerCase().includes('missing'));
    if (warnLines.length) {
      log('FRONTEND', WARN, `Build produced ${warnLines.length} warning(s)`, warnLines.slice(0, 5).join(' | '));
    }
  } catch (e) {
    log('FRONTEND', FAIL, 'npm run build threw or timed out', e.message);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n====================================================');
  console.log('  MotionAI Full System Audit — Starting');
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('====================================================\n');

  auditEnvironment();
  auditConfigs();
  auditTemplates();
  auditFFmpeg();
  auditAerender();
  auditJsxGenerator();
  await auditFullRender();
  await auditApiRoutes();
  auditFrontendBuild();

  // Print summary to console now (writeReport called on process exit)
  console.log(buildSummary());
}

main().catch((e) => {
  log('MAIN', FAIL, 'main() threw an unhandled error', e.message);
  process.exit(1);
});
