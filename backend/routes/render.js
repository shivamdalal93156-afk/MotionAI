// const express = require('express');
// const router = express.Router();
// const { v4: uuidv4 } = require('uuid');
// const fs = require('fs');
// const path = require('path');

// const { 
//   loadTemplateConfig, applyTextFallbacks, getHiddenLayerNames,
//   getAllTemplateSummaries
// } = require('../services/templateManifest');
// const { renderVideo } = require('../services/aeRender');
// const { createJob, updateJob } = require('../services/jobStore');

// router.get('/templates', (req, res) => {
//   res.json({ success: true, templates: getAllTemplateSummaries() });
// });

// router.get('/manifest/:templateId', (req, res) => {
//   try {
//     const config = loadTemplateConfig(req.params.templateId);
//     res.json({ success: true, template_id: config.template_id, name: config.name, manifest: config });
//   } catch (error) { res.status(404).json({ success: false, message: 'Template not found' }); }
// });

// router.post('/start', (req, res) => {
//   const { template_id, textData, imageData, strategy } = req.body;
//   if (!template_id || !textData) return res.status(400).json({ success: false, message: 'Missing data' });

//   const newConfigPath = path.join(__dirname, '../configs', `${template_id}.json`);
//   let config, hiddenLayerNames = [];
  
//   if (fs.existsSync(newConfigPath)) {
//     config = JSON.parse(fs.readFileSync(newConfigPath, 'utf8'));
//   } else {
//     config = loadTemplateConfig(template_id);
//     hiddenLayerNames = getHiddenLayerNames(config, textData);
//   }

//   const jobId = uuidv4();
//   createJob(jobId);

//   (async () => {
//     try {
//       updateJob(jobId, { status: 'processing', progress: 10, message: 'Preparing array-based payload...' });

//       // 🚀 ANTIGRAVITY FIX: Array-Based Mapping to prevent duplicate layer overwrites
//       const chunkFinalTextData = {};
//       let maxSceneNum = 1;

//       if (config.text_map) {
//         const orderedKeys = Object.keys(config.text_map).sort((a, b) => {
//           const mA = a.match(/^scene(\d+)_(\d+)$/);
//           const mB = b.match(/^scene(\d+)_(\d+)$/);
//           if (!mA || !mB) return 0;
//           if (Number(mA[1]) !== Number(mB[1])) return Number(mA[1]) - Number(mB[1]);
//           return Number(mA[2]) - Number(mB[2]);
//         });

//         orderedKeys.forEach((frontendKey) => {
//           const aeLayerName = config.text_map[frontendKey];
//           if (!chunkFinalTextData[aeLayerName]) chunkFinalTextData[aeLayerName] = [];
          
//           const val = textData[frontendKey];
//           if (val && val.trim() !== '') {
//              chunkFinalTextData[aeLayerName].push(val);
//              const sNum = parseInt(frontendKey.match(/^scene(\d+)/)[1], 10);
//              if (sNum > maxSceneNum) maxSceneNum = sNum;
//           } else {
//              chunkFinalTextData[aeLayerName].push(" ");
//           }
//         });
//       } else {
//         Object.assign(chunkFinalTextData, textData);
//       }

//       // Automatically trims the video duration to the highest scene used
//       let targetDuration = config.scene_outpoints ? config.scene_outpoints[`scene${maxSceneNum}`] : null;

//       await renderVideo(jobId, config, chunkFinalTextData, hiddenLayerNames, imageData || {}, strategy, 0, targetDuration, 0, false);
      
//     } catch (error) {
//       updateJob(jobId, { status: 'error', progress: 0, message: `Render failed: ${error.message}` });
//     }
//   })();

//   res.json({ success: true, jobId, message: 'Render job queued' });
// });

// module.exports = router;
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const { 
  loadTemplateConfig, applyTextFallbacks, getHiddenLayerNames,
  getAllTemplateSummaries
} = require('../services/templateManifest');
const { renderVideo } = require('../services/aeRender');
const { createJob, updateJob } = require('../services/jobStore');

router.get('/templates', (req, res) => {
  res.json({ success: true, templates: getAllTemplateSummaries() });
});

router.get('/manifest/:templateId', (req, res) => {
  try {
    const config = loadTemplateConfig(req.params.templateId);
    res.json({ success: true, template_id: config.template_id, name: config.name, manifest: config });
  } catch (error) { res.status(404).json({ success: false, message: 'Template not found' }); }
});

