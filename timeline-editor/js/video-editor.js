/**
 * Video Editor - Stage 2
 * Receives staged timeline data from Stage 1 and provides video editing capabilities
 */

import { SCENE_COLORS, formatTimestamp, showToast } from './utils.js';
import { CanvasPreview } from './preview.js';
import { ExportAPI, prepareExportData, validateExportData } from './export-api.js';

// Export API instance
const exportAPI = new ExportAPI();

// Editor State
const EditorState = {
    project: null,
    scenes: [],
    selectedScene: null,
    mediaFolder: null,
    mediaFiles: new Map(),
    playbackPosition: 0,
    isPlaying: false,
    isLooping: false,  // Loop playback mode
    zoomLevel: 1,
    pixelsPerSecond: 20,
    preview: null,  // CanvasPreview instance
    audio: null,    // Audio info
    audioElement: null  // HTML Audio element for playback
};

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
 * Initialize the editor
 */
function init() {
    console.log('Video Editor initializing...');

    // Check for staged data
    const stagedData = sessionStorage.getItem('staged_timeline');
    if (!stagedData) {
        showNoDataOverlay();
        return;
    }

    try {
        const data = JSON.parse(stagedData);
        loadProject(data);
    } catch (error) {
        console.error('Failed to parse staged data:', error);
        showNoDataOverlay();
        return;
    }

    // Setup event listeners
    setupEventListeners();

    console.log('Video Editor initialized');
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

/**
 * Load project data from staged JSON
 */
function loadProject(data) {
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

    // Initialize Canvas Preview
    if (elements.previewCanvas) {
        EditorState.preview = new CanvasPreview(elements.previewCanvas, {
            onTimeUpdate: (time) => {
                EditorState.playbackPosition = time;
                updateTimeScrubber();
                updatePlayhead();

                // Scroll timeline to keep playhead at fixed position during playback
                if (EditorState.isPlaying && elements.timelineTracks) {
                    scrollTimelineToTime(time);
                }
            },
            onPlaybackEnd: () => {
                if (EditorState.isLooping) {
                    // Restart playback from beginning
                    EditorState.playbackPosition = 0;

                    // Reset audio first (before preview, since audio is master clock)
                    if (EditorState.audioElement && EditorState.audio?.loaded) {
                        EditorState.audioElement.currentTime = 0;
                        EditorState.audioElement.play().catch(e => console.warn('Loop audio play failed:', e));
                    }

                    // Reset and restart preview
                    if (EditorState.preview) {
                        EditorState.preview.seek(0);
                        EditorState.preview.play();
                        // Re-establish audio as master clock
                        if (EditorState.audioElement && EditorState.audio?.loaded) {
                            EditorState.preview.setTimeSource(() => EditorState.audioElement.currentTime);
                        }
                    }

                    // Reset timeline scroll
                    if (elements.timelineTracks) {
                        elements.timelineTracks.scrollLeft = 0;
                    }

                    updatePlayhead();
                    updateTimeScrubber();
                    return;
                }

                // Not looping - stop playback
                EditorState.isPlaying = false;

                // Stop audio
                if (EditorState.audioElement) {
                    EditorState.audioElement.pause();
                    EditorState.audioElement.currentTime = 0;
                }

                // Clear time source
                if (EditorState.preview) {
                    EditorState.preview.setTimeSource(null);
                }

                // Reset to start
                EditorState.playbackPosition = 0;
                if (elements.timelineTracks) {
                    elements.timelineTracks.scrollLeft = 0;
                }
                updatePlayhead();
                updateTimeScrubber();
                updatePlayButton();
            }
        });

        // Set project path for loading text backgrounds (wbg.png, bbg.png)
        EditorState.preview.setProjectPath(`working-assets/${EditorState.project.id}`);

        EditorState.preview.setScenes(EditorState.scenes);
        // Initial render to show placeholder/scene
        EditorState.preview.render();
    }

    // Reset playback position to start
    EditorState.playbackPosition = 0;

    // Update UI
    hideNoDataOverlay();
    updateProjectInfo();
    renderTimeline();
    renderTimeRuler();
    updateTimeScrubber();
    updatePlayhead(); // Ensure playhead starts at position 0

    // Load default audio
    loadDefaultAudio();

    // Auto-load images from working-assets/{project_id}/
    autoLoadProjectMedia();

    showToast(`Loaded project: ${EditorState.project.name}`, 'success');
}

/**
 * Auto-load images from working-assets/{project_id}/
 * Looks for files named 1.jpg, 1.png, 2.jpg, 2.png, etc. for each scene
 */
async function autoLoadProjectMedia() {
    const projectId = EditorState.project?.id;
    if (!projectId) {
        console.warn('No project ID available for auto-loading media');
        return;
    }

    const basePath = `working-assets/${projectId}/`;
    const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    let loadedCount = 0;

    // Try to load image for each scene (scenes are 1-indexed in naming)
    // Skip text-type scenes - they don't need images
    for (let i = 0; i < EditorState.scenes.length; i++) {
        const scene = EditorState.scenes[i];
        const sceneNumber = i + 1; // Scene numbers start at 1

        // Skip text scenes - they render text overlay instead of images
        if (scene.type === 'text') {
            console.log(`Skipping scene ${sceneNumber}: text type`);
            continue;
        }

        // Try each extension until one works
        for (const ext of imageExtensions) {
            const imagePath = `${basePath}${sceneNumber}.${ext}`;

            try {
                // Create a test image to check if file exists
                const exists = await checkImageExists(imagePath);
                if (exists) {
                    scene.mediaUrl = imagePath;
                    scene.mediaLoaded = true;
                    scene.image = `${sceneNumber}.${ext}`;
                    loadedCount++;
                    console.log(`Loaded scene ${sceneNumber}: ${imagePath}`);
                    break; // Found image, stop trying other extensions
                }
            } catch (error) {
                // File doesn't exist with this extension, try next
                continue;
            }
        }
    }

    // Update UI if any images were loaded
    if (loadedCount > 0) {
        // Hide placeholder if we have media
        elements.previewPlaceholder?.classList.add('hidden');

        // Update timeline to show thumbnails
        renderTimeline();

        // Update preview with loaded media
        if (EditorState.preview) {
            EditorState.preview.setScenes(EditorState.scenes);
            EditorState.preview.render();
        }

        // Update media status
        if (elements.mediaStatus) {
            elements.mediaStatus.textContent = `${loadedCount} images loaded`;
        }

        showToast(`Auto-loaded ${loadedCount} scene images`, 'success');
    } else {
        showToast(`No images found in working-assets/${projectId}/`, 'info');
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
        recalculateDuration(); // Recalc total duration including audio
        showToast('Audio loaded: ' + formatTimestamp(audio.duration), 'success');
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

        // Recalculate total duration
        recalculateDuration();
        renderTimeRuler();

        // Update preview duration
        if (EditorState.preview) {
            EditorState.preview.setDuration(getTotalDuration());
        }

        showToast(`Audio duration: ${formatTimestamp(EditorState.audio.trimmedDuration || EditorState.audio.duration)}`, 'info');
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

        return `
            <div class="scene-clip"
                 data-id="${scene.id}"
                 data-type="${scene.type}"
                 style="width: ${width}px; --scene-color: ${color};"
                 title="${scene.type} - ${scene.duration}s">
                <div class="scene-clip-thumb">
                    ${scene.mediaUrl
                ? `<img src="${scene.mediaUrl}" alt="Scene ${scene.id}">`
                : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <path d="M21 15l-5-5L5 21"/>
                           </svg>`
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

    durationInput?.addEventListener('change', (e) => {
        scene.duration = parseFloat(e.target.value) || 0.5;
        recalculateDuration();
        renderTimeline();
    });

    effectSelect?.addEventListener('change', (e) => {
        scene.visual_fx = e.target.value;
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
 */
function setupPlayheadDrag() {
    const playhead = document.getElementById('timeline-playhead');
    const timelineTracks = document.getElementById('timeline-tracks');

    if (!playhead || !timelineTracks) return;

    let isDragging = false;

    // Calculate time from X position using helper
    const getTimeFromX = (clientX) => {
        const tracksRect = timelineTracks.getBoundingClientRect();
        const relativeX = clientX - tracksRect.left - TRACK_BASE_OFFSET + timelineTracks.scrollLeft;
        const time = pixelsToTime(relativeX);
        return Math.max(0, Math.min(time, getTotalDuration()));
    };

    // Start drag on playhead
    playhead.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        playhead.classList.add('dragging');

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
        playhead.classList.add('dragging');

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
    });

    // End drag
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            playhead.classList.remove('dragging');
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
        });
    }

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

    // Setup export modal
    setupExportModal();
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
}

/**
 * Update zoom level - uses helper functions for precise calculation
 */
function updateZoom() {
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

    // Setup cancel button
    elements.cancelExportBtn?.addEventListener('click', async () => {
        await exportAPI.cancelExport();
        hideExportProgress();
        showToast('Export cancelled', 'info');
    }, { once: true });

    // Setup download button
    elements.downloadExportBtn?.addEventListener('click', () => {
        if (currentJobId) {
            exportAPI.downloadExport(currentJobId);
        }
    }, { once: true });
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
