const fs = require('fs');
const path = require('path');

const CONFIGS_DIR = path.join(__dirname, '../templates/configs');

/**
 * Loads and parses a template JSON configuration by ID.
 */
function loadTemplateConfig(templateId) {
  const configPath = path.join(CONFIGS_DIR, `${templateId}.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Template config not found: ${templateId}`);
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Validates text data against the config, checking requirement and word limits.
 */
function validateTextData(config, textData) {
  const missing = [];
  const tooLong = [];

  const textLayers = config.layers.filter(l => l.type === 'text');

  textLayers.forEach(layer => {
    const value = textData[layer.name];
    
    if (!value || value.trim() === '') {
      if (!layer.optional) {
        missing.push(layer.name);
      }
    } else {
      const wordCount = value.trim().split(/\s+/).length;
      if (layer.max_words && wordCount > layer.max_words) {
        tooLong.push({
          layer: layer.name,
          allowed: layer.max_words,
          actual: wordCount
        });
      }
    }
  });

  return {
    valid: missing.length === 0 && tooLong.length === 0,
    missing,
    tooLong
  };
}

/**
 * Applies fallbacks for empty text layers.
 * Modifies and returns a cloned textData object.
 */
function applyTextFallbacks(config, textData) {
  const resultData = { ...textData };
  const textLayers = config.layers.filter(l => l.type === 'text');

  textLayers.forEach(layer => {
    const value = resultData[layer.name];
    if (!value || value.trim() === '') {
      if (layer.optional && layer.fallback === 'default_text' && layer.default_text) {
        resultData[layer.name] = layer.default_text;
      }
    }
  });

  return resultData;
}

/**
 * Returns an array of layer names that should be hidden (opacity: 0)
 */
function getHiddenLayerNames(config, textData) {
  const hidden = [];
  
  config.layers.forEach(layer => {
    // If it's a text layer and text is missing
    if (layer.type === 'text') {
      const value = textData[layer.name];
      if (!value || value.trim() === '') {
        if (layer.optional && layer.fallback === 'hide') {
          hidden.push(layer.name);
        }
      }
    }
    // Note: Image layer hiding will be handled during generation if imageData map lacks the layer name
    // The instructions focus on text fallback, but if image is optional, we might hide it if not provided.
    // For now we trust jsxGenerator or add logic here.
  });

  return hidden;
}

/**
 * Builds the AI Prompt for Claude based on the dynamic template config.
 */
function buildAIPrompt(config, userScript) {
  let prompt = `System: "You are a motion graphics editor placing copy into a professional video timeline. Follow the layer rules exactly. Return ONLY valid JSON, no markdown, no explanation."\n\n`;
  prompt += `User: "TEMPLATE: ${config.name}\nLAYER RULES:\n`;

  const textLayers = config.layers.filter(l => l.type === 'text');
  
  // To avoid massive prompts, we group by rules if possible, but the instruction shows a specific format
  // We'll extract unique styles based on names prefixes if needed, but the prompt says:
  prompt += `- HEADLINE layers (Edit Textholder X.1): 1-2 words MAX, UPPERCASE, physical box constraint — overflow is ugly\n`;
  prompt += `- SUBTITLE layers (Edit Textholder X.2): 6-12 words, sentence case, descriptive\n`;
  prompt += `- CINEMATIC layers (placeholder N): 2-3 words MAX, UPPERCASE, full screen moment\n\n`;
  
  prompt += `USER SCRIPT: ${userScript}\n\n`;
  
  const totalTextLayers = textLayers.length;
  prompt += `Fill ALL ${totalTextLayers} layers. Match emotional arc: strong punchy openers in placeholder 1-3, build detail in textholders, climax in placeholder 10-12. Return JSON with every layer name as key."`;

  return prompt;
}

/**
 * Determines the render strategy based on base_video_ready flag and template type.
 */
function getRenderStrategy(config) {
  if (config.base_video_ready && config.base_video) {
    return 'overlay';
  }
  return 'full_render';
}

/**
 * Returns the exact AE composition name to render based on the strategy.
 */
function getCompNameForStrategy(config, strategy) {
  if (strategy === 'overlay' && config.text_comp_name) {
    return config.text_comp_name;
  }
  return config.comp_name; // Defaults to MAIN_COMP usually
}

/**
 * Scans configs directory and returns a summary array of all available templates.
 */
function getAllTemplateSummaries() {
  if (!fs.existsSync(CONFIGS_DIR)) return [];
  
  const files = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json'));
  const summaries = [];
  
  files.forEach(file => {
    try {
      const raw = fs.readFileSync(path.join(CONFIGS_DIR, file), 'utf8');
      const config = JSON.parse(raw);
      summaries.push({
        id: config.template_id,
        name: config.name,
        type: config.type
      });
    } catch (err) {
      console.error(`Error reading config file ${file}:`, err);
    }
  });
  
  return summaries;
}

/**
 * Converts dynamic config back to backwards-compat manifest format.
 */
function configToManifest(config) {
  const manifest = {};
  const emptyData = {};

  config.layers.forEach(layer => {
    // For text layers primarily, keeping old frontend compat
    if (layer.type === 'text') {
      manifest[layer.name] = {
        label: layer.label,
        maxLength: layer.max_words ? layer.max_words * 8 : 50 // approx character mapping if frontend uses it
      };
      emptyData[layer.name] = '';
    }
  });

  return {
    template_id: config.template_id,
    name: config.name,
    manifest,
    emptyData
  };
}

module.exports = {
  loadTemplateConfig,
  validateTextData,
  applyTextFallbacks,
  getHiddenLayerNames,
  buildAIPrompt,
  getRenderStrategy,
  getCompNameForStrategy,
  getAllTemplateSummaries,
  configToManifest
};
