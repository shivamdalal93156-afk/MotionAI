const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');

const CONFIGS_DIR = path.join(__dirname, '../configs');
const TEMP_DIR = path.join(__dirname, '../temp');
const OUTPUTS_DIR = path.join(__dirname, '../outputs');
const AUDIT_MD = path.join(__dirname, 'RENDER_AUDIT.md');
const TEST_IMAGE_PATH = path.join(TEMP_DIR, 'test_image.jpg');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function post(url, data) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(data);
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr)
      }
    };
    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function runAudit() {
  console.log("Starting Render Audit...");
  
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  try {
    execSync(`ffmpeg -f lavfi -i color=red:size=100x100:duration=1 -frames:v 1 "${TEST_IMAGE_PATH}" -y`, { stdio: 'ignore' });
    console.log("Created test image at", TEST_IMAGE_PATH);
  } catch (err) {
    console.error("Failed to create test image with ffmpeg", err);
    return;
  }

  const configs = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json'));
  let mdReport = "# Render Audit Report\n\n";

  for (const configFile of configs) {
    const configPath = path.join(CONFIGS_DIR, configFile);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const templateId = config.template_id;
    
    console.log(`\n--- Auditing Template: ${templateId} ---`);
    mdReport += `## Template: ${templateId}\n`;

    const textData = {};
    if (config.text_map) {
      for (const k of Object.keys(config.text_map)) {
        textData[k] = `Test Text ${k}`;
      }
    }

    const imageData = {};
    if (config.image_map) {
      for (const k of Object.keys(config.image_map)) {
        imageData[k] = TEST_IMAGE_PATH; 
      }
    }

    const startTime = Date.now();
    let jobId = null;
    let finalStatus = 'unknown';
    let errorMessage = '';
    let mp4Size = 'N/A';
    let isVideoValid = false;
    let jobMessage = '';

    try {
      const startData = await post('http://localhost:3001/api/render/start', {
        template_id: templateId,
        textData,
        imageData,
        strategy: 'full_render'
      });
      
      if (!startData.success) {
        finalStatus = 'error';
        errorMessage = startData.message;
      } else {
        jobId = startData.jobId;
        console.log(`Job started: ${jobId}. Polling...`);
        
        while (true) {
          const pollData = await get(`http://localhost:3001/api/jobs/${jobId}`);
          if (pollData.job) {
            jobMessage = pollData.job.message;
            if (pollData.job.status === 'done') {
              finalStatus = 'done';
              break;
            } else if (pollData.job.status === 'error') {
              finalStatus = 'error';
              errorMessage = pollData.job.message;
              break;
            }
          }
          await sleep(5000);
        }
      }
    } catch (err) {
      finalStatus = 'error';
      errorMessage = err.message;
    }

    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Status: ${finalStatus}, Time: ${timeTaken}s`);

    if (finalStatus === 'done' && jobId) {
      const mp4Path = path.join(OUTPUTS_DIR, `${jobId}.mp4`);
      if (fs.existsSync(mp4Path)) {
        const stats = fs.statSync(mp4Path);
        mp4Size = (stats.size / (1024 * 1024)).toFixed(2) + ' MB';
        
        try {
          const probe = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of default=nw=1:nk=1 "${mp4Path}"`);
          if (probe.toString().trim() === 'video') {
            isVideoValid = true;
          }
        } catch (e) {
          isVideoValid = false;
        }
      }
    }

    mdReport += `- **Status**: ${finalStatus}\n`;
    mdReport += `- **Time Taken**: ${timeTaken} seconds\n`;
    mdReport += `- **MP4 Produced**: ${finalStatus === 'done' ? 'Yes' : 'No'}\n`;
    if (finalStatus === 'done') {
      mdReport += `- **MP4 Size**: ${mp4Size}\n`;
      mdReport += `- **Valid Video (ffprobe)**: ${isVideoValid ? 'Yes' : 'No'}\n`;
    }
    if (finalStatus === 'error') {
      mdReport += `- **Error**: ${errorMessage}\n`;
    }
    mdReport += `- **Last Message**: ${jobMessage}\n\n`;
  }

  fs.writeFileSync(AUDIT_MD, mdReport);
  console.log(`\nAudit complete. Report written to ${AUDIT_MD}`);
}

runAudit();
