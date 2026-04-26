const fs = require('fs');

async function process(visionData, aeDump) {
    const config = {
        template_id: aeDump.projectName.replace('.aep', '').toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        name: aeDump.projectName.replace('.aep', ''),
        aep_file: aeDump.projectName,
        render_comp: aeDump.longestComp ? aeDump.longestComp.name : "Render_HD",
        text_map: {},
        image_map: {},
        scene_outpoints: {}
    };

    const finalComp = aeDump.comps.find(c => c.name.toLowerCase().includes("final scene") || c.name.toLowerCase().includes("render_hd"));
    if (finalComp) config.render_comp = finalComp.name;

    // 1. TEXT MAP (This maps the literal layer name from AE)
    let textCounter = 1;
    const matchedLayerNames = new Set(); 
    if (visionData && visionData.foundTexts) {
        visionData.foundTexts.forEach(aiTextItem => {
            const searchStr = typeof aiTextItem === 'string' ? aiTextItem : aiTextItem.text;
            if (!searchStr) return;
            let bestMatchLayer = null;
            for (const comp of aeDump.comps) {
                for (const layer of comp.layers) {
                    if (layer.type === "TEXT" && layer.textValue) {
                        if (layer.textValue.toLowerCase().includes(searchStr.toLowerCase()) || searchStr.toLowerCase().includes(layer.textValue.toLowerCase())) {
                            if (!matchedLayerNames.has(layer.name)) {
                                bestMatchLayer = layer;
                                break;
                            }
                        }
                    }
                }
                if (bestMatchLayer) break;
            }
            if (bestMatchLayer) {
                config.text_map[`scene${textCounter}_text`] = bestMatchLayer.name;
                matchedLayerNames.add(bestMatchLayer.name);
                textCounter++;
            }
        });
    }

    // 2. IMAGE MAP
    let imageCounter = 1;
    const imageComps = aeDump.comps.filter(c => c.isEmpty);
    const cleanImageComps = imageComps.filter(c => !c.name.toLowerCase().includes("color") && !c.name.toLowerCase().includes("control") && !c.name.toLowerCase().includes("text"));
    cleanImageComps.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
    cleanImageComps.forEach(comp => {
        config.image_map[`image_${imageCounter}`] = comp.name;
        imageCounter++;
    });
    const logoComp = aeDump.comps.find(c => c.name.toLowerCase() === "logo");
    if (logoComp && !Object.values(config.image_map).includes(logoComp.name)) config.image_map[`image_${imageCounter}`] = logoComp.name;

    // 3. SCENE OUTPOINTS (The Nested Comp Fix)
    // Find the comp that ACTUALLY contains the scene cuts
    let timelineComp = aeDump.comps.find(c => c.name.toLowerCase() === "scene");
    
    if (!timelineComp) {
        // Fallback: find whichever comp has the most layers with "scene" in their name
        timelineComp = aeDump.comps.reduce((prev, current) => {
            const prevSceneCount = prev.layers ? prev.layers.filter(l => l.name.toLowerCase().includes('scene')).length : 0;
            const currSceneCount = current.layers ? current.layers.filter(l => l.name.toLowerCase().includes('scene')).length : 0;
            return (currSceneCount > prevSceneCount) ? current : prev;
        }, aeDump.comps[0]);
    }

    if (timelineComp && timelineComp.layers) {
        const sceneLayers = timelineComp.layers
            .filter(l => l.name.toLowerCase().includes("scene") && !l.name.toLowerCase().includes("final"))
            .sort((a, b) => a.inPoint - b.inPoint); 

        if (sceneLayers.length > 0) {
            sceneLayers.forEach((layer, index) => {
                config.scene_outpoints[`scene${index + 1}`] = layer.outPoint;
            });
        } else {
            config.scene_outpoints["scene1"] = timelineComp.duration;
        }
    }

    return { config: config, confidence: 95, flaggedFields: [] };
}

module.exports = { process };