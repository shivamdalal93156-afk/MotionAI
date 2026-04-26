const fs = require('fs');

async function analyze(frames) {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_key_here') {
    // MOCK MODE
    console.log('[Vision] API Key missing, returning mock data.');
    return {
      "foundTexts": [
        {
          "text": "Your Amazing Title Here",
          "frameNumber": 1,
          "isPlaceholder": true
        },
        {
          "text": "Description Text",
          "frameNumber": 5,
          "isPlaceholder": true
        }
      ],
      "imageRegionCount": 2,
      "estimatedSceneCount": 3,
      "frameAnalysis": "Mock analysis of the frames showing scenes."
    };
  }

  // Real Mode using native fetch
  // Convert images to base64
  const base64Frames = frames.map(framePath => {
    const bitmap = fs.readFileSync(framePath);
    return Buffer.from(bitmap).toString('base64');
  });

  const promptText = `
You are analyzing frames from a motion graphics video template.
These ${frames.length} images are frames taken at different 
moments throughout the template.

Your job is to find EVERY piece of editable content.

TASK 1 - FIND ALL TEXT:
Look at every frame. Find every visible text string.
For each text found tell me:
- The exact text as it appears (copy it exactly)
- Which frame number you found it in (1-${frames.length})
- Whether it looks like placeholder text (yes/no)
  Placeholder text looks like: "Your Title Here", 
  "Add Text", "Lorem Ipsum", "Type Something", 
  "Your Name", "Subtitle", "Description" etc

TASK 2 - FIND IMAGE AREAS:
Find every region that looks like a photo or image placeholder.
These look like: empty boxes, colored rectangles used as 
backgrounds, areas with placeholder photos, dark/light solid 
rectangles that are clearly meant to be replaced.
For each one tell me which frame it appears in.

TASK 3 - TIMING:
Based on the frames, estimate how many distinct scenes or 
sections exist in this template. A new scene usually means 
completely different content appears on screen.

Return ONLY this exact JSON structure, nothing else:
{
  "foundTexts": [
    {
      "text": "exact text here",
      "frameNumber": 1,
      "isPlaceholder": true
    }
  ],
  "imageRegionCount": 3,
  "estimatedSceneCount": 4,
  "frameAnalysis": "brief description of what the template looks like"
}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText },
          ...base64Frames.map(b64 => ({
            inlineData: {
              mimeType: 'image/jpeg',
              data: b64
            }
          }))
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;
    
    // Attempt to parse JSON (cleaning up markdown code blocks if any)
    const cleanedText = resultText.replace(/```json\n/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error('[Vision] Failed to analyze frames:', error.message);
    throw error;
  }
}

module.exports = { analyze };
