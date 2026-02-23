# Script-to-Scene

Two-stage video production tool: a timeline editor for scene planning (Google Sheets-backed) and a video editor with preview/export (FFmpeg-backed).

## Project Structure

```
timeline-editor/          # Frontend (vanilla JS, served via Python http.server)
  public/                 # Entry point HTML files
  js/                     # Application modules (ES modules)
    app.js                # Main initialization
    state.js              # State management
    api.js                # Google Sheets API (read) + mock data
    write_api.js          # Google Sheets API (write via OAuth)
    auth.js               # Google OAuth authentication
    timeline.js           # Timeline rendering
    editor.js             # Scene edit panel
    validation.js         # Scene validation logic
    preview.js            # Canvas-based video preview
    video-editor.js       # Video editor stage
    export-api.js         # Export API client
    utils.js              # Helpers
  css/                    # Stylesheets (dark mode + neon accent theme)
  server/run_server.py    # Local dev server (port 8000)
  working-assets/         # Per-project media files (gitignored)

backend/                  # Python Flask API for video export
  server.py               # Flask app (port 5000) - export jobs API
  video_processor.py      # FFmpeg + Pillow video assembly
  bin/                    # Bundled ffmpeg/ffprobe (gitignored)
  venv/                   # Python virtual environment (gitignored)
  requirements.txt        # Flask, flask-cors, ffmpeg-python, Pillow
```

## Tech Stack

- **Frontend:** Vanilla JS (ES modules), HTML, CSS - no build step
- **Backend:** Python 3, Flask, FFmpeg, Pillow
- **Data:** Google Sheets API (API key for reads, OAuth for writes)
- **Video:** FFmpeg for export, Canvas API for preview

## Running Locally

1. **Frontend:** `python timeline-editor/server/run_server.py` (serves on http://localhost:8000/public/)
2. **Backend:** `cd backend && pip install -r requirements.txt && python server.py` (serves on http://localhost:5000)

## Key Conventions

- Commit messages use conventional commits: `feat:`, `fix:`, `chore:`
- CSS uses custom properties defined in `:root` (dark theme with neon accents)
- Frontend uses ES module imports (`import/export`), no bundler
- State is managed via a custom `State` class with localStorage persistence
- Scene data follows the schema in `plan.md` (project_id, scene_id, scene_type, etc.)
- Working assets go in `timeline-editor/working-assets/{project_id}/` (gitignored)

## Important Files

- `plan.md` - Full project spec: data models, validation rules, UI layout, API endpoints, roadmap
- `timeline-editor/index.html` - Timeline editor (stage 1)
- `timeline-editor/editor.html` - Video editor (stage 2)
- `backend/video_processor.py` - Core video rendering logic with font mapping and text positioning

## Known Issues

- Backend text rendering (Pillow) doesn't perfectly match frontend preview (Canvas) - font rendering and text wrapping differ
- No automated tests
