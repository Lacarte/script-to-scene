# Script-to-Scene

A two-stage video production tool that turns scripts into scene timelines and renders them into videos.

## What It Does

1. **Timeline Editor** - Import scripts from Google Sheets, visualize scenes on a timeline, edit scene properties (duration, effects, prompts, text overlays), and validate the project
2. **Video Editor** - Preview scenes with effects on a canvas, drag text overlays into position, adjust audio, and export the final video via FFmpeg

## Features

- Scene timeline with color-coded blocks by type (hook, buildup, text, peak, transition, CTA, speaker, final)
- Visual effects: zoom in/out, pan left/right, fade, shake, slow motion
- Text scenes with custom fonts, colors, positioning, and draggable placement
- Audio track with volume control, muting, and resizable clips
- Undo/redo with history dropdown
- Google Sheets sync for collaborative scene data
- FFmpeg-powered video export with progress tracking
- Dark theme UI with neon accents

## Prerequisites

- Python 3.8+
- FFmpeg (place binaries in `backend/bin/` or install system-wide)
- A Google Cloud project with Sheets API enabled (for live data)

## Quick Start

### Frontend (Timeline + Video Editor)

```bash
python timeline-editor/server/run_server.py
```

Opens http://localhost:8000/public/ in your browser. Works with built-in mock data out of the box.

### Backend (Video Export)

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
python server.py
```

Runs the export API on http://localhost:5000.

## Project Structure

```
timeline-editor/
  public/            # HTML entry points (index.html, editor.html)
  js/                # Frontend modules (vanilla ES modules)
  css/               # Stylesheets
  server/            # Python dev server
  working-assets/    # Per-project media files

backend/
  server.py          # Flask export API
  video_processor.py # FFmpeg video assembly
  requirements.txt   # Python dependencies
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Arrow Left/Right | Navigate scenes |
| Ctrl+S | Save to Google Sheets |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Delete | Remove scene |
| Escape | Deselect scene |

## License

Private project.
