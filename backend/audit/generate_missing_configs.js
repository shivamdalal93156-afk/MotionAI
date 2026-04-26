'use strict';
// Uses ONLY built-in Node modules — no node-fetch or form-data required.
const fs   = require('fs');
const path = require('path');
const http = require('http');

const TEMPLATES_DIR = path.join(__dirname, '../templates');

const ORPHANED = [
  'Kinetic Titles.aep',
  'Long Stories Scrolling Typography.aep',
  'Podcast Promo Slides.aep',
  'Real Estate.aep',
  'Travel Slideshow Template.aep',
];

// ── Minimal multipart/form-data builder ──────────────────────────────────────
function buildMultipart(filePath) {
  const boundary = '----NodeAuditBoundary' + Date.now();
  const filename  = path.basename(filePath);
  const fileData  = fs.readFileSync(filePath);

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="aepFile"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body   = Buffer.concat([header, fileData, footer]);

  return { boundary, body };
}

// ── HTTP POST (no third-party libs) ─────────────────────────────────────────
function postForm(filePath) {
  return new Promise((resolve) => {
    const { boundary, body } = buildMultipart(filePath);

    const options = {
      hostname: 'localhost',
      port:     3001,
      path:     '/api/generate-config',
      method:   'POST',
      headers: {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      // 10-minute timeout — deep dump + AI vision takes a while
      timeout: 600_000,
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try   { resolve({ ok: true,  status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ ok: false, status: res.statusCode, raw }); }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Request timed out after 10 minutes' });
    });

    req.on('error', (e) => resolve({ ok: false, error: e.message }));

    req.write(body);
    req.end();
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('=== MotionAI — Generating configs for orphaned templates ===\n');
  console.log(`Templates dir : ${TEMPLATES_DIR}`);
  console.log(`Templates     : ${ORPHANED.length}\n`);

  const results = [];

  for (const filename of ORPHANED) {
    const aepPath = path.join(TEMPLATES_DIR, filename);

    if (!fs.existsSync(aepPath)) {
      console.log(`⚠️  SKIP  : ${filename} — file not found on disk`);
      results.push({ filename, status: 'SKIP', reason: 'file not found' });
      continue;
    }

    const sizeMB = (fs.statSync(aepPath).size / 1_048_576).toFixed(1);
    console.log(`\n──────────────────────────────────────────`);
    console.log(`📂 Processing : ${filename}  (${sizeMB} MB)`);
    console.log(`   Uploading to /api/generate-config ...`);
    console.log(`   (this can take several minutes — AE deep dump + AI vision)`);

    const t0  = Date.now();
    const res = await postForm(aepPath);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);

    if (res.error) {
      console.log(`❌ ERROR  : ${filename} → ${res.error}  [${sec}s]`);
      results.push({ filename, status: 'ERROR', reason: res.error });
      continue;
    }

    if (!res.ok || !res.data || !res.data.success) {
      const msg = res.data?.message || res.raw || `HTTP ${res.status}`;
      console.log(`❌ FAIL   : ${filename} → ${msg}  [${sec}s]`);
      results.push({ filename, status: 'FAIL', reason: msg });
      continue;
    }

    const d = res.data;
    console.log(`✅ DONE   : ${filename}`);
    console.log(`   Config ID    : ${d.configId}`);
    console.log(`   Confidence   : ${d.confidence}%`);
    console.log(`   Text slots   : ${Object.keys(d.config?.text_map || {}).length}`);
    console.log(`   Image slots  : ${Object.keys(d.config?.image_map || {}).length}`);
    console.log(`   Time elapsed : ${sec}s`);
    results.push({ filename, status: 'PASS', configId: d.configId, confidence: d.confidence });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('══════════════════════════════════════════');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'SKIP' ? '⚠️ ' : '❌';
    const extra = r.status === 'PASS'
      ? `→ ${r.configId}  (${r.confidence}% confidence)`
      : `→ ${r.reason}`;
    console.log(`${icon}  ${r.filename.padEnd(42)} ${extra}`);
  }
  const passed = results.filter(r => r.status === 'PASS').length;
  console.log(`\n${passed}/${results.length} configs generated successfully.`);
  console.log('\nCheck backend/configs/ for the new JSON files.');
})();
