import { useState, useRef } from "react";

const API = "http://localhost:3001";

const EXT_ICON = {
  jpg: "🖼", jpeg: "🖼", png: "🖼", webp: "🖼", gif: "🖼",
  mp4: "🎬", mov: "🎬", avi: "🎬", webm: "🎬",
};

export default function FileUpload({ value, onChange, label }) {
  const [uploading, setUploading]   = useState(false);
  const [progress, setProgress]     = useState(0);
  const [error, setError]           = useState(null);
  const [preview, setPreview]       = useState(null);
  const inputRef                    = useRef(null);

  // Extract filename from full path
  const fileName = value ? value.split(/[/\\]/).pop() : null;
  const fileExt  = fileName ? fileName.split('.').pop().toLowerCase() : null;
  const isVideo  = ['mp4', 'mov', 'avi', 'webm'].includes(fileExt);

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    setProgress(0);

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreview({ url: localUrl, isVideo: file.type.startsWith('video/'), name: file.name });

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Use XMLHttpRequest for progress tracking
      const filePath = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            resolve(data.filePath);
          } else {
            try {
              const err = JSON.parse(xhr.responseText);
              reject(new Error(err.message || 'Upload failed'));
            } catch {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));

        xhr.open('POST', `${API}/api/upload`);
        xhr.send(formData);
      });

      onChange(filePath);
      setProgress(100);

    } catch (err) {
      setError(err.message);
      setPreview(null);
      onChange("");
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleClear() {
    onChange("");
    setPreview(null);
    setError(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <label style={{
        fontSize: "10px", color: "#71717a",
        display: "block", marginBottom: "4px"
      }}>
        {label}
      </label>

      {/* Upload zone */}
      {!value && !uploading && (
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            border: "1px dashed #3f3f46",
            borderRadius: "8px",
            padding: "20px",
            textAlign: "center",
            cursor: "pointer",
            transition: "all 0.15s",
            background: "#18181b",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "#7c3aed";
            e.currentTarget.style.background  = "#1e1e2e";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "#3f3f46";
            e.currentTarget.style.background  = "#18181b";
          }}
          onDragOver={e => {
            e.preventDefault();
            e.currentTarget.style.borderColor = "#7c3aed";
            e.currentTarget.style.background  = "#1e1e2e";
          }}
          onDragLeave={e => {
            e.currentTarget.style.borderColor = "#3f3f46";
            e.currentTarget.style.background  = "#18181b";
          }}
          onDrop={e => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && inputRef.current) {
              // Trigger upload via synthetic change
              const dt = new DataTransfer();
              dt.items.add(file);
              inputRef.current.files = dt.files;
              inputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }}
        >
          <div style={{ fontSize: "24px", marginBottom: "6px" }}>⬆</div>
          <div style={{ fontSize: "12px", color: "#71717a" }}>
            Click to upload or drag & drop
          </div>
          <div style={{ fontSize: "10px", color: "#3f3f46", marginTop: "4px" }}>
            JPG, PNG, WEBP, MP4, MOV — max 200MB
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      {/* Upload progress */}
      {uploading && (
        <div style={{
          background: "#18181b", border: "1px solid #27272a",
          borderRadius: "8px", padding: "14px 16px",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: "11px", color: "#71717a", marginBottom: "8px"
          }}>
            <span>Uploading {preview?.name}...</span>
            <span>{progress}%</span>
          </div>
          <div style={{ background: "#27272a", borderRadius: "4px", height: "4px", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: "4px",
              background: "#7c3aed",
              width: `${progress}%`,
              transition: "width 0.2s",
            }} />
          </div>
        </div>
      )}

      {/* Selected file display */}
      {value && !uploading && (
        <div style={{
          background: "#18181b", border: "1px solid #7c3aed44",
          borderRadius: "8px", padding: "10px 12px",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          {/* Preview */}
          {preview && (
            <div style={{
              width: "48px", height: "32px", borderRadius: "4px",
              overflow: "hidden", flexShrink: 0, background: "#27272a",
            }}>
              {preview.isVideo ? (
                <video
                  src={preview.url}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <img
                  src={preview.url}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}
            </div>
          )}

          {/* File info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: "11px", color: "#e4e4e7",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {EXT_ICON[fileExt] || "📄"} {fileName}
            </div>
            <div style={{ fontSize: "10px", color: "#52525b", marginTop: "2px" }}>
              ✓ Uploaded
            </div>
          </div>

          {/* Change / Clear */}
          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
            <button
              onClick={() => inputRef.current?.click()}
              style={{
                background: "transparent", border: "1px solid #3f3f46",
                borderRadius: "5px", color: "#71717a",
                fontSize: "10px", fontFamily: "inherit",
                padding: "4px 10px", cursor: "pointer",
              }}
            >
              Change
            </button>
            <button
              onClick={handleClear}
              style={{
                background: "transparent", border: "1px solid #3f3f46",
                borderRadius: "5px", color: "#71717a",
                fontSize: "10px", fontFamily: "inherit",
                padding: "4px 8px", cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          marginTop: "6px", fontSize: "11px",
          color: "#ef4444", padding: "6px 10px",
          background: "#1a0808", borderRadius: "6px",
          border: "1px solid #7f1d1d",
        }}>
          {error}
        </div>
      )}
    </div>
  );
}