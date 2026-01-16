# PROJECT: Script-to-Scene Timeline Editor

## OVERVIEW
Local web app that reads video scene projects from Google Sheets and renders an editable timeline. Built as foundation for a full video editor.

## TECH STACK
- Frontend: Vanilla JS + HTML + CSS
- Server: Python http.server (local)
- Data: Google Sheets API (OAuth)
- Style: Dark mode with neon accents

## GOOGLE SHEETS CONFIG
- Spreadsheet ID: 1tnEvx0R3Fo7J6kwHCZKdQEhipXLMZmJY7jgDp3lkEyU
- Sheet 1: "sessions" (project list & metadata)
- Sheet 2: "script-to-scene" (working scene data)

## DATA MODELS

### Session (from "sessions" sheet)
{
  project_id: string,      // "proj_1768229618575_abc123"
  chat_id: number,         // 5985674809
  scenes_json: string,     // JSON string of scenes array (fallback)
  script: string,          // Full narration text
  duration: number,        // Total seconds (e.g., 51)
  created_at: string       // ISO timestamp
}

### Scene (from "script-to-scene" sheet)
{
  project_id: string,      // "proj_1768229618575_abc123"
  scene_id: number,        // 1, 2, 3... (sequential)
  scene_type: string,      // "hook" | "buildup" | "text" | "peak" | "transition" | "cta" | "speaker" | "final_statement"
  description: string,     // "Close-up of woman's face, tears streaming..."
  timestamp: string,       // "0:00", "0:03", "0:08" (m:ss format, auto-calculated)
  duration: number,        // seconds (3, 4, 5...)
  prompt: string,          // Midjourney prompt
  visual_fx: string,       // "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "fade" | "static" | "shake" | "slow_motion"
  style: string,           // "cinematic realistic, dramatic lighting, shallow depth of field"
  text_content: string,    // Text overlay (for scene_type: text/cta)
  text_bg: string,         // Background for text
  status: string,          // "pending" | "done" | "error"
  image_url: string,       // Generated image URL (empty initially)
  created_at: string,      // ISO timestamp
  error: boolean,          // true if scene has errors
  chat_id: number          // 5985674809
}

## SCENE TYPE COLORS
{
  hook: "#FF4444",           // Red
  buildup: "#FF8C00",        // Orange  
  text: "#AA44FF",           // Purple
  peak: "#FFDD00",           // Yellow
  transition: "#4488FF",     // Blue
  cta: "#44FF44",            // Green
  speaker: "#FF44AA",        // Pink
  final_statement: "#44FFFF" // Cyan
}

## VISUAL FX ICONS
{
  zoom_in: "🔍+",
  zoom_out: "🔍-",
  pan_left: "⬅️",
  pan_right: "➡️",
  fade: "🌫️",
  static: "⏹️",
  shake: "📳",
  slow_motion: "🐌"
}

## APP STATE
{
  projects: [],              // Array of Session objects
  currentProject: null,      // Selected Session
  scenes: [],                // Array of Scene objects for current project
  selectedScene: null,       // Currently selected Scene
  syncStatus: "synced",      // "synced" | "saving" | "error"
  lastSyncedAt: null,        // Date timestamp
  validationErrors: [],      // Array of validation error objects
  history: [],               // Undo stack (max 20)
  historyIndex: -1           // Current position in history
}

## VALIDATION RULES
1. duration > 0 (positive integer)
2. scene_id sequential (1, 2, 3...)
3. no duplicate scene_id per project
4. timestamp matches calculated (sum of previous durations)
5. total duration matches sessions.duration (if available)
6. scene_type "text" or "cta" requires text_content
7. non-text scenes should have prompt (warn if missing)
8. visual_fx must be in allowed list

