# MotionAI — V1 Setup Guide

## Folder Structure

```
motionai/
├── backend/
│   ├── server.js                    ← Express server (port 3001)
│   ├── .env                         ← YOUR PATHS GO HERE
│   ├── package.json
│   ├── routes/
│   │   ├── render.js                ← POST /api/render/start
│   │   └── jobs.js                  ← GET /api/jobs/:jobId
│   ├── services/
│   │   ├── aeRender.js              ← Runs aerender.exe
│   │   ├── jsxGenerator.js          ← Builds ExtendScript injection
│   │   ├── jobStore.js              ← In-memory job tracking
│   │   └── templateManifest.js      ← All 26 layer definitions + validation
│   ├── outputs/                     ← Rendered .mp4 files saved here
│   └── uploads/                     ← (for V2 image uploads)
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                  ← Full UI
│       └── api.js                   ← API calls
│
└── README.md
```

---

## Step 1 — Update your .env

Open `backend/.env` and set:

```
AE_RENDER_PATH=C:\Program Files\Adobe\Adobe After Effects 2024\Support Files\aerender.exe
AE_TEMPLATE_PATH=C:\Users\SHIVAM\Desktop\motion-backend\node_render_worker\ae_pipeline\templates\master_template.aep
```

Make sure both paths are correct on your machine.

---

## Step 2 — Install and run backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on http://localhost:3001

---

## Step 3 — Install and run frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:3000

---

## Step 4 — Test the render

1. Open http://localhost:3000
2. Fill in all text fields
3. Click "Generate Reel"
4. Wait 1–3 minutes for AE to render
5. Video appears in the browser + saved to `backend/outputs/`

---

## How the injection works

1. You fill the form → frontend sends `textData` JSON to `/api/render/start`
2. Backend generates a JSX script with all 26 layer values
3. aerender.exe runs the JSX against your template → text gets injected
4. aerender.exe renders MAIN_COMP → outputs `.mp4`
5. Frontend polls `/api/jobs/:jobId` every 2.5 seconds → shows progress
6. When done, video plays in browser

---

## Template layer names (must match exactly in After Effects)

| Layer Name | Type | Word Limit |
|---|---|---|
| placeholder 1–12 | Cinematic full-screen title | 2–3 words |
| WORD_1 | Headline gold box, scene 1 | 1–2 words |
| WORD_2 | Subtitle, scene 1 | full sentence |
| Edit Textholder 2.1–7.1 | Headline, scenes 2–7 | 1–2 words |
| Edit Textholder 2.2–7.2 | Subtitle, scenes 2–7 | full sentence |

**Important:** These names must exactly match the layer names inside your .aep file.
If they don't match, the injection silently skips that layer.
Check `backend/temp/inject_log.txt` after a render to see which layers matched.

---

## Troubleshooting

**Video not rendering / black output:**
- Check that `AE_RENDER_PATH` points to actual `aerender.exe`
- Make sure After Effects is NOT open when you render (aerender needs exclusive access)
- Check Windows Task Manager — kill any `AfterFX.exe` processes first

**"H.264" output module not found:**
- Open After Effects manually
- Go to Edit → Templates → Output Module
- Make sure "H.264" template exists, or change `-OMtemplate "H.264"` in `aeRender.js` to match your template name

**Text not injecting (layers showing placeholder text):**
- Check `backend/temp/inject_log.txt` — it shows exactly which layers matched
- The layer name in your .aep must exactly match the keys in `templateManifest.js`
- Layer names are case-sensitive: "WORD_1" ≠ "word_1"

---

## What's next (V2)

- [ ] Browser-based editor: change text after AI fills it
- [ ] Image upload per scene (replace Edit Placeholder 1–12)
- [ ] Font size slider per scene
- [ ] Background color picker
- [ ] Preview thumbnail before rendering
