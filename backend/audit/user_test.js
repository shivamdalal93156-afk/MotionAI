const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');

const CONFIG_DIR = path.join(__dirname, '../configs');
const REPORT_FILE = path.join(__dirname, 'USER_TEST_REPORT.md');
const TEST_IMG = path.join(__dirname, 'test_img.jpg');

// 1. Create Test Image
try {
  execSync(`ffmpeg -f lavfi -i color=c=blue:size=200x200 -frames:v 1 "${TEST_IMG}" -y`, { stdio: 'ignore' });
} catch (e) {
  console.log('Failed to create test image, but continuing...');
}

// Helper for HTTP requests
function post(url, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    }).on('error', reject);
  });
}

const dirtyPatterns = [
  "This Is Way Too Long For Any Normal Video Template Slot And Should Either Get Truncated Or Cause An Error",
  "",
  "#@!$%^&*()",
  "नमस्ते 你好 مرحبا",
  "🔥💯🎬",
  "9999999",
  "<script>alert(1)</script>",
  "LINE1\nLINE2",
  "X",
  "HELLO WORLD"
];

async function runTest() {
  const configs = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.json'));
  let report = `# User Test Report\n\n`;
  fs.writeFileSync(REPORT_FILE, report);
  
  const summary = {};

  for (const file of configs) {
    const configPath = path.join(CONFIG_DIR, file);
    let config;
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e) { continue; }
    
    const tId = config.template_id;
    if (!tId) continue;
    
    summary[tId] = { A: '-', B: '-', C: '-' };

    const textSlots = config.text_map ? Object.keys(config.text_map) : [];
    const imageSlots = config.image_map ? Object.keys(config.image_map) : [];

    const cases = ['A_underfill', 'B_overfill', 'C_dirty'];

    for (const caseName of cases) {
      let textData = {};
      let imageData = {};

      if (caseName === 'A_underfill') {
        const halfText = Math.ceil(textSlots.length / 2);
        for (let i=0; i<textSlots.length; i++) {
          textData[textSlots[i]] = i < halfText ? `Test ${i}` : "";
        }
        const halfImg = Math.ceil(imageSlots.length / 2);
        for (let i=0; i<imageSlots.length; i++) {
          imageData[imageSlots[i]] = i < halfImg ? TEST_IMG : "";
        }
      } 
      else if (caseName === 'B_overfill') {
        for (let i=0; i<textSlots.length; i++) textData[textSlots[i]] = `Normal ${i}`;
        for (let i=0; i<imageSlots.length; i++) imageData[imageSlots[i]] = TEST_IMG;
        
        for (let i=0; i<5; i++) textData[`extra_text_${i}`] = "EXTRA";
        for (let i=0; i<5; i++) imageData[`extra_img_${i}`] = TEST_IMG;
      }
      else if (caseName === 'C_dirty') {
        for (let i=0; i<textSlots.length; i++) {
          textData[textSlots[i]] = dirtyPatterns[i % dirtyPatterns.length];
        }
        for (let i=0; i<imageSlots.length; i++) {
          imageData[imageSlots[i]] = TEST_IMG;
        }
      }

      const startTime = Date.now();
      let status = 'FAIL';
      let errorMsg = 'Unknown';
      let mp4Info = 'NO';
      let warnings = [];

      try {
        console.log(`Starting ${tId} - ${caseName}...`);
        const startRes = await post('http://localhost:3001/api/render/start', {
          template_id: tId,
          textData,
          imageData,
          strategy: 'full_render'
        });

        if (!startRes.success) {
          errorMsg = startRes.message || 'Failed to start job';
        } else {
          const jobId = startRes.jobId;
          
          let jobDone = false;
          let jobStatus = null;
          for (let p=0; p<120; p++) {
            await new Promise(r => setTimeout(r, 10000));
            try {
              const jobRes = await get(`http://localhost:3001/api/jobs/${jobId}`);
              if (jobRes.job) {
                if (jobRes.job.status === 'done') {
                  jobDone = true;
                  jobStatus = jobRes.job;
                  break;
                } else if (jobRes.job.status === 'error') {
                  jobDone = true;
                  jobStatus = jobRes.job;
                  errorMsg = jobStatus.message;
                  break;
                }
              }
            } catch(e) { }
          }

          if (!jobDone) {
            status = 'TIMEOUT';
            errorMsg = 'Hit 20 minute timeout';
          } else if (jobStatus && jobStatus.status === 'done') {
            status = 'PASS';
            errorMsg = 'None';
            if (jobStatus.outputUrl) {
              const mp4Path = path.join(__dirname, '..', jobStatus.outputUrl.replace(/^[\/\\]/, ''));
              if (fs.existsSync(mp4Path)) {
                const stat = fs.statSync(mp4Path);
                const mb = (stat.size / (1024*1024)).toFixed(2);
                let probeRes = 'probe failed';
                try {
                  const probe = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -of default=noprint_wrappers=1:nokey=1 "${mp4Path}"`).toString().trim().replace(/\r?\n/g, 'x');
                  probeRes = probe;
                } catch(e) {}
                mp4Info = `YES (${mb}MB) - Probe: [${probeRes}]`;
              }
            }
          }
        }
      } catch (e) {
        errorMsg = e.message;
      }

      const timeS = Math.round((Date.now() - startTime) / 1000);
      const caseLetter = caseName.split('_')[0];
      summary[tId][caseLetter] = status;

      const logEntry = `
Template: ${tId} | Case: ${caseName}
Status: ${status}
Time: ${timeS}s
MP4: ${mp4Info}
AE Warnings: ${warnings.length > 0 ? warnings.join(', ') : 'None'}
Error: ${errorMsg}
----------------------------------------
`;
      console.log(logEntry);
      fs.appendFileSync(REPORT_FILE, logEntry);
    }
  }

  let table = `\n### Summary Table\n\nTemplate | Case A | Case B | Case C\n--- | --- | --- | ---\n`;
  for (const tId of Object.keys(summary)) {
    table += `${tId} | ${summary[tId].A} | ${summary[tId].B} | ${summary[tId].C}\n`;
  }
  
  fs.appendFileSync(REPORT_FILE, table);
  console.log('Testing complete.');
}

runTest();