## TIMESTAMP CALCULATION
function calculateTimestamps(scenes) {
  let cumulative = 0;
  return scenes.map(scene => {
    const timestamp = formatTimestamp(cumulative);
    cumulative += scene.duration;
    return { ...scene, timestamp };
  });
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

## DATA LOADING RULES
1. Load project list from "sessions" sheet
2. On project select: query "script-to-scene" WHERE project_id AND chat_id
3. If empty: parse sessions.scenes_json as fallback
4. Auto-calculate timestamps from durations
5. Run validation
6. Render timeline

## DATA SAVING RULES
1. Validate all fields
2. Auto-calculate timestamps
3. Overwrite timestamps in sheet
4. Write changes to "script-to-scene" sheet
5. Update syncStatus
6. Save backup to localStorage

## UI LAYOUT
┌─────────────────────────────────────────────────────────────┐
│ HEADER: App title + Sync status + Last synced              │
├────────────┬────────────────────────────────────────────────┤
│            │ TIMELINE                                       │
│  SIDEBAR   │ - Horizontal blocks proportional to duration   │
│  Projects  │ - Color coded by scene_type                    │
│  list      │ - Shows scene_id, duration, visual_fx          │
│  sorted by │ - Timestamps below blocks                      │
│  date desc ├────────────────────────────────────────────────┤
│            │ DETAILS PANEL          │ VALIDATION PANEL      │
│            │ - Scene info           │ - Error list          │
│            │ - Editable fields      │ - Warnings            │
│            │ - Image placeholder    │ - Total duration      │
└────────────┴────────────────────────┴───────────────────────┘

## EDITABLE FIELDS
- duration (number input)
- description (textarea)
- prompt (textarea + copy button)
- visual_fx (dropdown)
- style (text input)
- text_content (textarea, shown if scene_type is text/cta)
- text_bg (text input)
- status (dropdown: pending/done/error)
- image_url (text input)

## QUICK ACTIONS
- Recalculate all timestamps
- Copy all prompts to clipboard
- Mark all as pending
- Clear all image_urls
- Export project to JSON
- Restore from sessions.scenes_json

## KEYBOARD SHORTCUTS
- Arrow Left/Right: Navigate scenes
- Ctrl+S: Save to Sheets
- Ctrl+Z: Undo
- Ctrl+Shift+Z: Redo
- Delete: Remove scene (with confirm)
- Escape: Deselect scene

## API ENDPOINTS (Google Sheets)
Base URL: https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}

GET /values/sessions!A:F              // Load all projects
GET /values/script-to-scene!A:P       // Load all scenes
PUT /values/script-to-scene!A{row}:P{row}  // Update single scene row
POST /values/script-to-scene:append   // Add new scene
DELETE (via batchUpdate)              // Remove scene

## FILE STRUCTURE
/timeline-editor/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js          // Main app initialization
│   ├── state.js        // State management
│   ├── api.js          // Google Sheets API calls
│   ├── timeline.js     // Timeline rendering
│   ├── validation.js   // Validation logic
│   ├── editor.js       // Edit panel logic
│   └── utils.js        // Helper functions
└── assets/
    └── placeholder.png // Default scene image

## CSS VARIABLES (Dark Mode + Neon)
:root {
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-tertiary: #1a1a25;
  --text-primary: #ffffff;
  --text-secondary: #a0a0b0;
  --text-muted: #606070;
  --accent-primary: #00ffaa;
  --accent-secondary: #ff00aa;
  --accent-warning: #ffaa00;
  --accent-error: #ff4444;
  --accent-success: #44ff44;
  --border-color: #2a2a35;
  --shadow-glow: 0 0 20px rgba(0, 255, 170, 0.3);
}

## SYNC STATUS DISPLAY
- 🟢 Synced (green dot + "Last sync: X min ago")
- 🟡 Saving... (yellow dot + spinner)
- 🔴 Error (red dot + "Retry" button)

## LOCAL STORAGE KEYS
- `timeline_backup_{project_id}`: Scene data backup
- `timeline_last_project`: Last opened project_id
- `timeline_preferences`: User settings

## ERROR HANDLING
- API failures: Show toast, keep local changes, enable retry
- Validation errors: Block save, highlight fields
- Parse errors: Show detailed message, offer restore from backup

## FUTURE EXPANSION HOOKS
- Playhead position (for video preview)
- Multi-track support (audio, text overlay tracks)
- Drag-to-resize scenes
- Drag-to-reorder scenes
- Image upload integration
- Video export





FEATURES AND FIXES

between "Script-to-Scene Timeline"
"Video Editor" add an assets requisition 
to auto generate the images ,video and audio in midjourney and elevenlabs from the Script-to-Scene  Timeline the prompt to midjourney that is in the image type scene
to auto generate the images ,video and audio in midjourney and elevenlabs from the Script-to-Scene  Timeline the prompt to elevenlabs that is in the image type scene
the audio text to elevenlabs that is in the script in the  project  add the button to stage them to pass to the video editor

review font on video 

make a real video 

review transition and effect and video

multitrack video/image and audio 


text position and font on video VERY EFFEC





---

## 🎯 PROJECT ANALYSIS & IMPROVEMENTS

