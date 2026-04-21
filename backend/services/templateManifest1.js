/**
 * TEMPLATE MANIFEST
 * Defines every text layer in master_template.aep
 * with its role, word limit, and example content.
 *
 * This is what the AI (and you manually for V1) uses
 * to know what to put in each layer.
 *
 * Layer types:
 *   CINEMATIC  - full screen big title, 2-3 words MAX, uppercase
 *   HEADLINE   - bold gold box headline, 1-2 words MAX, uppercase
 *   SUBTITLE   - supporting sentence, 6-12 words, normal case ok
 */

const TEMPLATE_MANIFEST = {
  // ─── EDIT Placeholders (full screen cinematic scene titles) ───────────────
  "placeholder 1":  { type: "CINEMATIC", wordLimit: 3, hint: "Opening statement" },
  "placeholder 2":  { type: "CINEMATIC", wordLimit: 3, hint: "Scene 2 title" },
  "placeholder 3":  { type: "CINEMATIC", wordLimit: 3, hint: "Scene 3 title" },
  "placeholder 4":  { type: "CINEMATIC", wordLimit: 3, hint: "Scene 4 title" },
  "placeholder 5":  { type: "CINEMATIC", wordLimit: 3, hint: "Scene 5 title" },
  "placeholder 6":  { type: "CINEMATIC", wordLimit: 3, hint: "Scene 6 title" },
  "placeholder 7":  { type: "CINEMATIC", wordLimit: 3, hint: "Scene 7 title" },
  "placeholder 8":  { type: "CINEMATIC", wordLimit: 3, hint: "Scene 8 title" },
  "placeholder 9":  { type: "CINEMATIC", wordLimit: 3, hint: "Scene 9 title" },
  "placeholder 10": { type: "CINEMATIC", wordLimit: 3, hint: "Scene 10 title" },
  "placeholder 11": { type: "CINEMATIC", wordLimit: 3, hint: "Scene 11 title" },
  "placeholder 12": { type: "CINEMATIC", wordLimit: 3, hint: "Closing statement" },

  // ─── EDIT Textholders (Textholder 1 — uses WORD_1 / WORD_2) ─────────────
  "WORD_1": { type: "HEADLINE",  wordLimit: 2, hint: "Big gold box headline, scene 1" },
  "WORD_2": { type: "SUBTITLE",  wordLimit: 12, hint: "Subtitle line under headline, scene 1" },

  // ─── Textholder 2 ─────────────────────────────────────────────────────────
  "Edit Textholder 2.1": { type: "HEADLINE", wordLimit: 2, hint: "Big headline, scene 2" },
  "Edit Textholder 2.2": { type: "SUBTITLE", wordLimit: 12, hint: "Subtitle, scene 2" },

  // ─── Textholder 3 ─────────────────────────────────────────────────────────
  "Edit Textholder 3.1": { type: "HEADLINE", wordLimit: 2, hint: "Big headline, scene 3" },
  "Edit Textholder 3.2": { type: "SUBTITLE", wordLimit: 12, hint: "Subtitle, scene 3" },

  // ─── Textholder 4 ─────────────────────────────────────────────────────────
  "Edit Textholder 4.1": { type: "HEADLINE", wordLimit: 2, hint: "Big headline, scene 4" },
  "Edit Textholder 4.2": { type: "SUBTITLE", wordLimit: 12, hint: "Subtitle, scene 4" },

  // ─── Textholder 5 ─────────────────────────────────────────────────────────
  "Edit Textholder 5.1": { type: "HEADLINE", wordLimit: 2, hint: "Big headline, scene 5" },
  "Edit Textholder 5.2": { type: "SUBTITLE", wordLimit: 12, hint: "Subtitle, scene 5" },

  // ─── Textholder 6 ─────────────────────────────────────────────────────────
  "Edit Textholder 6.1": { type: "HEADLINE", wordLimit: 2, hint: "Big headline, scene 6" },
  "Edit Textholder 6.2": { type: "SUBTITLE", wordLimit: 12, hint: "Subtitle, scene 6" },

  // ─── Textholder 7 ─────────────────────────────────────────────────────────
  "Edit Textholder 7.1": { type: "HEADLINE", wordLimit: 2, hint: "Big headline, scene 7" },
  "Edit Textholder 7.2": { type: "SUBTITLE", wordLimit: 12, hint: "Subtitle, scene 7" },
};

/**
 * Validate that all required layers are present in the submitted textData
 * Returns { valid: bool, missing: [], tooLong: [] }
 */
function validateTextData(textData) {
  const missing = [];
  const tooLong = [];

  for (const [layerName, config] of Object.entries(TEMPLATE_MANIFEST)) {
    if (!textData[layerName] || textData[layerName].trim() === '') {
      missing.push(layerName);
      continue;
    }

    const wordCount = textData[layerName].trim().split(/\s+/).length;
    if (config.type !== 'SUBTITLE' && wordCount > config.wordLimit) {
      tooLong.push({
        layer: layerName,
        limit: config.wordLimit,
        actual: wordCount,
        value: textData[layerName]
      });
    }
  }

  return {
    valid: missing.length === 0 && tooLong.length === 0,
    missing,
    tooLong
  };
}

/**
 * Returns an empty textData object pre-filled with empty strings
 * Useful for generating the frontend form structure
 */
function getEmptyTextData() {
  const data = {};
  for (const layerName of Object.keys(TEMPLATE_MANIFEST)) {
    data[layerName] = '';
  }
  return data;
}

module.exports = { TEMPLATE_MANIFEST, validateTextData, getEmptyTextData };
