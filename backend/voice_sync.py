"""
MotionAI Voice Sync — Whisper word-level timestamp extractor
Run: python voice_sync.py --audio "path/to/audio.mp3" --output "path/to/result.json"

Install once:
  pip install openai-whisper
  pip install torch  (or torch with CUDA if GPU available)
"""

import sys
import json
import argparse
import os

def extract_word_timestamps(audio_path, model_name="medium", language=None):
    """
    Returns list of:
    { "word": str, "start": float, "end": float, "confidence": float }
    """
    try:
        import whisper
    except ImportError:
        return {"error": "whisper_not_installed", "message": "Run: pip install openai-whisper"}

    if not os.path.exists(audio_path):
        return {"error": "file_not_found", "message": f"Audio file not found: {audio_path}"}

    try:
        model = whisper.load_model(model_name)

        # Transcribe with word-level timestamps
        result = model.transcribe(
            audio_path,
            language=language,          # None = auto-detect
            word_timestamps=True,       # KEY: get per-word timing
            verbose=False,
            task="transcribe",
            fp16=False,                 # safer on CPU
        )

        words = []
        for segment in result.get("segments", []):
            for word_data in segment.get("words", []):
                word = word_data.get("word", "").strip()
                if not word:
                    continue
                words.append({
                    "word":       word,
                    "start":      round(word_data.get("start", 0), 3),
                    "end":        round(word_data.get("end", 0), 3),
                    "confidence": round(word_data.get("probability", 0), 3),
                })

        return {
            "success":   True,
            "language":  result.get("language", "unknown"),
            "duration":  round(result.get("segments", [{}])[-1].get("end", 0) if result.get("segments") else 0, 3),
            "words":     words,
            "text":      result.get("text", "").strip(),
        }

    except Exception as e:
        return {"error": "whisper_failed", "message": str(e)}


def main():
    parser = argparse.ArgumentParser(description="MotionAI Voice Sync — Whisper extractor")
    parser.add_argument("--audio",    required=True,  help="Path to audio file")
    parser.add_argument("--output",   required=True,  help="Path to write JSON result")
    parser.add_argument("--model",    default="medium", help="Whisper model: tiny/base/small/medium/large")
    parser.add_argument("--language", default=None,   help="Language code e.g. hi, en (None = auto)")
    args = parser.parse_args()

    result = extract_word_timestamps(args.audio, args.model, args.language)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # Also print to stdout for Node.js to read
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
