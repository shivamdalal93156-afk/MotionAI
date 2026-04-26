const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function run(aepFile) {
  // Kill any existing AE processes before starting
  try {
    execSync('taskkill /f /im afterfx.com /t', { stdio: 'ignore' });
    execSync('taskkill /f /im AfterFX.exe /t', { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 2000)); // wait 2 seconds for cleanup
  } catch(e) {
    // Ignore errors — process might not exist
  }

  return new Promise((resolve, reject) => {
    try {
      const fixedAepPath = aepFile.replace(/\\/g, '/');
      const tempDir = path.join(__dirname, '..', 'temp');
      
      // Make sure temp dir exists
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const jobId = Date.now().toString(); 
      const outputJsonPath = path.join(tempDir, `dump_${jobId}.json`).replace(/\\/g, '/');
      const jsxPath = path.join(tempDir, `runDump_${jobId}.jsx`).replace(/\\/g, '/');

      // 1. Read base JSX
      const baseJsxPath = path.join(__dirname, 'deepExtractor.jsx');
      let jsxContent = fs.readFileSync(baseJsxPath, 'utf8');

      // Inject project opening logic and set output path
      jsxContent = jsxContent.replace(
        'var OUT_PATH = "{{OUTPUT_PATH}}";',
        `var OUT_PATH = "${outputJsonPath}";\n` +
        `var projFile = new File("${fixedAepPath}");\n` +
        `if (projFile.exists) { app.open(projFile); }\n`
      );

      // Inject project close before quit
      jsxContent = jsxContent.replace(
        'app.quit();',
        'if (app.project) app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);\napp.quit();'
      );

      // Write JSX to temp file
      fs.writeFileSync(jsxPath, jsxContent, 'utf8');
      if (fs.existsSync(outputJsonPath)) fs.unlinkSync(outputJsonPath);

      // 1. Get the AE path and FORCE it to use the console executable (.com)
      let aePath = process.env.AE_EXECUTABLE || 'C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/afterfx.exe';
      const consoleAePath = aePath.replace('afterfx.exe', 'afterfx.com');

      console.log(`[DumpRunner] Running AE Console: "${consoleAePath}" -r "${jsxPath}"`);

      // 2. Spawn the process
      const proc = spawn(consoleAePath, ['-r', jsxPath]);

      let stdoutData = '';
      let stderrData = '';

      proc.stdout.on('data', (data) => {
          stdoutData += data.toString();
          // Print AE output directly to terminal so we can see JSX errors
          console.log(`[AE Console]: ${data.toString().trim()}`); 
      });

      proc.stderr.on('data', (data) => {
          stderrData += data.toString();
      });

      // 3. When the process naturally closes
      proc.on('close', (code) => {
          if (!fs.existsSync(outputJsonPath)) {
              console.error(`[DumpRunner] AE Exit Code: ${code}`);
              console.error(`[DumpRunner] AE Stderr: ${stderrData}`);
              return reject(new Error('Dump JSON not created. Check AE Console logs above for syntax errors inside the .jsx script.'));
          }

          try {
              // Read and parse the successfully created JSON
              const rawData = fs.readFileSync(outputJsonPath, 'utf8');
              const parsedData = JSON.parse(rawData);
              
              // Clean up temp files
              fs.unlinkSync(jsxPath);
              fs.unlinkSync(outputJsonPath);
              
              resolve(parsedData);
          } catch (e) {
              reject(new Error(`Failed to parse dump JSON: ${e.message}`));
          }
      });

      // Safety timeout: kill process if it hangs
      setTimeout(() => {
          proc.kill();
          reject(new Error('AE deep dump timed out after 3 minutes. Make sure app.quit() is in the JSX script.'));
      }, 180000);

    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { run };
