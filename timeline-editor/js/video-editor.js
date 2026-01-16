/**
 * Video Editor - Stage 2
 * Receives staged timeline data from Stage 1 and provides video editing capabilities
 */

import { SCENE_COLORS, formatTimestamp, showToast } from './utils.js';
import { CanvasPreview } from './preview.js';
import { ExportAPI, prepareExportData, validateExportData } from './export-api.js';

// Export API instance
const exportAPI = new ExportAPI();

// Scene type icons - flat outline style SVG icons
const SCENE_ICONS = {
    hook: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/>
    </svg>`,
    buildup: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="4" y="14" width="4" height="6" rx="1"/><rect x="10" y="10" width="4" height="10" rx="1"/><rect x="16" y="6" width="4" height="14" rx="1"/>
    </svg>`,
    text: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M6 4h12M12 4v16M8 20h8"/>
    </svg>`,
    peak: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 4l2.5 5h5.5l-4.5 3.5 1.7 5.5-5.2-3.5-5.2 3.5 1.7-5.5L4 9h5.5z"/>
    </svg>`,
    transition: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
    </svg>`,
    cta: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="7" width="18" height="10" rx="2"/><path d="M9 12h6M12 9v6"/>
    </svg>`,
    speaker: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="8" r="4"/><path d="M5 20c0-4 3.5-6 7-6s7 2 7 6"/>
    </svg>`,
    final_statement: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>
    </svg>`,
    default: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M20 16l-5-5-7 9"/>
    </svg>`
};

// LocalStorage keys
const STORAGE_KEYS = {
    ZOOM_LEVEL: 'editor_zoom_level',
    TIMELINE_HEIGHT: 'editor_timeline_height',
    LOOP_STATE: 'editor_loop_state',
    PROJECT_EDITS: 'project_edits_',  // + projectId
    PROJECT_HISTORY: 'project_history_'  // + projectId
};

// Maximum history entries per project
const MAX_HISTORY_ENTRIES = 50;

// Load saved settings from localStorage
function loadSavedSettings() {
    const savedZoom = localStorage.getItem(STORAGE_KEYS.ZOOM_LEVEL);
    const savedLoop = localStorage.getItem(STORAGE_KEYS.LOOP_STATE);

    return {
        zoomLevel: savedZoom ? parseFloat(savedZoom) : 1,
        isLooping: savedLoop === 'true',
        timelineHeight: parseInt(localStorage.getItem(STORAGE_KEYS.TIMELINE_HEIGHT)) || 180
    };
}

const savedSettings = loadSavedSettings();

// Editor State
const EditorState = {
    project: null,
    scenes: [],
    originalScenes: [],  // Original scenes for comparison/reset
    selectedScene: null,
    mediaFolder: null,
    mediaFiles: new Map(),
    playbackPosition: 0,
    isPlaying: false,
    isLooping: savedSettings.isLooping,  // Loop playback mode - restored from localStorage
    zoomLevel: savedSettings.zoomLevel,   // Restored from localStorage
    timelineHeight: savedSettings.timelineHeight, // Restored from localStorage
    pixelsPerSecond: 20,
    preview: null,  // CanvasPreview instance
    audio: null,    // Audio info
    audioElement: null,  // HTML Audio element for playback
    isMuted: false,  // Audio mute state
    editHistory: [],  // History of edits for undo
    historyIndex: -1,  // Current position in history (-1 = no history)
    sceneErrors: new Map(),  // Map of sceneId -> [error messages]
    savedAudioSettings: null  // Saved audio settings from localStorage
};

// ============================================================
// Edit History & Persistence System
// ============================================================

/**
 * Get localStorage key for project edits
 */
function getProjectEditsKey(projectId) {
    return STORAGE_KEYS.PROJECT_EDITS + projectId;
}

/**
 * Get localStorage key for project history
 */
function getProjectHistoryKey(projectId) {
    return STORAGE_KEYS.PROJECT_HISTORY + projectId;
}

/**
 * Save current scene edits to localStorage
 */
function saveProjectEdits() {
    if (!EditorState.project?.id) return;

    const edits = EditorState.scenes.map(scene => ({
        id: scene.id,
        duration: scene.duration,
        visual_fx: scene.visual_fx,
        text_content: scene.text_content,
        text_color: scene.text_color,
        text_size: scene.text_size,
        font_family: scene.font_family,
        font_style: scene.font_style,
        text_align: scene.text_align,
        vertical_align: scene.vertical_align,
        text_x: scene.text_x,
        text_y: scene.text_y
    }));

    // Include audio settings if audio is loaded
    const audioSettings = EditorState.audio?.loaded ? {
        trimmedDuration: EditorState.audio.trimmedDuration,
        fileName: EditorState.audio.fileName
    } : null;

    const data = {
        projectId: EditorState.project.id,
        savedAt: new Date().toISOString(),
        edits: edits,
        audio: audioSettings
    };

    try {
        localStorage.setItem(getProjectEditsKey(EditorState.project.id), JSON.stringify(data));
        console.log('Project edits saved to localStorage');
    } catch (e) {
        console.warn('Failed to save project edits:', e);
    }
}

/**
 * Load saved edits from localStorage and apply to scenes
 */
function loadProjectEdits() {
    if (!EditorState.project?.id) return false;

    try {
        const saved = localStorage.getItem(getProjectEditsKey(EditorState.project.id));
        if (!saved) return false;

        const data = JSON.parse(saved);
        if (data.projectId !== EditorState.project.id) return false;

        // Apply saved edits to scenes
        let appliedCount = 0;
        for (const edit of data.edits) {
            const scene = EditorState.scenes.find(s => s.id === edit.id);
            if (scene) {
                if (edit.duration !== undefined) scene.duration = edit.duration;
                if (edit.visual_fx !== undefined) scene.visual_fx = edit.visual_fx;
                if (edit.text_content !== undefined) scene.text_content = edit.text_content;
                if (edit.text_color !== undefined) scene.text_color = edit.text_color;
                if (edit.text_size !== undefined) scene.text_size = edit.text_size;
                if (edit.font_family !== undefined) scene.font_family = edit.font_family;
                if (edit.font_style !== undefined) scene.font_style = edit.font_style;
                if (edit.text_align !== undefined) scene.text_align = edit.text_align;
                if (edit.vertical_align !== undefined) scene.vertical_align = edit.vertical_align;
                if (edit.text_x !== undefined) scene.text_x = edit.text_x;
                if (edit.text_y !== undefined) scene.text_y = edit.text_y;
                appliedCount++;
            }
        }

        // Store saved audio settings to apply after audio loads
        if (data.audio) {
            EditorState.savedAudioSettings = data.audio;
            console.log('Saved audio settings found:', data.audio);
        }

        if (appliedCount > 0) {
            console.log(`Loaded ${appliedCount} saved edits from localStorage`);
            showToast(`Restored ${appliedCount} saved edits`, 'info');
            return true;
        }
    } catch (e) {
        console.warn('Failed to load project edits:', e);
    }
    return false;
}

/**
 * Record an edit action to history
 */
function recordEdit(action, sceneId, field, oldValue, newValue) {
    if (!EditorState.project?.id) return;

    const historyEntry = {
        timestamp: Date.now(),
        action: action,
        sceneId: sceneId,
        field: field,
        oldValue: oldValue,
        newValue: newValue
    };

    // If we're not at the end of history, truncate future entries
    if (EditorState.historyIndex < EditorState.editHistory.length - 1) {
        EditorState.editHistory = EditorState.editHistory.slice(0, EditorState.historyIndex + 1);
    }

    // Add new entry
    EditorState.editHistory.push(historyEntry);
    EditorState.historyIndex = EditorState.editHistory.length - 1;

    // Limit history size
    if (EditorState.editHistory.length > MAX_HISTORY_ENTRIES) {
        EditorState.editHistory.shift();
        EditorState.historyIndex--;
    }

    // Save to localStorage
    saveEditHistory();
    saveProjectEdits();

    // Update undo button state
    updateUndoButton();

    // Re-validate scenes and update error indicators
    validateScenes();
    applySceneErrorStyles();
}

/**
 * Save edit history to localStorage
 */
function saveEditHistory() {
    if (!EditorState.project?.id) return;

    try {
        const data = {
            projectId: EditorState.project.id,
            history: EditorState.editHistory,
            historyIndex: EditorState.historyIndex
        };
        localStorage.setItem(getProjectHistoryKey(EditorState.project.id), JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save edit history:', e);
    }
}

/**
 * Load edit history from localStorage
 */
function loadEditHistory() {
    if (!EditorState.project?.id) return;

    try {
        const saved = localStorage.getItem(getProjectHistoryKey(EditorState.project.id));
        if (!saved) return;

        const data = JSON.parse(saved);
        if (data.projectId === EditorState.project.id) {
            EditorState.editHistory = data.history || [];
            EditorState.historyIndex = data.historyIndex ?? -1;
            updateUndoButton();
        }
    } catch (e) {
        console.warn('Failed to load edit history:', e);
    }
}

/**
 * Undo the last edit
 */
function undoEdit() {
    if (EditorState.historyIndex < 0 || EditorState.editHistory.length === 0) {
        showToast('Nothing to undo', 'info');
        return;
    }

    const entry = EditorState.editHistory[EditorState.historyIndex];

    // Handle audio edits
    if (entry.sceneId === 'audio') {
        if (entry.field === 'trimmedDuration' && EditorState.audio) {
            EditorState.audio.trimmedDuration = entry.oldValue;
            recalculateDuration();
            renderAudioTrack();
            renderTimeRuler();
            if (EditorState.preview) {
                EditorState.preview.setDuration(getTotalDuration());
            }
        }
        showToast(`Undo: ${entry.action}`, 'info');
    } else {
        // Handle scene edits
        const scene = EditorState.scenes.find(s => s.id === entry.sceneId);

        if (scene && entry.field) {
            // Revert the change
            scene[entry.field] = entry.oldValue;

            // Update UI
            if (entry.field === 'duration') {
                recalculateDuration();
                renderTimeline();
            }
            if (EditorState.selectedScene?.id === entry.sceneId) {
                renderSceneProperties();
            }
            if (EditorState.preview) {
                EditorState.preview.seek(EditorState.playbackPosition);
            }

            showToast(`Undo: ${entry.action}`, 'info');
        }
    }

    EditorState.historyIndex--;
    saveEditHistory();
    saveProjectEdits();

    // Re-validate scenes and update error indicators
    validateScenes();
    applySceneErrorStyles();
    updateUndoButton();
}

/**
 * Redo the last undone edit
 */
function redoEdit() {
    if (EditorState.historyIndex >= EditorState.editHistory.length - 1) {
        showToast('Nothing to redo', 'info');
        return;
    }

    EditorState.historyIndex++;
    const entry = EditorState.editHistory[EditorState.historyIndex];

    // Handle audio edits
    if (entry.sceneId === 'audio') {
        if (entry.field === 'trimmedDuration' && EditorState.audio) {
            EditorState.audio.trimmedDuration = entry.newValue;
            recalculateDuration();
            renderAudioTrack();
            renderTimeRuler();
            if (EditorState.preview) {
                EditorState.preview.setDuration(getTotalDuration());
            }
        }
        showToast(`Redo: ${entry.action}`, 'info');
    } else {
        // Handle scene edits
        const scene = EditorState.scenes.find(s => s.id === entry.sceneId);

        if (scene && entry.field) {
            // Apply the change again
            scene[entry.field] = entry.newValue;

            // Update UI
            if (entry.field === 'duration') {
                recalculateDuration();
                renderTimeline();
            }
            if (EditorState.selectedScene?.id === entry.sceneId) {
                renderSceneProperties();
            }
            if (EditorState.preview) {
                EditorState.preview.seek(EditorState.playbackPosition);
            }

            showToast(`Redo: ${entry.action}`, 'info');
        }
    }

    saveEditHistory();
    saveProjectEdits();

    // Re-validate scenes and update error indicators
    validateScenes();
    applySceneErrorStyles();
    updateUndoButton();
}

/**
 * Update undo/redo button states
 */
function updateUndoButton() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const historyBadge = document.getElementById('history-badge');

    if (undoBtn) {
        undoBtn.disabled = EditorState.historyIndex < 0;
        undoBtn.title = EditorState.historyIndex >= 0
            ? `Undo: ${EditorState.editHistory[EditorState.historyIndex]?.action || ''}`
            : 'Nothing to undo';
    }

    if (redoBtn) {
        redoBtn.disabled = EditorState.historyIndex >= EditorState.editHistory.length - 1;
        redoBtn.title = EditorState.historyIndex < EditorState.editHistory.length - 1
            ? `Redo: ${EditorState.editHistory[EditorState.historyIndex + 1]?.action || ''}`
            : 'Nothing to redo';
    }

    // Update history badge
    if (historyBadge) {
        const count = EditorState.historyIndex + 1;
        historyBadge.textContent = count;
        historyBadge.classList.toggle('has-history', count > 0);
    }
}

/**
 * Setup history dropdown functionality
 */
function setupHistoryDropdown() {
    const historyBtn = document.getElementById('history-btn');
    const historyDropdown = document.getElementById('history-dropdown');
    const clearHistoryBtn = document.getElementById('clear-history-btn');

    if (!historyBtn || !historyDropdown) return;

    // Toggle dropdown
    historyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = historyDropdown.classList.contains('show');
        if (isOpen) {
            historyDropdown.classList.remove('show');
        } else {
            renderHistoryList();
            historyDropdown.classList.add('show');
        }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!historyDropdown.contains(e.target) && !historyBtn.contains(e.target)) {
            historyDropdown.classList.remove('show');
        }
    });

    // Clear all history
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Clear all edit history? This cannot be undone.')) {
                clearProjectEdits();
                renderHistoryList();
            }
        });
    }
}

/**
 * Render the history list in the dropdown
 */
function renderHistoryList() {
    const historyList = document.getElementById('history-list');
    if (!historyList) return;

    const history = EditorState.editHistory;
    const historyIndex = EditorState.historyIndex;

    if (!history || history.length === 0) {
        historyList.innerHTML = '<li class="history-empty">No history yet</li>';
        return;
    }

    // Render history items (most recent first)
    historyList.innerHTML = history.map((entry, index) => {
        const isCurrent = index === historyIndex;
        const label = entry.action || 'Unknown change';
        const meta = entry.sceneId ? `Scene ${entry.sceneId}` : 'Project';

        return `
            <li class="history-item ${isCurrent ? 'current' : ''}" data-index="${index}">
                <span class="history-item-index">${index + 1}</span>
                <div class="history-item-info">
                    <div class="history-item-label">${label}</div>
                    <div class="history-item-meta">${meta}</div>
                </div>
                <button class="history-item-delete" data-index="${index}" title="Delete this state">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18"></path>
                        <path d="M6 6l12 12"></path>
                    </svg>
                </button>
            </li>
        `;
    }).reverse().join('');

    // Add click handlers for jumping to history state
    historyList.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.history-item-delete')) return;
            const index = parseInt(item.dataset.index);
            jumpToHistoryState(index);
            renderHistoryList();
        });
    });

    // Add click handlers for delete buttons
    historyList.querySelectorAll('.history-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            deleteHistoryAt(index);
            renderHistoryList();
        });
    });
}

/**
 * Jump to a specific history state
 */
function jumpToHistoryState(targetIndex) {
    if (targetIndex < 0 || targetIndex >= EditorState.editHistory.length) return;

    // Apply all states from current to target
    if (targetIndex < EditorState.historyIndex) {
        // Going back - undo from current to target
        while (EditorState.historyIndex > targetIndex) {
            const entry = EditorState.editHistory[EditorState.historyIndex];
            applyHistoryEntry(entry, true); // true = undo (use oldValue)
            EditorState.historyIndex--;
        }
    } else if (targetIndex > EditorState.historyIndex) {
        // Going forward - redo from current to target
        while (EditorState.historyIndex < targetIndex) {
            EditorState.historyIndex++;
            const entry = EditorState.editHistory[EditorState.historyIndex];
            applyHistoryEntry(entry, false); // false = redo (use newValue)
        }
    }

    saveEditHistory();
    updateUndoButton();
    renderTimeline();
    showToast(`Jumped to state ${targetIndex + 1}`, 'info');
}

/**
 * Apply a history entry (for undo/redo operations)
 */
function applyHistoryEntry(entry, isUndo) {
    const scene = EditorState.scenes.find(s => s.id === entry.sceneId);
    if (!scene) return;

    const value = isUndo ? entry.oldValue : entry.newValue;
    scene[entry.field] = value;
}

/**
 * Delete a specific history entry
 */
function deleteHistoryAt(index) {
    if (index < 0 || index >= EditorState.editHistory.length) return;

    // Remove the entry
    EditorState.editHistory.splice(index, 1);

    // Adjust historyIndex if needed
    if (EditorState.historyIndex >= index) {
        EditorState.historyIndex = Math.max(-1, EditorState.historyIndex - 1);
    }

    saveEditHistory();
    updateUndoButton();
    showToast('History entry removed', 'info');
}

/**
 * Clear all saved edits for current project
 */
function clearProjectEdits() {
    if (!EditorState.project?.id) return;

    localStorage.removeItem(getProjectEditsKey(EditorState.project.id));
    localStorage.removeItem(getProjectHistoryKey(EditorState.project.id));
    EditorState.editHistory = [];
    EditorState.historyIndex = -1;
    updateUndoButton();
    showToast('Cleared saved edits', 'info');
}

// ============================================================
// Scene Error Validation
// ============================================================

/**
 * Validate all scenes and track errors
 */
function validateScenes() {
    EditorState.sceneErrors.clear();

    EditorState.scenes.forEach(scene => {
        const errors = [];

        // Check for missing media (image scenes should have media)
        if (!['text', 'cta'].includes(scene.type)) {
            if (!scene.mediaUrl && !scene.mediaFile) {
                errors.push('Image not found');
            }
        }

        // Check for text scenes without content
        if (['text', 'cta'].includes(scene.type)) {
            if (!scene.text_content || !scene.text_content.trim()) {
                errors.push('Missing text content');
            }
        }

        // Check for zero or negative duration
        if (scene.duration <= 0) {
            errors.push('Invalid duration');
        }

        // Check for very short duration (less than 0.5s)
        if (scene.duration > 0 && scene.duration < 0.5) {
            errors.push('Duration too short');
        }

        if (errors.length > 0) {
            EditorState.sceneErrors.set(scene.id, errors);
        }
    });

    updateErrorIndicator();
}

/**
 * Update the error indicator in the header
 */
function updateErrorIndicator() {
    const errorIndicator = document.getElementById('error-indicator');
    const errorCount = document.getElementById('error-count');

    if (!errorIndicator || !errorCount) return;

    const errorTotal = EditorState.sceneErrors.size;

    if (errorTotal > 0) {
        errorIndicator.classList.remove('hidden');
        errorCount.textContent = errorTotal;
        errorIndicator.title = `${errorTotal} scene${errorTotal > 1 ? 's' : ''} with errors`;
    } else {
        errorIndicator.classList.add('hidden');
    }
}

/**
 * Apply error styling to scene clips in timeline
 */
function applySceneErrorStyles() {
    if (!elements.videoTrack) return;

    elements.videoTrack.querySelectorAll('.scene-clip').forEach(clip => {
        const sceneId = parseInt(clip.dataset.id);
        const errors = EditorState.sceneErrors.get(sceneId);

        if (errors && errors.length > 0) {
            clip.classList.add('has-error');
            clip.title = `${clip.title}\n⚠ ${errors.join(', ')}`;
        } else {
            clip.classList.remove('has-error');
        }
    });
}

/**
 * Setup error dropdown toggle and interactions
 */
function setupErrorDropdown() {
    const errorIndicator = document.getElementById('error-indicator');
    const errorDropdown = document.getElementById('error-dropdown');

    if (!errorIndicator || !errorDropdown) return;

    // Toggle dropdown on indicator click
    errorIndicator.addEventListener('click', (e) => {
        e.stopPropagation();
        if (errorDropdown.classList.contains('show')) {
            errorDropdown.classList.remove('show');
        } else {
            renderErrorList();
            errorDropdown.classList.add('show');
        }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!errorDropdown.contains(e.target) && !errorIndicator.contains(e.target)) {
            errorDropdown.classList.remove('show');
        }
    });
}

/**
 * Render the error list in the dropdown
 */
function renderErrorList() {
    const errorList = document.getElementById('error-list');
    if (!errorList) return;

    if (EditorState.sceneErrors.size === 0) {
        errorList.innerHTML = '<li class="error-empty">No errors</li>';
        return;
    }

    let html = '';
    EditorState.sceneErrors.forEach((errors, sceneId) => {
        const scene = EditorState.scenes.find(s => s.id === sceneId);
        const sceneLabel = scene ? `Scene ${scene.id}` : `Scene ${sceneId}`;
        const sceneType = scene?.type || 'unknown';

        errors.forEach(error => {
            html += `
                <li class="error-item" data-scene-id="${sceneId}">
                    <span class="error-item-scene">${sceneLabel}</span>
                    <div class="error-item-info">
                        <div class="error-item-type">${sceneType}</div>
                        <div class="error-item-message">${error}</div>
                    </div>
                </li>
            `;
        });
    });

    errorList.innerHTML = html;

    // Add click handlers to navigate to scene
    errorList.querySelectorAll('.error-item').forEach(item => {
        item.addEventListener('click', () => {
            const sceneId = parseInt(item.dataset.sceneId);
            selectScene(sceneId);
            const clip = elements.videoTrack?.querySelector(`.scene-clip[data-id="${sceneId}"]`);
            if (clip) {
                clip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
            // Close dropdown after selection
            document.getElementById('error-dropdown')?.classList.remove('show');
        });
    });
}

// ============================================================
// Timeline Calculation Helpers - Single Source of Truth
// ============================================================

/**
 * Get the total duration of all scenes
 */
function getScenesDuration() {
    return EditorState.scenes.reduce((sum, s) => sum + s.duration, 0);
}

/**
 * Get the total project duration (max of scenes and audio)
 */
function getTotalDuration() {
    const scenesDuration = getScenesDuration();
    // Use trimmed duration if set, otherwise use full audio duration
    const audioDuration = EditorState.audio?.loaded
        ? (EditorState.audio.trimmedDuration || EditorState.audio.duration)
        : 0;
    return Math.max(scenesDuration, audioDuration);
}

/**
 * Convert time (seconds) to pixel position on timeline
 */
function timeToPixels(time) {
    return time * EditorState.pixelsPerSecond * EditorState.zoomLevel;
}

/**
 * Convert pixel position to time (seconds)
 */
function pixelsToTime(pixels) {
    return pixels / (EditorState.pixelsPerSecond * EditorState.zoomLevel);
}

/**
 * Get the start time of a scene by its index
 */
function getSceneStartTime(sceneIndex) {
    let startTime = 0;
    for (let i = 0; i < sceneIndex && i < EditorState.scenes.length; i++) {
        startTime += EditorState.scenes[i].duration;
    }
    return startTime;
}

/**
 * Get the scene at a given time
 */
function getSceneAtTime(time) {
    let accumulated = 0;
    for (let i = 0; i < EditorState.scenes.length; i++) {
        const scene = EditorState.scenes[i];
        if (time >= accumulated && time < accumulated + scene.duration) {
            return {
                scene,
                index: i,
                startTime: accumulated,
                endTime: accumulated + scene.duration,
                localTime: time - accumulated,
                progress: (time - accumulated) / scene.duration
            };
        }
        accumulated += scene.duration;
    }
    return null; // Time is past all scenes (in audio-only region)
}

/**
 * Get the pixel position of a scene on the timeline
 */
function getScenePixelPosition(sceneIndex) {
    const startTime = getSceneStartTime(sceneIndex);
    return timeToPixels(startTime);
}

/**
 * Get the pixel width of a scene
 */
function getScenePixelWidth(scene) {
    return timeToPixels(scene.duration);
}

/**
 * Track base offset (header + padding)
 */
const TRACK_BASE_OFFSET = 96; // 80px header + 16px padding

// DOM Elements
const elements = {
    projectName: document.getElementById('project-name'),
    noDataOverlay: document.getElementById('no-data-overlay'),
    timelineTracks: document.getElementById('timeline-tracks'),
    videoTrack: document.getElementById('video-track'),
    audioTrack: document.getElementById('audio-track'),
    previewCanvas: document.getElementById('preview-canvas'),
    previewPlaceholder: document.getElementById('preview-placeholder'),
    currentTime: document.getElementById('current-time'),
    totalTime: document.getElementById('total-time'),
    timeScrubber: document.getElementById('time-scrubber'),
    playBtn: document.getElementById('play-btn'),
    loopBtn: document.getElementById('loop-btn'),  // Loop toggle button
    volumeBtn: document.getElementById('volume-btn'),  // Volume/mute button
    selectFolderBtn: document.getElementById('select-folder'),
    mediaStatus: document.getElementById('media-status'),
    zoomIn: document.getElementById('zoom-in'),
    zoomOut: document.getElementById('zoom-out'),
    zoomLevel: document.getElementById('zoom-level'),
    infoScenes: document.getElementById('info-scenes'),
    infoDuration: document.getElementById('info-duration'),
    sceneProperties: document.getElementById('scene-properties'),
    previewJsonBtn: document.getElementById('preview-json'),
    exportBtn: document.getElementById('export-mp4'),
    timeRuler: document.getElementById('time-ruler'),
    timelineResizeHandle: document.getElementById('timeline-resize-handle'),
    timelineHeaderMarker: document.getElementById('timeline-header-marker'),
    headerMarkerIndicator: document.querySelector('.header-marker-indicator'),
    headerMarkerTrail: document.querySelector('.header-marker-trail'),
    editorLayout: document.querySelector('.editor-layout'),
    timelinePanel: document.querySelector('.timeline-panel'),
    // Export progress modal
    exportProgressModal: document.getElementById('export-progress-modal'),
    exportProgressTitle: document.getElementById('export-progress-title'),
    exportProgressBar: document.getElementById('export-progress-bar'),
    exportProgressPercent: document.getElementById('export-progress-percent'),
    exportProgressMessage: document.getElementById('export-progress-message'),
    cancelExportBtn: document.getElementById('cancel-export'),
    downloadExportBtn: document.getElementById('download-export')
};

/**
 * Initialize the editor with sequential loading
 */
async function init() {
    console.log('Video Editor initializing...');

    // Check for staged data FIRST before showing any loading UI
    const stagedData = sessionStorage.getItem('staged_timeline');
    if (!stagedData) {
        // No data - show overlay immediately without any loading animations
        showNoDataOverlay();
        return;
    }

    let data;
    try {
        data = JSON.parse(stagedData);
    } catch (error) {
        console.error('Failed to parse staged data:', error);
        showNoDataOverlay();
        return;
    }

    // Data exists - hide no-data overlay immediately (in case browser cached old HTML)
    hideNoDataOverlay();

    // Show single loading overlay that stays until everything is ready
    showLoadingOverlay('Initializing editor...');

    // Setup
    setupEventListeners();
    applySavedSettings();

    // Load project data
    updateLoadingOverlay('Loading project data...');
    loadProjectData(data);

    // Load assets with progress
    await loadProjectMediaWithProgress();

    // Hide loading overlay and show editor
    await hideLoadingOverlay();
    showToast('Editor ready', 'success');

    console.log('Video Editor initialized');
}

/**
 * Sleep utility for sequential loading
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load project data without media (fast)
 */
function loadProjectData(data) {
    EditorState.project = {
        id: data.project_id,
        name: data.project_name,
        totalDuration: data.total_duration,
        sceneCount: data.scene_count,
        stagedAt: data.staged_at
    };

    EditorState.scenes = data.scenes.map(scene => ({
        ...scene,
        mediaLoaded: false,
        mediaUrl: null
    }));

    // Store original scenes for reset functionality
    EditorState.originalScenes = JSON.parse(JSON.stringify(EditorState.scenes));

    // Load saved edits from localStorage (if any)
    loadProjectEdits();

    // Load edit history from localStorage
    loadEditHistory();

    // Initialize Canvas Preview
    if (elements.previewCanvas) {
        EditorState.preview = new CanvasPreview(elements.previewCanvas, {
            onTimeUpdate: (time) => {
                EditorState.playbackPosition = time;
                updateTimeScrubber();
                updatePlayhead();

                if (EditorState.isPlaying && elements.timelineTracks) {
                    scrollTimelineToTime(time);
                }
            },
            onPlaybackEnd: () => {
                if (EditorState.isLooping) {
                    EditorState.playbackPosition = 0;
                    if (EditorState.audioElement && EditorState.audio?.loaded) {
                        EditorState.audioElement.currentTime = 0;
                        EditorState.audioElement.play().catch(e => console.warn('Loop audio play failed:', e));
                    }
                    if (EditorState.preview) {
                        EditorState.preview.seek(0);
                        EditorState.preview.play();
                        if (EditorState.audioElement && EditorState.audio?.loaded) {
                            EditorState.preview.setTimeSource(() => EditorState.audioElement.currentTime);
                        }
                    }
                    if (elements.timelineTracks) {
                        elements.timelineTracks.scrollLeft = 0;
                    }
                    updatePlayhead();
                    updateTimeScrubber();
                    return;
                }

                EditorState.isPlaying = false;
                if (EditorState.audioElement) {
                    EditorState.audioElement.pause();
                    EditorState.audioElement.currentTime = 0;
                }
                if (EditorState.preview) {
                    EditorState.preview.setTimeSource(null);
                }
                EditorState.playbackPosition = 0;
                if (elements.timelineTracks) {
                    elements.timelineTracks.scrollLeft = 0;
                }
                updatePlayhead();
                updateTimeScrubber();
                updatePlayButton();
            }
        });

        EditorState.preview.setProjectPath(`working-assets/${EditorState.project.id}`);
        EditorState.preview.setScenes(EditorState.scenes);
        EditorState.preview.render();

        EditorState.preview.enableTextDrag((x, y, scene) => {
            if (!EditorState._textDragDebounce) {
                EditorState._textDragDebounce = setTimeout(() => {
                    recordEdit(`Move text position (Scene ${scene.id})`, scene.id, 'text_position', null, { x, y });
                    saveProjectEdits();
                    EditorState._textDragDebounce = null;
                }, 500);
            }
        });
    }

    EditorState.playbackPosition = 0;

    // Update UI
    updateProjectInfo();
    renderTimeline();
    renderTimeRuler();
    updateTimeScrubber();
    updatePlayhead();

    // Load default audio
    loadDefaultAudio();
}

/**
 * Load project media with progress tracking
 */
async function loadProjectMediaWithProgress() {
    const projectId = EditorState.project?.id;
    if (!projectId) {
        console.warn('No project ID available for auto-loading media');
        return;
    }

    const basePath = `working-assets/${projectId}/`;
    const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    let loadedCount = 0;
    const totalScenes = EditorState.scenes.filter(s => s.type !== 'text').length;

    // Update loading overlay
    updateLoadingOverlay(`Loading assets (0/${totalScenes})...`);

    // Process each scene
    for (let i = 0; i < EditorState.scenes.length; i++) {
        const scene = EditorState.scenes[i];
        const sceneNumber = i + 1;

        if (scene.type === 'text') {
            console.log(`Skipping scene ${sceneNumber}: text type`);
            continue;
        }

        updateLoadingOverlay(`Loading scene ${sceneNumber} (${loadedCount}/${totalScenes})...`);

        const pathsToTry = [];
        for (const ext of imageExtensions) {
            pathsToTry.push({
                path: `${basePath}${sceneNumber}.${ext}`,
                filename: `${sceneNumber}.${ext}`
            });
        }

        if (scene.image) {
            pathsToTry.push({
                path: `${basePath}${scene.image}`,
                filename: scene.image
            });
            const bareFilename = scene.image.split('/').pop();
            if (bareFilename !== scene.image) {
                pathsToTry.push({
                    path: `${basePath}${bareFilename}`,
                    filename: bareFilename
                });
            }
        }

        let found = false;
        for (const { path: imagePath, filename } of pathsToTry) {
            try {
                const exists = await checkImageExists(imagePath);
                if (exists) {
                    scene.mediaUrl = imagePath;
                    scene.mediaLoaded = true;
                    scene.image = filename;
                    loadedCount++;
                    found = true;
                    console.log(`Loaded scene ${sceneNumber}: ${imagePath}`);
                    updateSceneClipThumb(scene.id, imagePath);
                    break;
                }
            } catch (error) {
                continue;
            }
        }

        if (!found) {
            console.warn(`Scene ${sceneNumber} (id: ${scene.id}): No image found`);
        }

        // Small delay between each scene for visual feedback
        await sleep(50);
    }

    // Update loading status
    updateLoadingOverlay(`Loaded ${loadedCount}/${totalScenes} assets. Finalizing...`);

    // Update preview with loaded scenes
    const scenesWithMedia = EditorState.scenes.filter(s => s.mediaUrl);
    console.log(`Auto-load complete: ${scenesWithMedia.length} scenes have mediaUrl`);

    if (EditorState.preview) {
        EditorState.preview.setScenes(EditorState.scenes);
        EditorState.preview.render();
    }

    if (scenesWithMedia.length > 0) {
        elements.previewPlaceholder?.classList.add('hidden');
        renderTimeline();
        if (elements.mediaStatus) {
            elements.mediaStatus.textContent = `${scenesWithMedia.length} images loaded`;
        }
        showToast(`Loaded ${scenesWithMedia.length} scene images`, 'success');
    } else {
        showToast(`No images found in working-assets/${projectId}/`, 'info');
    }
}

/**
 * Apply saved settings from localStorage
 */
function applySavedSettings() {
    // Apply saved timeline height
    const timelineHeight = EditorState.timelineHeight;
    if (elements.editorLayout) {
        elements.editorLayout.style.setProperty('--timeline-height', `${timelineHeight}px`);
    }
    updateClipSizes(timelineHeight);

    // Apply saved zoom level
    updateZoom();

    // Apply saved loop state
    if (EditorState.isLooping && elements.loopBtn) {
        elements.loopBtn.classList.add('active');
    }
}

// ===== SIMPLE LOADING OVERLAY =====

/**
 * Show unified loading overlay - single black screen with current step
 */
function showLoadingOverlay(message = 'Loading...') {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">${message}</div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    return overlay;
}

/**
 * Update loading overlay text
 */
function updateLoadingOverlay(message) {
    const textEl = document.querySelector('.loading-overlay .loading-text');
    if (textEl) textEl.textContent = message;
}

/**
 * Hide loading overlay with fade
 */
function hideLoadingOverlay() {
    return new Promise(resolve => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.remove();
                resolve();
            }, 300);
        } else {
            resolve();
        }
    });
}

/**
 * Show the no data overlay
 */
function showNoDataOverlay() {
    elements.noDataOverlay?.classList.remove('hidden');
}

/**
 * Hide the no data overlay
 */
function hideNoDataOverlay() {
    elements.noDataOverlay?.classList.add('hidden');
}

// Old loading functions removed - replaced by sequential loading system

/**
 * Update a single scene clip thumbnail in the timeline
 */
function updateSceneClipThumb(sceneId, imagePath) {
    const clip = document.querySelector(`.scene-clip[data-id="${sceneId}"]`);
    if (clip) {
        const thumb = clip.querySelector('.scene-clip-thumb');
        if (thumb) {
            // Add loading class while image loads
            thumb.classList.add('loading');
            const img = new Image();
            img.onload = () => {
                thumb.innerHTML = `<img src="${imagePath}" alt="Scene ${sceneId}">`;
                thumb.classList.remove('loading');
            };
            img.onerror = () => {
                thumb.classList.remove('loading');
            };
            img.src = imagePath;
        }
    }
}

/**
 * Check if an image exists at the given path
 */
function checkImageExists(imagePath) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = imagePath;
    });
}

/**
 * Load audio from working-assets/{project_id}/main-audio.mp3
 */
function loadDefaultAudio() {
    // Use project_id as folder name, main-audio.mp3 as filename
    const projectId = EditorState.project?.id || 'default';
    const audioFileName = 'main-audio.mp3';
    const audioPath = `working-assets/${projectId}/${audioFileName}`;

    // Create audio element
    const audio = new Audio(audioPath);
    EditorState.audioElement = audio;

    // Store audio info in state
    EditorState.audio = {
        file: audioFileName,
        path: audioPath,
        duration: 0,
        loaded: false
    };

    // When audio metadata is loaded, get the duration
    audio.addEventListener('loadedmetadata', () => {
        EditorState.audio.duration = audio.duration;
        EditorState.audio.loaded = true;

        // Restore saved audio trim duration if available
        if (EditorState.savedAudioSettings?.trimmedDuration) {
            EditorState.audio.trimmedDuration = EditorState.savedAudioSettings.trimmedDuration;
            console.log('Restored audio trim duration:', EditorState.audio.trimmedDuration);
        }

        recalculateDuration(); // Recalc total duration including audio
        renderAudioTrack(); // Re-render to show correct trimmed width
        showToast('Audio loaded: ' + formatTimestamp(EditorState.audio.trimmedDuration || audio.duration), 'success');
    });

    audio.addEventListener('error', (e) => {
        console.warn('Failed to load audio:', audioPath, e);
        EditorState.audio.loaded = false;
        EditorState.audio.error = true;
        renderAudioTrack();
        showToast(`Audio not found: Place ${audioFileName} in working-assets/${projectId}/`, 'warning');
    });

    // Handle audio ended event for looping
    audio.addEventListener('ended', () => {
        if (EditorState.isLooping && EditorState.isPlaying) {
            // Restart from beginning
            audio.currentTime = 0;
            audio.play().catch(e => console.warn('Audio loop play failed:', e));

            // Reset preview and timeline
            EditorState.playbackPosition = 0;
            if (EditorState.preview) {
                EditorState.preview.seek(0);
                EditorState.preview.play();
            }
            if (elements.timelineTracks) {
                elements.timelineTracks.scrollLeft = 0;
            }
            updatePlayhead();
            updateTimeScrubber();
        }
    });

    // Initial render (before duration is known)
    renderAudioTrack();
}

/**
 * Render audio track with loaded audio - uses helper for width calculation
 */
function renderAudioTrack() {
    if (!elements.audioTrack) return;

    if (EditorState.audio && EditorState.audio.file) {
        // Use trimmed duration if set, otherwise use actual audio duration
        const audioDuration = EditorState.audio.trimmedDuration ||
            (EditorState.audio.loaded ? EditorState.audio.duration : EditorState.project.totalDuration);
        const totalWidth = timeToPixels(audioDuration);

        // Show error state if audio failed to load
        const errorClass = EditorState.audio.error ? 'audio-clip-error' : '';
        const statusText = EditorState.audio.error ? '(not found)' : formatTimestamp(audioDuration);

        elements.audioTrack.innerHTML = `
            <div class="audio-clip ${errorClass}" style="width: ${totalWidth}px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18V5l12-2v13"/>
                    <circle cx="6" cy="18" r="3"/>
                    <circle cx="18" cy="16" r="3"/>
                </svg>
                <span class="audio-clip-name">${EditorState.audio.file}</span>
                <span class="audio-clip-duration">${statusText}</span>
                <div class="resize-handle resize-handle-right audio-resize-handle"></div>
            </div>
        `;

        // Setup audio resize handler
        setupAudioResizeHandler();
    } else {
        elements.audioTrack.innerHTML = `
            <div class="audio-placeholder">Click + to add background audio</div>
        `;
    }
}

/**
 * Setup resize handler for audio clip
 */
function setupAudioResizeHandler() {
    const audioClip = elements.audioTrack?.querySelector('.audio-clip');
    const resizeHandle = audioClip?.querySelector('.audio-resize-handle');

    if (!resizeHandle || !EditorState.audio?.loaded) return;

    resizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        startAudioResize(e);
    });
}

/**
 * Start resizing the audio clip
 */
function startAudioResize(startEvent) {
    if (!EditorState.audio?.loaded) return;

    const startX = startEvent.clientX;
    const startDuration = EditorState.audio.trimmedDuration || EditorState.audio.duration;
    const maxDuration = EditorState.audio.duration; // Can't extend beyond original audio length

    const audioClip = elements.audioTrack?.querySelector('.audio-clip');
    const durationSpan = audioClip?.querySelector('.audio-clip-duration');

    const onMouseMove = (e) => {
        const deltaX = e.clientX - startX;
        const deltaDuration = pixelsToTime(deltaX);

        // Calculate new duration (min 1s, max original audio duration)
        let newDuration = Math.max(1, Math.min(maxDuration, startDuration + deltaDuration));

        // Snap to 0.5s increments
        newDuration = Math.round(newDuration * 2) / 2;

        // Update audio trimmed duration
        EditorState.audio.trimmedDuration = newDuration;

        // Update clip width visually
        if (audioClip) {
            const newWidth = timeToPixels(newDuration);
            audioClip.style.width = `${newWidth}px`;
        }

        // Update duration display
        if (durationSpan) {
            durationSpan.textContent = formatTimestamp(newDuration);
        }
    };

    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        const newDuration = EditorState.audio.trimmedDuration || EditorState.audio.duration;

        // Record the edit if duration actually changed
        if (newDuration !== startDuration) {
            recordEdit('Resize audio duration', 'audio', 'trimmedDuration', startDuration, newDuration);
        }

        // Recalculate total duration
        recalculateDuration();
        renderTimeRuler();

        // Update preview duration
        if (EditorState.preview) {
            EditorState.preview.setDuration(getTotalDuration());
        }

        showToast(`Audio duration: ${formatTimestamp(newDuration)}`, 'info');
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

/**
 * Update project info in the UI
 */
function updateProjectInfo() {
    if (elements.projectName) {
        elements.projectName.textContent = EditorState.project.name;
    }
    if (elements.infoScenes) {
        elements.infoScenes.textContent = EditorState.project.sceneCount;
    }
    if (elements.infoDuration) {
        elements.infoDuration.textContent = formatTimestamp(EditorState.project.totalDuration);
    }
    if (elements.totalTime) {
        elements.totalTime.textContent = formatTimestamp(EditorState.project.totalDuration);
    }
}

/**
 * Render the timeline with scene clips - uses helper for width calculation
 */
function renderTimeline() {
    if (!elements.videoTrack) return;

    const clips = EditorState.scenes.map(scene => {
        const width = getScenePixelWidth(scene);
        const color = SCENE_COLORS[scene.type] || '#666666';
        const icon = SCENE_ICONS[scene.type] || SCENE_ICONS.default;

        return `
            <div class="scene-clip"
                 data-id="${scene.id}"
                 data-type="${scene.type}"
                 style="width: ${width}px; --scene-color: ${color};"
                 title="${scene.type} - ${scene.duration}s">
                <div class="scene-clip-thumb">
                    ${scene.mediaUrl
                ? `<img src="${scene.mediaUrl}" alt="Scene ${scene.id}">`
                : icon
            }
                </div>
                <div class="scene-clip-info">
                    <div class="scene-clip-id">${scene.id}</div>
                    <div class="scene-clip-duration">${scene.duration}s</div>
                </div>
                <div class="resize-handle resize-handle-left"></div>
                <div class="resize-handle resize-handle-right"></div>
            </div>
        `;
    }).join('');

    elements.videoTrack.innerHTML = clips;

    // Add click listeners
    elements.videoTrack.querySelectorAll('.scene-clip').forEach(clip => {
        clip.addEventListener('click', (e) => {
            if (!e.target.classList.contains('resize-handle')) {
                selectScene(parseInt(clip.dataset.id));
            }
        });
    });

    // Add resize listeners
    setupResizeHandlers();

    // Validate and show errors
    validateScenes();
    applySceneErrorStyles();
}

/**
 * Setup resize handlers for scene clips
 */
function setupResizeHandlers() {
    elements.videoTrack.querySelectorAll('.scene-clip').forEach(clip => {
        const leftHandle = clip.querySelector('.resize-handle-left');
        const rightHandle = clip.querySelector('.resize-handle-right');
        const sceneId = parseInt(clip.dataset.id);

        if (rightHandle) {
            rightHandle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                startResize(sceneId, 'right', e);
            });
        }

        if (leftHandle) {
            leftHandle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                startResize(sceneId, 'left', e);
            });
        }
    });
}

/**
 * Start resizing a scene clip
 */
function startResize(sceneId, handle, startEvent) {
    const scene = EditorState.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    const startX = startEvent.clientX;
    const startDuration = scene.duration;

    const onMouseMove = (e) => {
        const deltaX = e.clientX - startX;
        const deltaDuration = deltaX / (EditorState.pixelsPerSecond * EditorState.zoomLevel);

        let newDuration;
        if (handle === 'right') {
            newDuration = Math.max(0.5, startDuration + deltaDuration);
        } else {
            newDuration = Math.max(0.5, startDuration - deltaDuration);
        }

        // Snap to 0.5s increments
        newDuration = Math.round(newDuration * 2) / 2;

        // Update scene duration
        scene.duration = newDuration;

        // Re-render the clip
        const clip = elements.videoTrack.querySelector(`[data-id="${sceneId}"]`);
        if (clip) {
            const width = newDuration * EditorState.pixelsPerSecond * EditorState.zoomLevel;
            clip.style.width = `${width}px`;
            clip.querySelector('.scene-clip-duration').textContent = `${newDuration}s`;
        }
    };

    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Record the edit if duration actually changed
        if (scene.duration !== startDuration) {
            recordEdit(`Resize duration (Scene ${sceneId})`, sceneId, 'duration', startDuration, scene.duration);
        }

        // Recalculate total duration
        recalculateDuration();
        renderTimeRuler();

        // Sync preview with updated scenes
        if (EditorState.preview) {
            EditorState.preview.setScenes(EditorState.scenes);
            EditorState.preview.render();
        }

        showToast(`Scene ${sceneId} duration: ${scene.duration}s`, 'info');
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

/**
 * Recalculate total duration from scenes and audio - uses helper functions
 */
function recalculateDuration() {
    // Use helper to get total duration (max of scenes and audio)
    const totalDuration = getTotalDuration();
    EditorState.project.totalDuration = totalDuration;

    // Update preview duration if available
    if (EditorState.preview) {
        EditorState.preview.setDuration(totalDuration);
    }

    updateProjectInfo();
    updateTimeScrubber();
    renderAudioTrack();
    renderTimeRuler();
}

/**
 * Select a scene
 */
function selectScene(sceneId) {
    // Deselect previous
    elements.videoTrack.querySelectorAll('.scene-clip.selected').forEach(el => {
        el.classList.remove('selected');
    });

    // Select new
    const clip = elements.videoTrack.querySelector(`[data-id="${sceneId}"]`);
    if (clip) {
        clip.classList.add('selected');
    }

    EditorState.selectedScene = EditorState.scenes.find(s => s.id === sceneId);

    // Calculate scene start time and seek to it using helper
    const sceneIndex = EditorState.scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex >= 0) {
        const startTime = getSceneStartTime(sceneIndex);

        // Seek preview and timeline to scene start
        EditorState.playbackPosition = startTime;
        if (EditorState.preview) {
            EditorState.preview.seek(startTime);
        }
        seekAudio(startTime);
        updateTimeScrubber();
        updatePlayhead();
    }

    renderSceneProperties();
}

/**
 * Render scene properties panel
 */
function renderSceneProperties() {
    if (!elements.sceneProperties) return;

    const scene = EditorState.selectedScene;
    if (!scene) {
        elements.sceneProperties.innerHTML = '<div class="placeholder-text">Select a scene to edit</div>';
        return;
    }

    const isTextScene = scene.type === 'text' || scene.type === 'cta';

    elements.sceneProperties.innerHTML = `
        <div class="property-group">
            <label>Scene ID</label>
            <span class="property-value">${scene.id}</span>
        </div>
        <div class="property-group">
            <label>Type</label>
            <span class="property-value">${scene.type}</span>
        </div>
        <div class="property-group">
            <label>Duration</label>
            <input type="number" class="property-input" id="prop-duration"
                   value="${scene.duration}" min="0.5" step="0.5">
        </div>
        ${isTextScene ? `
            <div class="property-group">
                <label>Text Content</label>
                <textarea class="property-textarea" id="prop-text-content"
                          rows="4" placeholder="Enter text to display...">${scene.text_content || scene.script || ''}</textarea>
            </div>
            <div class="property-group">
                <label>Font Family</label>
                <select class="property-select" id="prop-font-family">
                    <option value="Inter" ${(scene.font_family || 'Inter') === 'Inter' ? 'selected' : ''}>Inter</option>
                    <option value="Arial" ${scene.font_family === 'Arial' ? 'selected' : ''}>Arial</option>
                    <option value="Helvetica" ${scene.font_family === 'Helvetica' ? 'selected' : ''}>Helvetica</option>
                    <option value="Georgia" ${scene.font_family === 'Georgia' ? 'selected' : ''}>Georgia</option>
                    <option value="Times New Roman" ${scene.font_family === 'Times New Roman' ? 'selected' : ''}>Times New Roman</option>
                    <option value="Verdana" ${scene.font_family === 'Verdana' ? 'selected' : ''}>Verdana</option>
                    <option value="Trebuchet MS" ${scene.font_family === 'Trebuchet MS' ? 'selected' : ''}>Trebuchet MS</option>
                    <option value="Impact" ${scene.font_family === 'Impact' ? 'selected' : ''}>Impact</option>
                    <option value="Comic Sans MS" ${scene.font_family === 'Comic Sans MS' ? 'selected' : ''}>Comic Sans MS</option>
                    <option value="Courier New" ${scene.font_family === 'Courier New' ? 'selected' : ''}>Courier New</option>
                    <option value="Montserrat" ${scene.font_family === 'Montserrat' ? 'selected' : ''}>Montserrat</option>
                    <option value="Roboto" ${scene.font_family === 'Roboto' ? 'selected' : ''}>Roboto</option>
                    <option value="Open Sans" ${scene.font_family === 'Open Sans' ? 'selected' : ''}>Open Sans</option>
                    <option value="Playfair Display" ${scene.font_family === 'Playfair Display' ? 'selected' : ''}>Playfair Display</option>
                    <option value="Oswald" ${scene.font_family === 'Oswald' ? 'selected' : ''}>Oswald</option>
                    <option value="Poppins" ${scene.font_family === 'Poppins' ? 'selected' : ''}>Poppins</option>
                </select>
            </div>
            <div class="property-row">
                <div class="property-group property-half">
                    <label>Font Size (px)</label>
                    <input type="number" class="property-input" id="prop-text-size"
                           value="${scene.text_size || 48}" min="12" max="200" step="2">
                </div>
                <div class="property-group property-half">
                    <label>Font Style</label>
                    <select class="property-select" id="prop-font-style">
                        <option value="bold" ${(scene.font_style || 'bold') === 'bold' ? 'selected' : ''}>Bold</option>
                        <option value="normal" ${scene.font_style === 'normal' ? 'selected' : ''}>Regular</option>
                        <option value="light" ${scene.font_style === 'light' ? 'selected' : ''}>Light</option>
                        <option value="italic" ${scene.font_style === 'italic' ? 'selected' : ''}>Italic</option>
                        <option value="bold-italic" ${scene.font_style === 'bold-italic' ? 'selected' : ''}>Bold Italic</option>
                    </select>
                </div>
            </div>
            <div class="property-row">
                <div class="property-group property-half">
                    <label>Text Align</label>
                    <select class="property-select" id="prop-text-align">
                        <option value="center" ${(scene.text_align || 'center') === 'center' ? 'selected' : ''}>Center</option>
                        <option value="left" ${scene.text_align === 'left' ? 'selected' : ''}>Left</option>
                        <option value="right" ${scene.text_align === 'right' ? 'selected' : ''}>Right</option>
                    </select>
                </div>
                <div class="property-group property-half">
                    <label>Vertical Align</label>
                    <select class="property-select" id="prop-vertical-align">
                        <option value="center" ${(scene.vertical_align || 'center') === 'center' ? 'selected' : ''}>Center</option>
                        <option value="top" ${scene.vertical_align === 'top' ? 'selected' : ''}>Top</option>
                        <option value="bottom" ${scene.vertical_align === 'bottom' ? 'selected' : ''}>Bottom</option>
                    </select>
                </div>
            </div>
            <div class="property-group">
                <label>Text Color</label>
                <select class="property-select" id="prop-text-color">
                    <option value="white" ${(scene.text_color || 'white') === 'white' ? 'selected' : ''}>White (dark bg)</option>
                    <option value="black" ${scene.text_color === 'black' ? 'selected' : ''}>Black (light bg)</option>
                </select>
            </div>
            <div class="property-group">
                <label>Position</label>
                <div class="property-position-info">
                    ${scene.text_x !== undefined && scene.text_x !== null ?
                        `<span class="position-value">X: ${Math.round(scene.text_x)}%, Y: ${Math.round(scene.text_y)}%</span>` :
                        `<span class="position-value position-auto">Using alignment</span>`}
                    <button class="btn btn-small btn-reset-position" id="reset-text-position"
                            ${scene.text_x === undefined || scene.text_x === null ? 'disabled' : ''}>
                        Reset
                    </button>
                </div>
                <span class="property-hint">Drag text in preview to position</span>
            </div>
        ` : `
            <div class="property-group">
                <label>Effect</label>
                <select class="property-select" id="prop-effect">
                    <option value="static" ${scene.visual_fx === 'static' ? 'selected' : ''}>Static</option>
                    <option value="zoom_in" ${scene.visual_fx === 'zoom_in' ? 'selected' : ''}>Zoom In</option>
                    <option value="zoom_out" ${scene.visual_fx === 'zoom_out' ? 'selected' : ''}>Zoom Out</option>
                    <option value="pan_left" ${scene.visual_fx === 'pan_left' ? 'selected' : ''}>Pan Left</option>
                    <option value="pan_right" ${scene.visual_fx === 'pan_right' ? 'selected' : ''}>Pan Right</option>
                    <option value="fade" ${scene.visual_fx === 'fade' ? 'selected' : ''}>Fade</option>
                    <option value="shake" ${scene.visual_fx === 'shake' ? 'selected' : ''}>Shake</option>
                </select>
            </div>
        `}
        ${scene.image ? `
            <div class="property-group">
                <label>Image</label>
                <span class="property-value">${scene.image}</span>
            </div>
        ` : ''}
    `;

    // Add event listeners for property changes
    const durationInput = document.getElementById('prop-duration');
    const effectSelect = document.getElementById('prop-effect');
    const textContentInput = document.getElementById('prop-text-content');
    const textColorSelect = document.getElementById('prop-text-color');
    const fontFamilySelect = document.getElementById('prop-font-family');
    const textSizeInput = document.getElementById('prop-text-size');
    const fontStyleSelect = document.getElementById('prop-font-style');
    const textAlignSelect = document.getElementById('prop-text-align');
    const verticalAlignSelect = document.getElementById('prop-vertical-align');

    durationInput?.addEventListener('change', (e) => {
        const oldValue = scene.duration;
        const newValue = parseFloat(e.target.value) || 0.5;
        scene.duration = newValue;
        recordEdit(`Change duration (Scene ${scene.id})`, scene.id, 'duration', oldValue, newValue);
        recalculateDuration();
        renderTimeline();
    });

    effectSelect?.addEventListener('change', (e) => {
        const oldValue = scene.visual_fx;
        const newValue = e.target.value;
        scene.visual_fx = newValue;
        recordEdit(`Change effect (Scene ${scene.id})`, scene.id, 'visual_fx', oldValue, newValue);
    });

    // Text content change - update scene and refresh preview (debounced save)
    let textDebounceTimer = null;
    textContentInput?.addEventListener('input', (e) => {
        const oldValue = scene.text_content;
        scene.text_content = e.target.value;
        // Refresh preview to show updated text
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
        // Debounce recording to avoid saving every keystroke
        clearTimeout(textDebounceTimer);
        textDebounceTimer = setTimeout(() => {
            if (oldValue !== scene.text_content) {
                recordEdit(`Edit text (Scene ${scene.id})`, scene.id, 'text_content', oldValue, scene.text_content);
            }
        }, 1000);
    });

    // Text size change (pixels) - update scene and refresh preview
    textSizeInput?.addEventListener('change', (e) => {
        const oldValue = scene.text_size;
        const newValue = parseInt(e.target.value) || 48;
        scene.text_size = newValue;
        recordEdit(`Change font size (Scene ${scene.id})`, scene.id, 'text_size', oldValue, newValue);
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
    });

    // Font family change - update scene and refresh preview
    fontFamilySelect?.addEventListener('change', (e) => {
        const oldValue = scene.font_family;
        const newValue = e.target.value;
        scene.font_family = newValue;
        recordEdit(`Change font family (Scene ${scene.id})`, scene.id, 'font_family', oldValue, newValue);
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
    });

    // Font style change - update scene and refresh preview
    fontStyleSelect?.addEventListener('change', (e) => {
        const oldValue = scene.font_style;
        const newValue = e.target.value;
        scene.font_style = newValue;
        recordEdit(`Change font style (Scene ${scene.id})`, scene.id, 'font_style', oldValue, newValue);
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
    });

    // Text align change - update scene and refresh preview
    textAlignSelect?.addEventListener('change', (e) => {
        const oldValue = scene.text_align;
        const newValue = e.target.value;
        scene.text_align = newValue;
        recordEdit(`Change text align (Scene ${scene.id})`, scene.id, 'text_align', oldValue, newValue);
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
    });

    // Vertical align change - update scene and refresh preview
    verticalAlignSelect?.addEventListener('change', (e) => {
        const oldValue = scene.vertical_align;
        const newValue = e.target.value;
        scene.vertical_align = newValue;
        recordEdit(`Change vertical align (Scene ${scene.id})`, scene.id, 'vertical_align', oldValue, newValue);
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
    });

    // Text color change - update scene and refresh preview
    textColorSelect?.addEventListener('change', (e) => {
        const oldValue = scene.text_color;
        const newValue = e.target.value;
        scene.text_color = newValue;
        recordEdit(`Change text color (Scene ${scene.id})`, scene.id, 'text_color', oldValue, newValue);
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
    });

    // Reset text position - clear custom position to use alignment
    const resetPositionBtn = document.getElementById('reset-text-position');
    resetPositionBtn?.addEventListener('click', () => {
        const oldX = scene.text_x;
        const oldY = scene.text_y;
        scene.text_x = undefined;
        scene.text_y = undefined;
        recordEdit(`Reset text position (Scene ${scene.id})`, scene.id, 'text_position', { x: oldX, y: oldY }, null);
        saveProjectEdits();
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
        // Re-render properties to update position display
        renderSceneProperties();
    });
}

/**
 * Render time ruler
 */
function renderTimeRuler() {
    if (!elements.timeRuler) return;

    const totalSeconds = getTotalDuration();
    const interval = EditorState.zoomLevel >= 1 ? 5 : 10; // Show markers every 5s or 10s
    let markers = '';

    for (let t = 0; t <= totalSeconds; t += interval) {
        const left = timeToPixels(t);
        markers += `<span class="time-marker" style="left: ${left}px">${formatTimestamp(t)}</span>`;
    }

    elements.timeRuler.innerHTML = markers;
}

/**
 * Update time scrubber
 */
function updateTimeScrubber() {
    if (elements.timeScrubber) {
        elements.timeScrubber.max = EditorState.project.totalDuration;
        elements.timeScrubber.value = EditorState.playbackPosition;
    }
    if (elements.currentTime) {
        elements.currentTime.textContent = formatTimestamp(EditorState.playbackPosition);
    }
}

/**
 * Scroll timeline to show a specific time position with smooth behavior
 * Keeps playhead at a fixed position from left, then gradually scrolls
 * as content approaches the end
 */
function scrollTimelineToTime(time) {
    if (!elements.timelineTracks) return;

    const containerWidth = elements.timelineTracks.clientWidth;
    const totalDuration = getTotalDuration();
    const totalContentWidth = timeToPixels(totalDuration);
    const pixelPos = timeToPixels(time);

    // Fixed playhead position from left edge (20% or 150px max)
    const fixedPlayheadOffset = Math.min(150, containerWidth * 0.2);

    // Right edge buffer - how far from right edge playhead should stay
    const rightEdgeBuffer = 50;

    // Calculate the maximum scroll position (when content ends)
    const maxScroll = Math.max(0, totalContentWidth - containerWidth + TRACK_BASE_OFFSET + rightEdgeBuffer);

    // Calculate target scroll to keep playhead at fixed position
    const targetScrollLeft = pixelPos - fixedPlayheadOffset + TRACK_BASE_OFFSET;

    // Smooth interpolation when near the end
    // As we get closer to end, gradually allow playhead to move right
    const progress = time / totalDuration;
    const endPhaseStart = 0.7; // Start transitioning at 70% progress

    let finalScrollLeft;

    if (progress > endPhaseStart && totalContentWidth > containerWidth) {
        // In the end phase - smoothly transition playhead from fixed position to end
        const endProgress = (progress - endPhaseStart) / (1 - endPhaseStart); // 0 to 1 in end phase
        const eased = easeOutCubic(endProgress);

        // Interpolate between keeping playhead fixed and letting it reach the end
        const normalScroll = pixelPos - fixedPlayheadOffset + TRACK_BASE_OFFSET;
        const endScroll = maxScroll;

        finalScrollLeft = normalScroll + (endScroll - normalScroll) * eased;
    } else {
        // Normal phase - keep playhead at fixed position
        finalScrollLeft = targetScrollLeft;
    }

    // Clamp to valid range and apply
    elements.timelineTracks.scrollLeft = Math.max(0, Math.min(finalScrollLeft, maxScroll));
}

/**
 * Easing function for smooth end-phase transition
 */
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * Setup playhead drag functionality
 * Uses the header marker trail for visual feedback
 */
function setupPlayheadDrag() {
    const playhead = document.getElementById('timeline-playhead');
    const timelineTracks = document.getElementById('timeline-tracks');
    const headerMarker = elements.timelineHeaderMarker;
    const headerTrail = elements.headerMarkerTrail;

    if (!playhead || !timelineTracks) return;

    let isDragging = false;
    let dragStartPosition = 0;

    // Calculate time from X position using helper
    const getTimeFromX = (clientX) => {
        const tracksRect = timelineTracks.getBoundingClientRect();
        const relativeX = clientX - tracksRect.left - TRACK_BASE_OFFSET + timelineTracks.scrollLeft;
        const time = pixelsToTime(relativeX);
        return Math.max(0, Math.min(time, getTotalDuration()));
    };

    // Convert time position to header marker position (relative to visible area)
    const timeToMarkerPosition = (time) => {
        if (!headerMarker) return 0;
        const scrollLeft = timelineTracks.scrollLeft;
        const visibleWidth = timelineTracks.clientWidth - TRACK_BASE_OFFSET;
        const markerWidth = headerMarker.getBoundingClientRect().width;
        const timePixels = timeToPixels(time);
        const visiblePixelPos = timePixels - scrollLeft;
        return (visiblePixelPos / visibleWidth) * markerWidth;
    };

    // Update header marker trail based on drag
    const updateTrail = () => {
        if (!headerTrail || !headerMarker) return;

        const startMarkerPos = timeToMarkerPosition(dragStartPosition);
        const currentMarkerPos = timeToMarkerPosition(EditorState.playbackPosition);

        const left = Math.min(startMarkerPos, currentMarkerPos);
        const width = Math.abs(currentMarkerPos - startMarkerPos);

        headerTrail.style.left = `${Math.max(0, left)}px`;
        headerTrail.style.width = `${width}px`;
    };

    // Reset trail
    const resetTrail = () => {
        if (headerTrail) {
            setTimeout(() => {
                headerTrail.style.width = '0px';
            }, 300);
        }
    };

    // Start drag on playhead
    playhead.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        dragStartPosition = EditorState.playbackPosition;
        playhead.classList.add('dragging');
        headerMarker?.classList.add('scrubbing');

        // Initialize trail at start position
        if (headerTrail) {
            const startPos = timeToMarkerPosition(dragStartPosition);
            headerTrail.style.left = `${startPos}px`;
            headerTrail.style.width = '0px';
        }

        // Pause playback while dragging
        if (EditorState.isPlaying) {
            togglePlayback();
        }
    });

    // Also allow clicking on timeline to seek
    timelineTracks.addEventListener('mousedown', (e) => {
        // Only if clicking on track content area, not on clips
        if (e.target.closest('.scene-clip') || e.target.closest('.track-header')) return;

        isDragging = true;
        dragStartPosition = EditorState.playbackPosition;
        playhead.classList.add('dragging');
        headerMarker?.classList.add('scrubbing');

        // Initialize trail at start position
        if (headerTrail) {
            const startPos = timeToMarkerPosition(dragStartPosition);
            headerTrail.style.left = `${startPos}px`;
            headerTrail.style.width = '0px';
        }

        // Pause playback while dragging
        if (EditorState.isPlaying) {
            togglePlayback();
        }

        // Seek to clicked position
        EditorState.playbackPosition = getTimeFromX(e.clientX);
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
        seekAudio(EditorState.playbackPosition);
        updateTimeScrubber();
        updatePlayhead();
        updateTrail();
    });

    // Handle drag movement
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        EditorState.playbackPosition = getTimeFromX(e.clientX);
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
        seekAudio(EditorState.playbackPosition);
        updateTimeScrubber();
        updatePlayhead();
        updateTrail();
    });

    // End drag
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            playhead.classList.remove('dragging');
            headerMarker?.classList.remove('scrubbing');
            resetTrail();
        }
    });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Play/Pause
    elements.playBtn?.addEventListener('click', togglePlayback);

    // Loop Toggle
    elements.loopBtn?.addEventListener('click', toggleLoop);

    // Volume/Mute Toggle
    elements.volumeBtn?.addEventListener('click', toggleMute);

    // Undo/Redo buttons
    document.getElementById('undo-btn')?.addEventListener('click', undoEdit);
    document.getElementById('redo-btn')?.addEventListener('click', redoEdit);

    // History dropdown
    setupHistoryDropdown();

    // Error dropdown
    setupErrorDropdown();

    // Keyboard shortcuts for undo/redo
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redoEdit();
            } else {
                undoEdit();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            redoEdit();
        }
    });

    // Time scrubber
    elements.timeScrubber?.addEventListener('input', (e) => {
        EditorState.playbackPosition = parseFloat(e.target.value);
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
        seekAudio(EditorState.playbackPosition);
        updateTimeScrubber();
        updatePlayhead();
    });

    // Playhead dragging
    setupPlayheadDrag();

    // Zoom controls
    elements.zoomIn?.addEventListener('click', () => {
        EditorState.zoomLevel = Math.min(4, EditorState.zoomLevel * 1.5);
        updateZoom();
    });

    elements.zoomOut?.addEventListener('click', () => {
        EditorState.zoomLevel = Math.max(0.25, EditorState.zoomLevel / 1.5);
        updateZoom();
    });

    // Select folder (File System Access API)
    elements.selectFolderBtn?.addEventListener('click', selectMediaFolder);

    // Sync playhead with manual scroll
    if (elements.timelineTracks) {
        elements.timelineTracks.addEventListener('scroll', () => {
            updatePlayhead();
            updateHeaderMarker();
        });
    }

    // Timeline header marker click to seek
    setupHeaderMarkerScrub();

    // Preview JSON button
    elements.previewJsonBtn?.addEventListener('click', previewJson);

    // Export MP4
    elements.exportBtn?.addEventListener('click', exportMp4);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Prevent global browser zoom
    window.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
        }
    }, { passive: false });

    // Timeline Zoom on Scroll (Ctrl + Wheel)
    if (elements.timelineTracks) {
        elements.timelineTracks.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();

                // Determine zoom direction
                if (e.deltaY < 0) {
                    // Zoom In
                    EditorState.zoomLevel = Math.min(4, EditorState.zoomLevel * 1.1);
                } else {
                    // Zoom Out
                    EditorState.zoomLevel = Math.max(0.25, EditorState.zoomLevel / 1.1);
                }
                updateZoom();
            }
        }, { passive: false });
    }

    // Timeline vertical resize
    setupTimelineResize();

    // Setup export modal
    setupExportModal();

    // Setup export progress modal (cancel/close and download buttons)
    setupExportProgressModal();

    // Prevent accidental window close - warn user about unsaved changes
    setupBeforeUnloadWarning();
}

/**
 * Setup timeline vertical resize functionality
 */
function setupTimelineResize() {
    const handle = elements.timelineResizeHandle;
    const layout = elements.editorLayout;

    if (!handle || !layout) return;

    let isResizing = false;
    let startY = 0;
    let startHeight = 180;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = elements.timelinePanel?.offsetHeight || 180;
        handle.classList.add('dragging');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaY = startY - e.clientY;
        const newHeight = Math.max(150, Math.min(500, startHeight + deltaY));

        layout.style.setProperty('--timeline-height', `${newHeight}px`);
        updateClipSizes(newHeight);
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Save timeline height to localStorage
            const currentHeight = elements.timelinePanel?.offsetHeight || 180;
            EditorState.timelineHeight = currentHeight;
            localStorage.setItem(STORAGE_KEYS.TIMELINE_HEIGHT, currentHeight.toString());
        }
    });
}

/**
 * Update clip and thumbnail sizes based on timeline height
 */
function updateClipSizes(timelineHeight) {
    const videoTrack = elements.videoTrack;
    if (!videoTrack) return;

    // Scale clip height based on timeline height (subtract toolbar ~44px, ruler ~24px, padding)
    const availableHeight = timelineHeight - 100;
    const clipHeight = Math.max(40, Math.min(120, availableHeight * 0.6));
    const thumbWidth = Math.max(36, clipHeight * 0.9);

    videoTrack.style.setProperty('--clip-height', `${clipHeight}px`);
    videoTrack.style.setProperty('--thumb-width', `${thumbWidth}px`);
}

/**
 * Setup header marker scrub functionality
 * The header marker represents the VISIBLE portion of the timeline (what you can see)
 */
function setupHeaderMarkerScrub() {
    const marker = elements.timelineHeaderMarker;
    const trail = elements.headerMarkerTrail;
    if (!marker) return;

    let isScrubbing = false;
    let scrubStartX = 0;

    const updateTrail = (currentX, markerWidth) => {
        if (!trail) return;

        const left = Math.min(scrubStartX, currentX);
        const width = Math.abs(currentX - scrubStartX);

        trail.style.left = `${left}px`;
        trail.style.width = `${width}px`;
    };

    const handleScrub = (e) => {
        if (!elements.timelineTracks) return;

        const rect = marker.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const markerWidth = rect.width;

        // Update trail
        updateTrail(x, markerWidth);

        // Get the visible timeline dimensions
        const scrollLeft = elements.timelineTracks.scrollLeft;
        const visibleWidth = elements.timelineTracks.clientWidth - TRACK_BASE_OFFSET;

        // Map click position on marker to pixel position on visible timeline
        const visiblePixelPos = (x / markerWidth) * visibleWidth;
        const actualPixelPos = scrollLeft + visiblePixelPos;
        const time = Math.max(0, Math.min(getTotalDuration(), pixelsToTime(actualPixelPos)));

        // Seek to position
        EditorState.playbackPosition = time;
        if (EditorState.preview) {
            EditorState.preview.seek(time);
        }
        seekAudio(time);
        updateTimeScrubber();
        updatePlayhead();
    };

    marker.addEventListener('mousedown', (e) => {
        isScrubbing = true;
        marker.classList.add('scrubbing');

        // Record start position for trail
        const rect = marker.getBoundingClientRect();
        scrubStartX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));

        // Reset trail
        if (trail) {
            trail.style.left = `${scrubStartX}px`;
            trail.style.width = '0px';
        }

        handleScrub(e);
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (isScrubbing) {
            handleScrub(e);
        }
    });

    document.addEventListener('mouseup', () => {
        if (isScrubbing) {
            isScrubbing = false;
            marker.classList.remove('scrubbing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Fade out trail (handled by CSS transition)
            if (trail) {
                setTimeout(() => {
                    trail.style.width = '0px';
                }, 300);
            }
        }
    });
}

/**
 * Update header marker indicator position
 * The indicator shows where the playhead is within the VISIBLE portion of the timeline
 */
function updateHeaderMarker() {
    const indicator = elements.headerMarkerIndicator;
    const marker = elements.timelineHeaderMarker;
    if (!indicator || !marker || !elements.timelineTracks) return;

    const markerWidth = marker.offsetWidth;

    // Get the visible timeline dimensions
    const scrollLeft = elements.timelineTracks.scrollLeft;
    const visibleWidth = elements.timelineTracks.clientWidth - TRACK_BASE_OFFSET;

    // Calculate playhead position in pixels
    const playheadPixelPos = timeToPixels(EditorState.playbackPosition);

    // Map playhead position to marker position based on visible area
    const relativePos = playheadPixelPos - scrollLeft;
    const left = (relativePos / visibleWidth) * markerWidth;

    indicator.style.left = `${Math.max(0, Math.min(markerWidth - 3, left))}px`;
}

/**
 * Toggle playback
 */
function togglePlayback() {
    if (EditorState.preview) {
        EditorState.isPlaying = EditorState.preview.toggle();
    } else {
        EditorState.isPlaying = !EditorState.isPlaying;
        if (EditorState.isPlaying) {
            startPlayback();
        }
    }

    // Sync audio playback
    syncAudioPlayback();

    updatePlayButton();
}

/**
 * Toggle loop mode
 */
function toggleLoop() {
    EditorState.isLooping = !EditorState.isLooping;

    // Save to localStorage
    localStorage.setItem(STORAGE_KEYS.LOOP_STATE, EditorState.isLooping.toString());

    if (elements.loopBtn) {
        if (EditorState.isLooping) {
            elements.loopBtn.classList.add('active');
            showToast('Loop enabled', 'info');
        } else {
            elements.loopBtn.classList.remove('active');
            showToast('Loop disabled', 'info');
        }
    }
}

/**
 * Toggle audio mute
 */
function toggleMute() {
    EditorState.isMuted = !EditorState.isMuted;

    // Apply mute to audio element
    if (EditorState.audioElement) {
        EditorState.audioElement.muted = EditorState.isMuted;
    }

    // Update button icon
    updateVolumeIcon();

    showToast(EditorState.isMuted ? 'Audio muted' : 'Audio unmuted', 'info');
}

/**
 * Update volume button icon based on mute state
 */
function updateVolumeIcon() {
    if (!elements.volumeBtn) return;

    if (EditorState.isMuted) {
        elements.volumeBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
            </svg>`;
        elements.volumeBtn.classList.add('muted');
    } else {
        elements.volumeBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>`;
        elements.volumeBtn.classList.remove('muted');
    }
}

/**
 * Sync audio with current playback state
 */
function syncAudioPlayback() {
    if (!EditorState.audioElement || !EditorState.audio?.loaded) return;

    if (EditorState.isPlaying) {
        // Always sync time when starting playback
        EditorState.audioElement.currentTime = EditorState.playbackPosition;
        EditorState.audioElement.play().catch(e => console.warn('Audio play failed:', e));

        // Use audio as master clock for perfect sync
        if (EditorState.preview) {
            EditorState.preview.setTimeSource(() => EditorState.audioElement.currentTime);
        }
    } else {
        EditorState.audioElement.pause();

        // Clear external time source when paused
        if (EditorState.preview) {
            EditorState.preview.setTimeSource(null);
        }
    }
}

/**
 * Seek audio to specific time
 */
function seekAudio(time) {
    if (EditorState.audioElement && EditorState.audio?.loaded) {
        EditorState.audioElement.currentTime = time;
    }
}

/**
 * Update play button icon
 */
function updatePlayButton() {
    if (!elements.playBtn) return;

    if (EditorState.isPlaying) {
        elements.playBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"/>
                <rect x="14" y="4" width="4" height="16"/>
            </svg>
        `;
    } else {
        elements.playBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
        `;
    }
}

/**
 * Start playback loop (fallback when no preview - uses helper functions)
 */
function startPlayback() {
    if (!EditorState.isPlaying) return;

    const startTime = performance.now();
    const startPosition = EditorState.playbackPosition;

    function tick() {
        if (!EditorState.isPlaying) return;

        const elapsed = (performance.now() - startTime) / 1000;
        EditorState.playbackPosition = startPosition + elapsed;

        const totalDuration = getTotalDuration();
        if (EditorState.playbackPosition >= totalDuration) {
            EditorState.playbackPosition = 0;
            EditorState.isPlaying = false;

            // Return to start
            if (elements.timelineTracks) {
                elements.timelineTracks.scrollLeft = 0;
            }

            togglePlayback();
            return;
        }

        // Scroll timeline using helper
        scrollTimelineToTime(EditorState.playbackPosition);

        updateTimeScrubber();
        updatePlayhead();
        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}

/**
 * Update playhead position - uses helper functions for precise calculation
 */
function updatePlayhead() {
    const playhead = document.getElementById('timeline-playhead');
    if (playhead) {
        const scrollLeft = elements.timelineTracks ? elements.timelineTracks.scrollLeft : 0;
        const pixelPos = timeToPixels(EditorState.playbackPosition);
        const left = TRACK_BASE_OFFSET + pixelPos - scrollLeft;
        playhead.style.left = `${left}px`;
    }

    // Also update header marker indicator
    updateHeaderMarker();
}

/**
 * Update zoom level - uses helper functions for precise calculation
 */
function updateZoom() {
    // Save to localStorage
    localStorage.setItem(STORAGE_KEYS.ZOOM_LEVEL, EditorState.zoomLevel.toString());

    if (elements.zoomLevel) {
        elements.zoomLevel.textContent = `${Math.round(EditorState.zoomLevel * 100)}%`;
    }
    renderTimeline();
    renderTimeRuler();
    renderAudioTrack();

    // Keep playhead visible after zoom by scrolling to current position
    if (elements.timelineTracks) {
        const containerWidth = elements.timelineTracks.clientWidth;
        const pixelPos = timeToPixels(EditorState.playbackPosition);

        // Center the playhead in the view after zoom
        const targetScrollLeft = pixelPos - (containerWidth / 2) + TRACK_BASE_OFFSET;
        elements.timelineTracks.scrollLeft = Math.max(0, targetScrollLeft);
    }

    updatePlayhead();

    // Sync preview with current position
    if (EditorState.preview) {
        EditorState.preview.setScenes(EditorState.scenes);
        EditorState.preview.seek(EditorState.playbackPosition);
    }
}

/**
 * Select media folder using File System Access API
 */
async function selectMediaFolder() {
    if (!('showDirectoryPicker' in window)) {
        showToast('Folder selection not supported in this browser', 'error');
        return;
    }

    try {
        const dirHandle = await window.showDirectoryPicker();
        EditorState.mediaFolder = dirHandle;

        // Scan for media files
        await scanMediaFiles(dirHandle);

        showToast(`Loaded ${EditorState.mediaFiles.size} media files`, 'success');
        elements.mediaStatus.textContent = `${EditorState.mediaFiles.size} files loaded`;

        // Match files to scenes
        matchMediaToScenes();
        renderTimeline();
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error selecting folder:', error);
            showToast('Failed to access folder', 'error');
        }
    }
}

/**
 * Scan directory for media files
 */
async function scanMediaFiles(dirHandle, path = '') {
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            const name = entry.name.toLowerCase();
            if (name.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/)) {
                EditorState.mediaFiles.set(entry.name, { handle: entry, path: path });
            }
        } else if (entry.kind === 'directory') {
            await scanMediaFiles(entry, `${path}${entry.name}/`);
        }
    }
}

/**
 * Match media files to scenes
 */
async function matchMediaToScenes() {
    for (const scene of EditorState.scenes) {
        if (!scene.image) continue;

        // Try exact match first
        let fileEntry = EditorState.mediaFiles.get(scene.image);

        // Try without extension
        if (!fileEntry) {
            const baseName = scene.image.replace(/\.[^/.]+$/, '');
            for (const [name, entry] of EditorState.mediaFiles) {
                if (name.toLowerCase().startsWith(baseName.toLowerCase())) {
                    fileEntry = entry;
                    break;
                }
            }
        }

        if (fileEntry) {
            try {
                const file = await fileEntry.handle.getFile();
                scene.mediaUrl = URL.createObjectURL(file);
                scene.mediaLoaded = true;
            } catch (error) {
                console.warn(`Failed to load ${scene.image}:`, error);
            }
        }
    }

    // Hide placeholder if we have media
    if (EditorState.scenes.some(s => s.mediaLoaded)) {
        elements.previewPlaceholder?.classList.add('hidden');
    }

    // Update preview with loaded media
    if (EditorState.preview) {
        EditorState.preview.setScenes(EditorState.scenes);
        EditorState.preview.render();
    }
}

/**
 * Get prepared export data with audio config
 */
function getExportData() {
    // Prepare audio config if audio is loaded
    const audioConfig = EditorState.audio?.loaded ? {
        file: EditorState.audio.file,
        path: EditorState.audio.path,
        duration: EditorState.audio.duration,
        trimmedDuration: EditorState.audio.trimmedDuration,
        volume: 1.0,
        start_offset: 0
    } : null;

    // Prepare export data
    return prepareExportData(
        EditorState.project,
        EditorState.scenes,
        '',
        audioConfig
    );
}

/**
 * Preview JSON - Show JSON modal with validation
 */
function previewJson() {
    const exportData = getExportData();

    // Validate export data
    const validation = validateExportData(exportData);

    // Show validation warnings/errors
    if (!validation.valid) {
        showToast(`Export errors: ${validation.errors.join(', ')}`, 'error');
    }

    if (validation.warnings.length > 0) {
        console.warn('Export warnings:', validation.warnings);
        showToast(`Warning: ${validation.warnings[0]}`, 'warning');
    }

    // Show modal with JSON
    const modal = document.getElementById('export-modal');
    const jsonPre = document.getElementById('export-json');

    if (modal && jsonPre) {
        jsonPre.textContent = JSON.stringify(exportData, null, 2);
        modal.classList.add('active');
    }
}

/**
 * Export MP4 - Send to backend for processing
 */
async function exportMp4() {
    const exportData = getExportData();

    // Validate export data
    const validation = validateExportData(exportData);

    if (!validation.valid) {
        showToast(`Export errors: ${validation.errors.join(', ')}`, 'error');
        return;
    }

    if (validation.warnings.length > 0) {
        console.warn('Export warnings:', validation.warnings);
    }

    // Show progress modal
    showExportProgress();

    // Track current job for download
    let currentJobId = null;

    // Start export
    const jobId = await exportAPI.startExport(
        exportData,
        // Progress callback
        (progress, message) => {
            updateExportProgress(progress, message);
        },
        // Complete callback
        (success, result) => {
            if (success) {
                currentJobId = result.jobId;
                showExportComplete(result.downloadUrl);
            } else {
                showExportError(result.error);
            }
        }
    );

    if (!jobId) {
        // Export failed to start - error already shown via callback
        return;
    }

    // Cancel/Close button handler is set up in setupExportProgressModal()
    // Download button handler is set up in setupExportProgressModal()
}

/**
 * Show export progress modal
 */
function showExportProgress() {
    if (elements.exportProgressModal) {
        elements.exportProgressModal.classList.add('active');
        elements.exportProgressModal.classList.remove('export-complete', 'export-error');
    }
    if (elements.exportProgressTitle) {
        elements.exportProgressTitle.textContent = 'Exporting Video...';
    }
    if (elements.exportProgressBar) {
        elements.exportProgressBar.style.width = '0%';
    }
    if (elements.exportProgressPercent) {
        elements.exportProgressPercent.textContent = '0%';
    }
    if (elements.exportProgressMessage) {
        elements.exportProgressMessage.textContent = 'Starting export...';
    }
    if (elements.cancelExportBtn) {
        elements.cancelExportBtn.classList.remove('hidden');
    }
    if (elements.downloadExportBtn) {
        elements.downloadExportBtn.classList.add('hidden');
    }
}

/**
 * Update export progress
 */
function updateExportProgress(progress, message) {
    if (elements.exportProgressBar) {
        elements.exportProgressBar.style.width = `${progress}%`;
    }
    if (elements.exportProgressPercent) {
        elements.exportProgressPercent.textContent = `${Math.round(progress)}%`;
    }
    if (elements.exportProgressMessage) {
        elements.exportProgressMessage.textContent = message;
    }
}

/**
 * Show export complete state
 */
function showExportComplete(downloadUrl) {
    if (elements.exportProgressModal) {
        elements.exportProgressModal.classList.add('export-complete');
    }
    if (elements.exportProgressTitle) {
        elements.exportProgressTitle.textContent = 'Export Complete!';
    }
    if (elements.exportProgressBar) {
        elements.exportProgressBar.style.width = '100%';
    }
    if (elements.exportProgressPercent) {
        elements.exportProgressPercent.textContent = '100%';
    }
    if (elements.exportProgressMessage) {
        elements.exportProgressMessage.textContent = 'Your video is ready for download';
    }
    if (elements.cancelExportBtn) {
        elements.cancelExportBtn.classList.add('hidden');
    }
    if (elements.downloadExportBtn) {
        elements.downloadExportBtn.classList.remove('hidden');
    }
    showToast('Export completed!', 'success');
}

/**
 * Show export error state
 */
function showExportError(error) {
    if (elements.exportProgressModal) {
        elements.exportProgressModal.classList.add('export-error');
    }
    if (elements.exportProgressTitle) {
        elements.exportProgressTitle.textContent = 'Export Failed';
    }
    if (elements.exportProgressMessage) {
        elements.exportProgressMessage.textContent = error || 'An error occurred during export';
    }
    if (elements.cancelExportBtn) {
        elements.cancelExportBtn.textContent = 'Close';
        elements.cancelExportBtn.classList.remove('hidden');
    }
    if (elements.downloadExportBtn) {
        elements.downloadExportBtn.classList.add('hidden');
    }
    showToast(`Export failed: ${error}`, 'error');
}

/**
 * Hide export progress modal
 */
function hideExportProgress() {
    if (elements.exportProgressModal) {
        elements.exportProgressModal.classList.remove('active', 'export-complete', 'export-error');
    }
    // Reset cancel button text
    if (elements.cancelExportBtn) {
        elements.cancelExportBtn.textContent = 'Cancel';
    }
}

/**
 * Setup export progress modal event listeners
 */
function setupExportProgressModal() {
    // Cancel/Close button - handles both cancelling and closing after error
    elements.cancelExportBtn?.addEventListener('click', async () => {
        const isCloseButton = elements.cancelExportBtn.textContent === 'Close';
        if (isCloseButton) {
            // Just close the modal
            hideExportProgress();
        } else {
            // Cancel the export
            await exportAPI.cancelExport();
            hideExportProgress();
            showToast('Export cancelled', 'info');
        }
    });

    // Download button
    elements.downloadExportBtn?.addEventListener('click', () => {
        if (currentJobId) {
            exportAPI.downloadExport(currentJobId);
        }
    });
}

/**
 * Check if there are unsaved changes (edits since last save/load)
 */
function hasUnsavedChanges() {
    // Check if we have a project loaded
    if (!EditorState.project?.id) return false;

    // Check if there are any edits in history
    if (EditorState.editHistory.length > 0) return true;

    // Check if scenes have been modified from original
    if (EditorState.scenes.length !== EditorState.originalScenes.length) return true;

    // Compare current scenes with original
    for (let i = 0; i < EditorState.scenes.length; i++) {
        const current = EditorState.scenes[i];
        const original = EditorState.originalScenes[i];
        if (!original) return true;

        // Check key editable properties
        if (current.duration !== original.duration ||
            current.visual_fx !== original.visual_fx ||
            current.text_content !== original.text_content ||
            current.text_color !== original.text_color ||
            current.text_size !== original.text_size ||
            current.font_family !== original.font_family ||
            current.text_x !== original.text_x ||
            current.text_y !== original.text_y) {
            return true;
        }
    }

    return false;
}

/**
 * Setup beforeunload warning to prevent accidental window close
 */
function setupBeforeUnloadWarning() {
    window.addEventListener('beforeunload', (e) => {
        // Only warn if there's a project with potential changes
        if (EditorState.project?.id && hasUnsavedChanges()) {
            // Standard way to trigger browser's "Leave site?" dialog
            e.preventDefault();
            // Some browsers require returnValue to be set
            e.returnValue = '';
            return '';
        }
    });
}

/**
 * Setup export modal event listeners
 */
function setupExportModal() {
    const modal = document.getElementById('export-modal');
    const closeBtn = document.getElementById('close-export-modal');
    const copyBtn = document.getElementById('copy-export-json');
    const downloadBtn = document.getElementById('download-export-json');
    const jsonPre = document.getElementById('export-json');

    // Close modal
    closeBtn?.addEventListener('click', () => {
        modal?.classList.remove('active');
    });

    // Close on backdrop click
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && modal?.classList.contains('active')) {
            modal.classList.remove('active');
        }
    });

    // Copy JSON
    copyBtn?.addEventListener('click', async () => {
        const json = jsonPre?.textContent || '';
        try {
            await navigator.clipboard.writeText(json);
            showToast('JSON copied to clipboard', 'success');
        } catch (err) {
            showToast('Failed to copy', 'error');
        }
    });

    // Download JSON
    downloadBtn?.addEventListener('click', () => {
        const json = jsonPre?.textContent || '';
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${EditorState.project?.id || 'export'}_timeline.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('JSON downloaded', 'success');
    });

    // Export progress modal - close on backdrop click (only when complete/error)
    elements.exportProgressModal?.addEventListener('click', (e) => {
        if (e.target === elements.exportProgressModal &&
            (elements.exportProgressModal.classList.contains('export-complete') ||
             elements.exportProgressModal.classList.contains('export-error'))) {
            hideExportProgress();
        }
    });

    // Close progress modal on Escape (only when complete/error)
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && elements.exportProgressModal?.classList.contains('active')) {
            if (elements.exportProgressModal.classList.contains('export-complete') ||
                elements.exportProgressModal.classList.contains('export-error')) {
                hideExportProgress();
            }
        }
    });
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyboard(e) {
    // Space - Play/Pause
    if (e.code === 'Space' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        togglePlayback();
    }

    // Left/Right - Seek
    if (e.code === 'ArrowLeft') {
        EditorState.playbackPosition = Math.max(0, EditorState.playbackPosition - 1);
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
        seekAudio(EditorState.playbackPosition);
        updateTimeScrubber();
        updatePlayhead();
    }
    if (e.code === 'ArrowRight') {
        EditorState.playbackPosition = Math.min(
            EditorState.project.totalDuration,
            EditorState.playbackPosition + 1
        );
        if (EditorState.preview) {
            EditorState.preview.seek(EditorState.playbackPosition);
        }
        seekAudio(EditorState.playbackPosition);
        updateTimeScrubber();
        updatePlayhead();
    }

    // Escape - Deselect
    if (e.code === 'Escape') {
        EditorState.selectedScene = null;
        elements.videoTrack.querySelectorAll('.scene-clip.selected').forEach(el => {
            el.classList.remove('selected');
        });
        renderSceneProperties();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
