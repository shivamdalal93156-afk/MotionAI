// backend/services/imageResizer.js
// Resizes an uploaded image to exactly the slot dimensions from config.
// Called before AE injection so AE receives a perfectly-sized image.
// No fitting math needed in JSX — image arrives already correct.

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

/**
 * Resize an image to exactly fit a slot defined by slotW x slotH.
 *
 * Strategy:
 *   1. Scale image so it COVERS the slot (no black bars, fills completely)
 *   2. Crop to exact slot dimensions centered on the image
 *
 * This matches what the template designer expects — photo fills the slot,
 * centered, no letterboxing.
 *
 * @param {string} srcPath   - Absolute path to the uploaded image
 * @param {number} slotW     - Target width in pixels
 * @param {number} slotH     - Target height in pixels
 * @param {string} jobDir    - Directory to write the resized file
 * @param {string} key       - Field key (used for output filename)
 * @returns {Promise<string>} - Absolute path to the resized image
 */
async function resizeToSlot(srcPath, slotW, slotH, jobDir, key) {
  // Validate slot dimensions
  if (!slotW || !slotH || slotW <= 0 || slotH <= 0) {
    // No valid slot dimensions — return original unchanged
    return srcPath;
  }

  const ext     = path.extname(srcPath).toLowerCase() || '.jpg';
  const outName = `resized_${key}${ext}`;
  const outPath = path.join(jobDir, outName);

  try {
    await sharp(srcPath)
      .resize(slotW, slotH, {
        fit: 'cover',       // scale to fill slot, no black bars
        position: 'center', // center crop when aspect ratios differ
        withoutEnlargement: false, // allow upscaling small images to fill slot
      })
      .toFile(outPath);

    return outPath;
  } catch (err) {
    // If resize fails for any reason, return original
    // AE will receive whatever the user uploaded
    console.error(`[imageResizer] Failed to resize ${key}:`, err.message);
    return srcPath;
  }
}

/**
 * Process all solid_replace image layers in a job.
 * For each one that has slotW/slotH in config, resize before injection.
 *
 * @param {object} inputData     - Raw inputData from the job
 * @param {object} templateConfig - Parsed config.json
 * @param {string} jobDir        - Job working directory
 * @returns {Promise<object>}    - New inputData with resized image paths
 */
async function resizeAllSlots(inputData, templateConfig, jobDir) {
  const newInputData = { ...inputData };
  const imageLayers  = templateConfig.imageLayers || [];

  const resizePromises = imageLayers
    .filter(layer => layer.type === 'solid_replace')
    .map(async layer => {
      const key   = layer.key;
      const value = newInputData[key];

      // Skip if no image provided for this slot
      if (!value || typeof value !== 'string') return;

      // Skip if file doesn't exist
      if (!fs.existsSync(value)) return;

      // Get slot dimensions — prefer slotW/slotH, fallback to compW/compH
      const slotW = layer.slotW || layer.compW || 0;
      const slotH = layer.slotH || layer.compH || 0;

      if (!slotW || !slotH) return; // no dimensions, skip

      const resizedPath = await resizeToSlot(value, slotW, slotH, jobDir, key);
      newInputData[key] = resizedPath;
    });

  await Promise.all(resizePromises);
  return newInputData;
}

module.exports = { resizeToSlot, resizeAllSlots };
