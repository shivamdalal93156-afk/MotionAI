const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const { 
  loadTemplateConfig,
  validateTextData,
  applyTextFallbacks,
  getHiddenLayerNames,
  buildAIPrompt,
  getRenderStrategy,
  getAllTemplateSummaries,
  configToManifest
} = require('../services/templateManifest');

const { renderVideo } = require('../services/aeRender');
const { createJob, updateJob } = require('../services/jobStore');

// GET /api/render/templates
router.get('/templates', (req, res) => {
  try {
    const templates = getAllTemplateSummaries();
    return res.json({ success: true, templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return res.status(500).json({ success: false, message: 'Failed to load templates' });
  }
});

// GET /api/render/manifest/:templateId
router.get('/manifest/:templateId', (req, res) => {
  try {
    const config = loadTemplateConfig(req.params.templateId);
    return res.json({ success: true, template_id: config.template_id, name: config.name, manifest: config, emptyData: {} });
  } catch (error) {
    console.error(`Error loading manifest for ${req.params.templateId}:`, error);
    return res.status(404).json({ success: false, message: 'Template not found' });
  }
});

// GET /api/render/manifest
// Defaults to kinetic_001 for backwards compatibility
router.get('/manifest', (req, res) => {
  try {
    const config = loadTemplateConfig('kinetic_001');
    return res.json({ success: true, template_id: config.template_id, name: config.name, manifest: config, emptyData: {} });
  } catch (error) {
    console.error('Error loading default manifest:', error);
    return res.status(500).json({ success: false, message: 'Failed to load default template' });
  }
});

// GET /api/render/ai-prompt/:templateId
router.get('/ai-prompt/:templateId', (req, res) => {
  try {
    const config = loadTemplateConfig(req.params.templateId);
    // Optional: user query parameter could be passed for userScript
    const userScript = req.query.script || "[User script placeholder]";
    const prompt = buildAIPrompt(config, userScript);
    return res.json({ success: true, prompt });
  } catch (error) {
    console.error(`Error loading API prompt for ${req.params.templateId}:`, error);
    return res.status(404).json({ success: false, message: 'Template not found' });
  }
});

// POST /api/render/start
// POST /api/render/start
router.post('/start', (req, res) => {
  try {
    const { template_id, textData, imageData, strategy } = req.body;

    if (!template_id || !textData) {
      return res.status(400).json({ success: false, message: 'template_id and textData are required' });
    }

    const newConfigPath = path.join(__dirname, '../configs', `${template_id}.json`);
    let config, finalTextData, hiddenLayerNames;
    const finalImageData = imageData || {};

    if (fs.existsSync(newConfigPath)) {
      config = JSON.parse(fs.readFileSync(newConfigPath, 'utf8'));
      hiddenLayerNames = [];
      if (!config.comp_name) config.comp_name = 'MAIN_COMP';
    } else {
      config = loadTemplateConfig(template_id);
      if (strategy !== 'preview' && config.text_map) {
        const validation = validateTextData(config, textData);
        if (!validation.valid) {
          return res.status(400).json({
            success: false,
            message: 'Validation failed',
            missing: validation.missing,
            tooLong: validation.tooLong
          });
        }
      }
      finalTextData = applyTextFallbacks(config, textData);
      hiddenLayerNames = getHiddenLayerNames(config, textData);
    }

    const jobId = uuidv4();
    createJob(jobId);

    (async () => {
      try {
        updateJob(jobId, { status: 'processing', progress: 5, message: 'Preparing rendering sequences...' });

        let templateSchemaKeys = [];
        if (config.text_map) {
          templateSchemaKeys = Object.keys(config.text_map);
        }

        const MAX_WORDS = templateSchemaKeys.length || 34;

        const allWords = [];
        if (config.text_map) {
          const orderedKeys = Object.keys(textData).filter(k => /^scene(\d+)_(\d+)$/.test(k));
          orderedKeys.sort((a, b) => {
            const [, a1, a2] = a.match(/^scene(\d+)_(\d+)$/).map(Number);
            const [, b1, b2] = b.match(/^scene(\d+)_(\d+)$/).map(Number);
            if (a1 !== b1) return a1 - b1;
            return a2 - b2;
          });
          for (const reqKey of orderedKeys) {
            const word = textData[reqKey];
            if (typeof word === 'string' && word.trim() !== '') allWords.push(word);
          }
        } else {
          for (const val of Object.values(textData)) {
            if (typeof val === 'string' && val.trim() !== '') allWords.push(val);
          }
        }

        const chunks = [];
        for (let i = 0; i < Math.max(1, allWords.length); i += MAX_WORDS) {
          chunks.push(allWords.slice(i, i + MAX_WORDS));
        }

        const outputParts = [];

        for (let c = 0; c < chunks.length; c++) {
          const chunk = chunks[c];
          const chunkFinalTextData = {};
          let maxSceneNum = 1;

          if (config.text_map) {
            for (let i = 0; i < templateSchemaKeys.length; i++) {
              const frontendKey = templateSchemaKeys[i];
              const aeLayerName = config.text_map[frontendKey];
              if (i < chunk.length && chunk[i] !== undefined && chunk[i] !== null) {
                chunkFinalTextData[aeLayerName] = chunk[i];
                const match = frontendKey.match(/^scene(\d+)/);
                if (match) {
                  const sNum = parseInt(match[1], 10);
                  if (sNum > maxSceneNum) maxSceneNum = sNum;
                }
              } else {
                chunkFinalTextData[aeLayerName] = " ";
              }
            }
          } else {
            Object.assign(chunkFinalTextData, finalTextData || textData);
          }

          let targetDuration = null;
          if (config.scene_outpoints) {
            targetDuration = config.scene_outpoints[`scene${maxSceneNum}`] || null;
          }

          const isMultipart = chunks.length > 1;
          if (isMultipart) {
            updateJob(jobId, { status: 'processing', progress: 10 + (c / chunks.length * 70), message: `Rendering part ${c + 1} of ${chunks.length}...` });
          }

          const partPath = await renderVideo(jobId, config, chunkFinalTextData, hiddenLayerNames, finalImageData, strategy, 0, targetDuration, c, isMultipart);
          outputParts.push(partPath);
        }

        if (chunks.length > 1) {
          updateJob(jobId, { status: 'processing', progress: 90, message: 'Stitching final video sequence...' });

          const concatListPath = path.join(__dirname, '../outputs', `concat_list_${jobId}.txt`);
          let listContent = "";
          for (const part of outputParts) {
            listContent += `file '${part.replace(/\\/g, '/')}'\n`;
          }
          fs.writeFileSync(concatListPath, listContent, 'utf8');

          const finalOutput = path.join(__dirname, '../outputs', `${jobId}.mp4`);
          const ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${finalOutput}"`;

          try {
            await execAsync(ffmpegCmd);
          } catch (err) {
            console.error(`[Job ${jobId}] FFmpeg Concat error:`, err);
            updateJob(jobId, { status: 'error', progress: 0, message: `Video stitching failed: ${err.message}` });
            return;
          }

          try {
            if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
            for (const part of outputParts) {
              if (fs.existsSync(part)) fs.unlinkSync(part);
            }
          } catch(e) {
            console.error(`[Job ${jobId}] Cleanup error:`, e);
          }

          updateJob(jobId, { status: 'done', progress: 100, message: 'Render complete!', outputUrl: `/outputs/${jobId}.mp4` });
        }

      } catch (error) {
        console.error(`[Job ${jobId}] Render failed:`, error);
        updateJob(jobId, { status: 'error', progress: 0, message: `Render failed: ${error.message}` });
      }
    })();

    return res.json({ success: true, jobId, message: 'Render job queued' });

  } catch (error) {
    console.error('Error starting render:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;