router.post('/start', (req, res) => {
  const { template_id, textData, imageData, strategy } = req.body;
  if (!template_id || !textData) return res.status(400).json({ success: false, message: 'Missing data' });

  const newConfigPath = path.join(__dirname, '../configs', `${template_id}.json`);
  let config, hiddenLayerNames = [];
  
  if (fs.existsSync(newConfigPath)) {
    config = JSON.parse(fs.readFileSync(newConfigPath, 'utf8'));
  } else {
    config = loadTemplateConfig(template_id);
    hiddenLayerNames = getHiddenLayerNames(config, textData);
  }

  const jobId = uuidv4();
  createJob(jobId);

  (async () => {
    try {
      updateJob(jobId, { status: 'processing', progress: 5, message: 'Analyzing script length...' });

      // 1. Gather all submitted words into a flat array
      let allWords = [];
      let templateSchemaKeys = [];

      if (config.text_map) {
        templateSchemaKeys = Object.keys(config.text_map).sort((a, b) => {
          const mA = a.match(/^scene(\d+)_(\d+)$/);
          const mB = b.match(/^scene(\d+)_(\d+)$/);
          if (!mA || !mB) return 0;
          if (Number(mA[1]) !== Number(mB[1])) return Number(mA[1]) - Number(mB[1]);
          return Number(mA[2]) - Number(mB[2]);
        });

        // If the frontend passed a raw script, split it. Otherwise, collect from scene boxes.
        if (textData.__script__) {
          allWords = textData.__script__.trim().split(/\s+/).filter(w => w.length > 0);
        } else {
          templateSchemaKeys.forEach(k => {
            if (textData[k] && textData[k].trim() !== '') allWords.push(textData[k]);
          });
        }
      }

      if (allWords.length === 0) allWords = [" "];

      // 2. Divide words into template-sized chunks
      const MAX_WORDS = templateSchemaKeys.length || 34;
      const chunks = [];
      for (let i = 0; i < allWords.length; i += MAX_WORDS) {
        chunks.push(allWords.slice(i, i + MAX_WORDS));
      }

      const isMultipart = chunks.length > 1;

      // 3. Render loop (Stitching Engine)
      for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c];
        updateJob(jobId, { 
          status: 'processing', 
          progress: 10 + Math.floor((c / chunks.length) * 80), 
          message: `Rendering part ${c + 1} of ${chunks.length}...` 
        });

        const chunkFinalTextData = {};
        let maxSceneNum = 1;

        if (config.text_map) {
          // Map this specific chunk safely into arrays to prevent AE layer overwrites
          for (let i = 0; i < templateSchemaKeys.length; i++) {
            const frontendKey = templateSchemaKeys[i];
            const aeLayerName = config.text_map[frontendKey];
            
            if (!chunkFinalTextData[aeLayerName]) chunkFinalTextData[aeLayerName] = [];

            if (i < chunk.length && chunk[i] && chunk[i].trim() !== '') {
              chunkFinalTextData[aeLayerName].push(chunk[i]);
              const sNum = parseInt(frontendKey.match(/^scene(\d+)/)[1], 10);
              if (sNum > maxSceneNum) maxSceneNum = sNum;
            } else {
              chunkFinalTextData[aeLayerName].push(" ");
            }
          }
        } else {
          Object.assign(chunkFinalTextData, textData);
        }

        // Trim the video for this specific chunk so we don't render empty scenes
        let targetDuration = config.scene_outpoints ? config.scene_outpoints[`scene${maxSceneNum}`] : null;

        await renderVideo(
          jobId, 
          config, 
          chunkFinalTextData, 
          hiddenLayerNames, 
          imageData || {}, 
          strategy, 
          0, 
          targetDuration, 
          c, 
          isMultipart
        );
      }


      // If isMultipart is true, aeRender.js automatically triggered FFmpeg stitching
      // 🚀 NEW LOGIC: Stitch the lightweight MP4s together instantly
      if (isMultipart) {
        updateJob(jobId, { status: 'processing', progress: 95, message: 'Stitching MP4 parts together...' });
        const { stitchMp4Videos } = require('../services/aeRender');
        await stitchMp4Videos(jobId, chunks.length);
      }
      updateJob(jobId, { status: 'done', progress: 100, message: 'Render and Stitching complete!', outputUrl: `/outputs/${jobId}.mp4` });

    } catch (error) {
      updateJob(jobId, { status: 'error', progress: 0, message: `Render failed: ${error.message}` });
    }
  })();

  res.json({ success: true, jobId, message: 'Render job queued' });
});

module.exports = router;