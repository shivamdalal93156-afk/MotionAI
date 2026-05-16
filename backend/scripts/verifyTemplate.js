'use strict';

/**
 * MotionAI — Template Verification Script
 *
 * Usage:
 *   node backend/scripts/verifyTemplate.js "Template Name"            — add/merge
 *   node backend/scripts/verifyTemplate.js "Template Name" --rebuild  — wipe & re-add
 *   node backend/scripts/verifyTemplate.js "Template Name" --delete   — remove completely
 *
 * Run ONLY after a render has been tested and confirmed correct.
 * Never run on an untested config — wrong data corrupts the KB.
 */

const fs   = require('fs');
const path = require('path');

const { updateKnowledgeBase, rebuildKnowledgeBase, deleteFromKnowledgeBase } =
  require('../services/knowledgeBase');

const templateName = process.argv[2];
const mode         = process.argv[3] || '';  // --rebuild | --delete | (empty = merge)

if (!templateName) {
  console.error('\n❌  Usage: node backend/scripts/verifyTemplate.js "Template Name" [--rebuild|--delete]\n');
  process.exit(1);
}

const templatesDir = path.resolve(__dirname, '..', 'templates');
const templateDir  = path.join(templatesDir, templateName);
const configPath   = path.join(templateDir, 'config.json');
const scanLogPath  = path.join(templateDir, 'scan.log');

if (!fs.existsSync(templateDir)) {
  console.error(`\n❌  Template folder not found: ${templateDir}\n`);
  process.exit(1);
}

// ─── DELETE mode ──────────────────────────────────────────────────────────────

if (mode === '--delete') {
  console.log(`\n🗑️   Delete mode: "${templateName}"`);
  console.log(`    This will remove the template and all its exclusive patterns from the KB.`);
  console.log(`    Patterns shared with other templates will be kept.\n`);

  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question(`⚠️   Are you sure you want to delete "${templateName}" from the KB? (yes/no): `, (answer) => {
    rl.close();
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('\n⛔  Cancelled. Knowledge base not changed.\n');
      process.exit(0);
    }
    try {
      const result = deleteFromKnowledgeBase(templateName);
      if (result.error) {
        console.error(`\n❌  ${result.error}\n`);
        process.exit(1);
      }
      console.log(`\n✅  "${templateName}" deleted from knowledge base.`);
      console.log(`    Remaining templates: ${result.totalTemplates}`);
      console.log(`    KB file: ${result.kbPath}\n`);
    } catch (e) {
      console.error(`\n❌  Failed: ${e.message}\n`);
      process.exit(1);
    }
  });
  return;
}

// ─── MERGE / REBUILD mode — need config ───────────────────────────────────────

if (!fs.existsSync(configPath)) {
  console.error(`\n❌  config.json not found in: ${templateDir}`);
  console.error(`    Write and test the config first, then run this script.\n`);
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.error(`\n❌  config.json is invalid JSON: ${e.message}\n`);
  process.exit(1);
}

let scanLog = null;
if (fs.existsSync(scanLogPath)) {
  scanLog = fs.readFileSync(scanLogPath, 'utf8');
  console.log(`\n📋  Scan log found — skip patterns will be extracted`);
} else {
  console.log(`\n⚠️   No scan.log found — patterns will be config-only`);
  console.log(`    Save scan output to: ${scanLogPath} for richer pattern data`);
}

const modeLabel = mode === '--rebuild' ? 'REBUILD (wipe & re-add)' : 'MERGE (add new patterns)';

console.log(`\n🔍  Mode: ${modeLabel}`);
console.log(`    Template:      "${templateName}"`);
console.log(`    Config:        ${configPath}`);
console.log(`    Text layers:   ${(config.textLayers        || []).length}`);
console.log(`    Image layers:  ${(config.imageLayers       || []).length}`);
console.log(`    Expr controls: ${(config.expressionControls || []).length}`);

if (mode === '--rebuild') {
  console.log(`\n⚠️   Rebuild will DELETE all patterns exclusive to "${templateName}" and re-add from current config.`);
}

const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question(`\n✅  Confirm? (yes/no): `, (answer) => {
  rl.close();

  if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
    console.log('\n⛔  Cancelled. Knowledge base not updated.\n');
    process.exit(0);
  }

  try {
    const result = mode === '--rebuild'
      ? rebuildKnowledgeBase(templateName, config, scanLog)
      : updateKnowledgeBase(templateName, config, scanLog);

    console.log(`\n✅  Knowledge base updated! (${result.mode})`);
    console.log(`    Template: ${result.templateName}`);
    console.log(`    New patterns added:`);
    console.log(`      Solid replace:   ${result.newPatterns.solid}`);
    console.log(`      Image/comp:      ${result.newPatterns.image}`);
    console.log(`      Text comps:      ${result.newPatterns.text}`);
    console.log(`      Expr controls:   ${result.newPatterns.expression}`);
    console.log(`      Skip (internal): ${result.newPatterns.skip}`);
    console.log(`    Total verified templates: ${result.totalTemplates}`);
    console.log(`    KB file: ${result.kbPath}\n`);

  } catch (e) {
    console.error(`\n❌  Failed: ${e.message}\n`);
    process.exit(1);
  }
});