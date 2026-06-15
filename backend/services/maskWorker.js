const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SUPPORTED_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const PYTHON_CMD = 'py'; // Windows launcher

function createAutomaticImageMask(inputFilePath) {
    return new Promise((resolve, reject) => {
        const ext = path.extname(inputFilePath).toLowerCase();

        if (!SUPPORTED_EXTS.includes(ext)) {
            console.log(`[MaskWorker] Skipped (unsupported ext): ${ext}`);
            return resolve(inputFilePath);
        }

        const outputFilePath = inputFilePath.replace(ext, '_masked.png');
        const scriptPath = path.join(__dirname, 'mask.py');

        const proc = spawn(PYTHON_CMD, [scriptPath, inputFilePath, outputFilePath]);

        let stderr = '';
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                console.error(`[MaskWorker] Failed (code ${code}): ${stderr}`);
                return resolve(inputFilePath); // fallback to original
            }
            if (fs.existsSync(outputFilePath)) {
                console.log(`[MaskWorker] Masked image saved: ${outputFilePath}`);
                return resolve(outputFilePath);
            }
            console.error(`[MaskWorker] Output file missing despite exit code 0`);
            resolve(inputFilePath);
        });

        proc.on('error', (err) => {
            console.error(`[MaskWorker] Spawn error: ${err.message}`);
            resolve(inputFilePath);
        });
    });
}

module.exports = { createAutomaticImageMask };