### Analysis Date: January 2026

---

### 📊 CURRENT STATUS

The two-stage video production system is functional with:
- ✅ Stage 1: JSON Corrector (Google Sheets integration)
- ✅ Stage 2: Video Editor (timeline editing, preview, effects)
- ✅ Backend: Python + FFmpeg video export
- ✅ Text scenes with custom fonts, colors, positioning
- ✅ Draggable text positioning in preview
- ✅ Edit history with undo/redo

---

### 🔴 CRITICAL ISSUES

#### 1. Backend Text Rendering Gap
**Problem:** Frontend sends detailed text properties, but `video_processor.py` ignores:
- `font_family` - Uses hardcoded Arial
- `text_x`, `text_y` - Uses center positioning only
- `text_align`, `vertical_align` - Ignored
- `font_style` - Ignored (bold, italic)

**Impact:** Exported videos don't match preview

#### 2. Preview vs Export Visual Inconsistency
**Problem:** Different rendering engines (Canvas vs PIL) produce different results
- Font rendering differences
- Text wrapping differences
- Position calculation variations

---

### 🟡 WORKFLOW BOTTLENECKS

#### 1. Missing Asset Generation Pipeline
- No direct Midjourney integration
- No ElevenLabs audio generation
- Manual image/audio preparation required
- Assets must be named exactly to match scenes

#### 2. Manual Media File Management
- User must manually organize files in `working-assets/{project_id}/`
- Background images (wbg.png/bbg.png) must be manually added
- No batch rename or auto-match tools

#### 3. State Management Fragmentation
- Edit history in `editorState.editHistory`
- Scene edits in localStorage
- Project data in sessionStorage
- No unified state store

---

### 🟢 QUICK WINS (Low effort, High impact)

1. **Font mapping file** - Map frontend font names to system fonts
2. **Position passthrough** - Use text_x/text_y in backend
3. **Add default backgrounds** - Ship default wbg.png/bbg.png
4. **Better error messages** - More descriptive FFmpeg errors

---

### 🔧 IMMEDIATE FIXES (Applied)

#### Fix 1: Backend Text Position Support
Update `video_processor.py` `_render_text_image()` to:
- Read `position.x` and `position.y` from text_config
- Apply percentage-based positioning when set
- Fall back to alignment-based positioning when null

#### Fix 2: Backend Font Family Support
Update `video_processor.py` to:
- Create font mapping dictionary
- Load font by family name from config
- Handle font style (bold/italic)
- Graceful fallback to system fonts

#### Fix 3: Backend Text Alignment Support
Update `video_processor.py` to:
- Use `text_align` for horizontal alignment
- Use `vertical_align` for vertical positioning
- Match Canvas rendering behavior

---

### 📋 FUTURE ENHANCEMENTS

#### Phase A: Asset Pipeline Integration
- [ ] Midjourney prompt → API submission
- [ ] ElevenLabs script → audio generation
- [ ] Auto-download and organize assets
- [ ] Asset status tracking per scene

#### Phase B: Preview/Export Parity
- [ ] Use same font files in frontend and backend
- [ ] Share text wrapping algorithm
- [ ] Visual diff testing tool
- [ ] "Export Preview" mode showing actual render

#### Phase C: State Management Refactor
- [ ] Unified state store (similar to Redux pattern)
- [ ] State persistence abstraction
- [ ] Cross-tab synchronization
- [ ] Better undo/redo granularity

#### Phase D: Multi-track Timeline
- [ ] Multiple video tracks (A/B roll)
- [ ] Text overlay track
- [ ] Multiple audio tracks
- [ ] Track locking and muting

---

### 🗂️ FILE ORGANIZATION RECOMMENDATIONS

```
working-assets/{project_id}/
├── images/          # Scene images (1.jpg, 2.jpg, etc.)
├── audio/           # Audio files
├── backgrounds/     # Text backgrounds (wbg.png, bbg.png)
└── generated/       # AI-generated assets (future)
```

---

### 📈 PERFORMANCE OPTIMIZATIONS

1. **Preview Caching**
   - Cache rendered frames at key positions
   - Use requestAnimationFrame throttling
   - Debounce property changes

2. **Export Optimization**
   - Use faster FFmpeg preset for previews
   - Parallel scene processing
   - GPU acceleration (if available)

3. **Large Project Handling**
   - Virtual scrolling for 50+ scene timelines
   - Lazy load scene thumbnails
   - Paginated API requests