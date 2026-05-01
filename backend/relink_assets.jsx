// relink_assets.jsx

// 1. Define where your local assets live. 
// IMPORTANT: Use double backslashes (\\) or forward slashes (/) for ExtendScript paths.
// Example: "C:\\Users\\SHIVAM\\Desktop\\motionai\\backend\\02_Assets"
// Change it to this exactly:
var NEW_ASSET_FOLDER_PATH = "C:\\Users\\SHIVAM\\Desktop\\motionai\\backend\\templates\\02_Assets";
var newFolder = new Folder(NEW_ASSET_FOLDER_PATH);

if (!newFolder.exists) {
    alert("Error: The new asset folder does not exist at " + NEW_ASSET_FOLDER_PATH);
} else {
    var missingCount = 0;
    var relinkedCount = 0;

    app.beginUndoGroup("Auto-Relink Missing Assets");

    // Loop through all items in the Project Panel
    for (var i = 1; i <= app.project.numItems; i++) {
        var currentItem = app.project.item(i);

        // Check if the item is a FootageItem (like an mp4, jpg, psd) and if its file is missing
        if (currentItem instanceof FootageItem && currentItem.mainSource.isMissing) {
            missingCount++;
            
            // Get the name of the missing file (e.g., "Slide-1 BG.mp4")
            var missingFileName = currentItem.file.name;

            // Construct the path to where the file SHOULD be in your local folder
            var newFilePath = new File(newFolder.fsName + "/" + missingFileName);

            // If the file actually exists in your local folder, relink it
            if (newFilePath.exists) {
                try {
                    currentItem.replace(newFilePath);
                    relinkedCount++;
                } catch (e) {
                    // Ignore errors if AE refuses to link a specific file format
                }
            }
        }
    }

    app.endUndoGroup();
    
    // Save the project if we actually fixed things
    if (relinkedCount > 0) {
        app.project.save();
    }
}