const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const previewGenerator = require('../services/previewGenerator');
const frameExtractor = require('../services/frameExtractor');
const aiVisionAnalyzer = require('../services/aiVisionAnalyzer');
const dumpRunner = require('../services/dumpRunner');
const crossReference = require('../services/crossReference');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});
const upload = multer({ storage });

router.post('/', upload.fields([{ name: 'aepFile', maxCount: 1 }, { name: 'previewFile', maxCount: 1 }]), async (req, res) => {
  const jobId = uuidv4();
  const startTime = Date.now();
  const logFile = path.join(__dirname, '..', 'temp', `configgen_${jobId}.log`);
  
  function log(msg) {
    console.log(`[ConfigGen ${jobId}] ${msg}`);
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  }

  try {
    if (!req.files || !req.files.aepFile) {
      return res.status(400).json({ success: false, message: 'Missing aepFile' });
    }

    let aepFilePath = req.files.aepFile[0].path;
    let previewFilePath = req.files.previewFile ? req.files.previewFile[0].path : null;
    const compName = req.body.compName || null;

    log(`Started config generation for ${req.files.aepFile[0].originalname}`);

    // Step 2: Generate preview
    if (!previewFilePath) {
      log('No preview provided. Attempting preview generation...');
      try {
        previewFilePath = await previewGenerator.generate(aepFilePath, compName);
        if (previewFilePath) {
          log(`Preview generated at ${previewFilePath}`);
        } else {
          log('Skipped preview generation (no comp name)');
        }
      } catch (e) {
        log('[ConfigGen] Preview generation failed, continuing without preview');
        previewFilePath = null;
      }
    }

    // Step 3: Extract frames
    log('Extracting frames from preview...');
    const frames = previewFilePath ? await frameExtractor.extract(previewFilePath, jobId) : [];
    log(`Extracted ${frames.length} frames.`);

    // Step 4: AI Vision
    log('Running AI Vision Analysis...');
    let visionData = { foundTexts: [], imageRegionCount: 0, estimatedSceneCount: 0 };
    if (frames.length > 0) {
      visionData = await aiVisionAnalyzer.analyze(frames);
      log(`AI Vision found ${visionData.foundTexts ? visionData.foundTexts.length : 0} texts and ${visionData.imageRegionCount || 0} image regions.`);
    } else {
      log('Skipped AI Vision Analysis because no preview frames exist.');
    }

    // Step 5: Deep Dump
    log('Running ExtendScript deep dump on template...');
    const aeDump = await dumpRunner.run(aepFilePath);
    log(`Dump complete. Found ${aeDump.totalComps} comps.`);

    // Step 6: Cross Reference
    log('Cross-referencing data to build config...');
    const result = await crossReference.process(visionData, aeDump);
    log(`Config built with ${result.confidence}% confidence.`);

    // Step 7: Save to configs folder
    const configDir = path.join(__dirname, '..', 'configs');
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    
    const configId = result.config.template_id || `template_${Date.now()}`;
    result.config.template_id = configId;

    const finalConfigPath = path.join(configDir, `${configId}.json`);
    fs.writeFileSync(finalConfigPath, JSON.stringify(result.config, null, 2));
    log(`Saved config to ${finalConfigPath}`);

    const endTime = Date.now();

    res.json({
      success: true,
      configId: configId,
      config: result.config,
      confidence: result.confidence,
      flaggedFields: result.flaggedFields,
      processingTime: Math.round((endTime - startTime) / 1000)
    });

  } catch (error) {
    log(`ERROR: ${error.message}`);
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
