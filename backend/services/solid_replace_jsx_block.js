// ─────────────────────────────────────────────────────────────────────────────
// REPLACE the entire solid_replace block in aeWorker.js buildJSX imageLines
// with this. The image has already been resized to the exact slot dimensions
// by imageResizer.js before AE runs, so zero fitting math is needed here.
// ─────────────────────────────────────────────────────────────────────────────

    if ('${injType}' === 'solid_replace') {
      if (!targetComp) {
        log('IMAGE MISS (solid_replace): comp "${safeCompName}" not found');
        return;
      }
      try {
        var importOpts  = new ImportOptions(imgFile);
        var newFootage  = app.project.importFile(importOpts);

        // Find the layer in this comp whose SOURCE is the named solid.
        // The layer is named [Photo_01] (with brackets) — it links to
        // the Photo_01 solid in the project panel.
        // We match by layer.source.name === layerName from config.
        var replaced = false;
        for (var L = 1; L <= targetComp.numLayers; L++) {
          var lyr = targetComp.layer(L);
          try {
            if (lyr.source instanceof FootageItem &&
                lyr.source.name === '${layer.layerName}') {
              // replaceSource: swaps footage, keeps all expressions,
              // position, scale, mask — template handles everything itself.
              lyr.replaceSource(newFootage, false);
              log('IMAGE OK (solid_replace): layer "' + lyr.name +
                  '" source replaced -> "${safeImgPath}"');
              replaced = true;
              break;
            }
          } catch(re) {
            log('IMAGE WARN (solid_replace): replaceSource error: ' + re.toString());
          }
        }

        if (!replaced) {
          // Fallback: try replacing the solid in the project panel directly.
          // This works when the layer name doesn't match source name exactly.
          for (var pi = 1; pi <= app.project.numItems; pi++) {
            var pItem = app.project.item(pi);
            if (pItem instanceof FootageItem &&
                pItem.name === '${layer.layerName}') {
              try {
                pItem.replace(imgFile);
                log('IMAGE OK (solid_replace fallback): project item "' +
                    '${layer.layerName}' + '" replaced -> "${safeImgPath}"');
                replaced = true;
              } catch(pe) {
                log('IMAGE FAIL (solid_replace fallback): ' + pe.toString());
              }
              break;
            }
          }
        }

        if (!replaced) {
          log('IMAGE MISS (solid_replace): no layer or project item found ' +
              'for "${layer.layerName}" in "${safeCompName}"');
        }

      } catch(e) {
        log('IMAGE FAIL (solid_replace): ' + e.toString());
      }
      return;
    }
