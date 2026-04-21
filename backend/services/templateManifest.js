const fs = require('fs');
const path = require('path');

// THE FIX: Absolute, undeniable path to your configs directory
const CONFIGS_DIR = path.join(__dirname, '../configs');

function loadTemplateConfig(templateId) {
  const configPath = path.join(CONFIGS_DIR, `${templateId}.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Template config not found at: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function getAllTemplateSummaries() {
  if (!fs.existsSync(CONFIGS_DIR)) return [];
  const files = fs.readdirSync(CONFIGS_DIR).filter(f => f.endsWith('.json'));
  
  return files.map(file => {
    const config = JSON.parse(fs.readFileSync(path.join(CONFIGS_DIR, file), 'utf8'));
    return {
      id: config.template_id,
      name: config.name || config.template_id,
      type: config.type || 'typography'
    };
  });
}

function validateTextData(config, textData) {
  if (!config.text_map) return { valid: true, missing: [], tooLong: [] };
  const missing = [];
  Object.keys(config.text_map).forEach(key => {
    if (!textData[key] || textData[key].trim() === '') missing.push(key);
  });
  return { valid: missing.length === 0, missing, tooLong: [] };
}

function applyTextFallbacks(config, textData) {
  const result = { ...textData };
  if (config.text_map) {
    Object.keys(config.text_map).forEach(key => {
      if (!result[key] || result[key].trim() === '') result[key] = " ";
    });
  }
  return result;
}

function getHiddenLayerNames() { return []; }

function configToManifest(config) {
  return {
    template_id: config.template_id,
    name: config.name || config.template_id,
    manifest: { text_map: config.text_map }
  };
}

module.exports = {
  loadTemplateConfig,
  getAllTemplateSummaries,
  validateTextData,
  applyTextFallbacks,
  getHiddenLayerNames,
  configToManifest,
  getRenderStrategy: () => 'full_render',
  getCompNameForStrategy: (c) => c.render_comp || 'MAIN_COMP'
};