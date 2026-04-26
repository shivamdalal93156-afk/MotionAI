const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEMP_DIR = path.join(__dirname, '..', 'temp');

function extractCompNamesFromAep(aepPath) {
  try {
    // Read the binary .aep file as a buffer
    const buffer = fs.readFileSync(aepPath);
    const content = buffer.toString('latin1');
    
    const compNames = [];
    
    // AEP files store comp names preceded by specific binary markers
    // Search for readable ASCII strings between 3-60 chars long
    // that appear in the project structure
    const regex = /[\x20-\x7E]{3,60}/g;
    const matches = content.match(regex) || [];
    
    // Filter to likely comp names - they appear multiple times
    // and don't look like file paths or technical strings
    const frequency = {};
    matches.forEach(m => {
      const trimmed = m.trim();
      if (trimmed.length >= 3 && 
          !trimmed.includes('\\') &&
          !trimmed.includes('/') &&
          !trimmed.includes('.jsx') &&
          !trimmed.includes('.aep') &&
          !trimmed.startsWith('Adobe') &&
          !/^\d+$/.test(trimmed)) {
        frequency[trimmed] = (frequency[trimmed] || 0) + 1;
      }
    });
    
    // Sort by frequency - comp names appear more often in binary
    const sorted = Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(e => e[0]);
      
    return sorted;
  } catch(e) {
    console.log('[PreviewGen] Binary parse failed:', e.message);
    return [];
  }
}

async function getLongestCompName(aepPath) {
  // Step 1: Extract candidate names from binary
  const candidates = extractCompNamesFromAep(aepPath);
  console.log('[PreviewGen] Candidate comp names from binary:', candidates);
  
  // Step 2: Test each candidate with aerender
  for (const compName of candidates) {
    const works = await testComp(aepPath, compName);
    if (works) {
      console.log('[PreviewGen] Found render comp:', compName);
      return compName;
    }
  }
  
  // Step 3: Fall back to common names
  const commonNames = [
    'Render_HD', 'Main', 'Final', 'Master', 'Output',
    'Comp 1', 'HD', 'RENDER', 'MAIN', 'Render'
  ];
  for (const compName of commonNames) {
    const works = await testComp(aepPath, compName);
    if (works) return compName;
  }
  
  throw new Error('Could not find any valid comp in this .aep file');
}

async function testComp(aepPath, compName) {
  return new Promise((resolve) => {
    // Ensure temp dir exists
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    let stdout = '';
    const testOutput = path.join(TEMP_DIR, `comptest_[###].jpg`).replace(/\\/g, '/');
    const aerenderPath = process.env.AERENDER_PATH || 'aerender';
    const args = [
      '-project', aepPath,
      '-comp', compName,
      '-s', '0', '-e', '0',
      '-OMtemplate', 'JPEG',
      '-output', testOutput
    ];
    const proc = spawn(aerenderPath, args);
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    const timer = setTimeout(() => { proc.kill(); resolve(false); }, 30000);
    proc.on('close', () => {
      clearTimeout(timer);
      const failed = stdout.includes('No comp was found') || 
                     stdout.includes('aerender ERROR');
      resolve(!failed);
    });
  });
}

async function generate(aepFile, jobId) {
  return new Promise(async (resolve, reject) => {
    try {
      const aerenderPath = process.env.AERENDER_PATH;
      if (!aerenderPath) throw new Error('AERENDER_PATH not set in env');

      // 1. Get Render Comp Name
      const compName = await getLongestCompName(aepFile);
      if (!compName) throw new Error('No valid comp found in template');

      // 2. Render a single JPEG frame
      const outPath = path.join(TEMP_DIR, `preview_${jobId}.jpg`);
      const fixedAepPath = aepFile.replace(/\\/g, '/');
      const fixedOutPath = outPath.replace(/\\/g, '/');

      const args = [
        '-project', fixedAepPath,
        '-comp', compName,
        '-s', '0',
        '-e', '0',
        '-OMtemplate', 'JPEG',
        '-output', fixedOutPath
      ];

      console.log(`[Preview] Running aerender with args:`, args);

      const proc = spawn(aerenderPath, args);
      let stdoutData = '';
      let stderrData = '';

      proc.stdout.on('data', (data) => { stdoutData += data.toString(); });
      proc.stderr.on('data', (data) => { stderrData += data.toString(); });

      const timer = setTimeout(() => { proc.kill(); reject(new Error('Preview render timed out')); }, 120000);

      proc.on('close', (code) => {
        clearTimeout(timer);
        console.log('[Preview] aerender stdout:', stdoutData);
        console.log('[Preview] aerender stderr:', stderrData);
        console.log('[Preview] aerender exit code:', code);

        const possiblePaths = [
          outPath,
          outPath.replace('.jpg', '_00000.jpg'),
          outPath.replace('.jpg', '[00000].jpg')
        ];

        const actualPath = possiblePaths.find(p => fs.existsSync(p));
        if (actualPath) {
          resolve(actualPath);
        } else {
          reject(new Error('Preview file was not created by aerender'));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generate };
