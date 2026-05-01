const express = require('express');
const router = express.Router();
const { scanTemplate } = require('../services/analyzer/templateScanner');
const path = require('path');

router.post('/analyze-new-template', async (req, res) => {
    const { folderName, aepFileName } = req.body;

    if (!folderName || !aepFileName) {
        return res.status(400).json({ success: false, error: "Missing folderName or aepFileName" });
    }

    // CRITICAL: Use path.resolve with backticks to ensure the path is absolute and correctly formatted
    const aepPath = path.resolve(__dirname, `../templates/${folderName}/${aepFileName}`);

    try {
        const proposal = await scanTemplate(aepPath, Date.now());
        res.json({
            success: true,
            message: "Template analyzed successfully.",
            proposal: proposal
        });
    } catch (err) {
        console.error("[Route Error]:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;