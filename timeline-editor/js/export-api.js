/**
 * Export API Module
 * Handles communication with the Python backend for video export
 */

const DEFAULT_API_URL = 'http://localhost:5000';

export class ExportAPI {
    constructor(baseUrl = DEFAULT_API_URL) {
        this.baseUrl = baseUrl;
        this.currentJobId = null;
        this.pollInterval = null;
    }

    /**
     * Check if the backend server is available and FFmpeg is installed
     * @returns {Object} { available: boolean, ffmpeg: boolean, error: string|null }
     */
    async checkHealth() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${this.baseUrl}/api/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                return { available: false, ffmpeg: false, error: 'Server returned error' };
            }

            const data = await response.json();
            return {
                available: true,
                ffmpeg: data.ffmpeg === true,
                error: null
            };
        } catch (error) {
            if (error.name === 'AbortError') {
                return { available: false, ffmpeg: false, error: 'Server timeout' };
            }
            console.error('Health check failed:', error);
            return { available: false, ffmpeg: false, error: error.message };
        }
    }

    /**
     * Start a video export job
     * @param {Object} exportData - Export configuration
     * @param {Function} onProgress - Progress callback (progress, message)
     * @param {Function} onComplete - Completion callback (success, result)
     */
    async startExport(exportData, onProgress, onComplete) {
        try {
            // Check server health first
            const health = await this.checkHealth();

            if (!health.available) {
                onComplete(false, {
                    error: `Backend server not available. ${health.error || 'Please run run.bat to start the server.'}`
                });
                return null;
            }

            if (!health.ffmpeg) {
                onComplete(false, {
                    error: 'FFmpeg not found. Please install FFmpeg to backend/bin/ folder.'
                });
                return null;
            }

            onProgress(0, 'Starting export...');

            const response = await fetch(`${this.baseUrl}/api/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(exportData)
            });

            if (!response.ok) {
                const error = await response.json();
                onComplete(false, { error: error.error || 'Export failed to start' });
                return null;
            }

            const result = await response.json();
            this.currentJobId = result.job_id;

            // Start polling for status
            this.startPolling(onProgress, onComplete);

            return result.job_id;
        } catch (error) {
            console.error('Export error:', error);
            onComplete(false, { error: error.message });
            return null;
        }
    }

    /**
     * Start polling for export status
     */
    startPolling(onProgress, onComplete) {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        // Track consecutive failures for resilience
        let consecutiveFailures = 0;
        const maxFailures = 5;

        const poll = async () => {
            const status = await this.getStatus();

            if (!status) {
                consecutiveFailures++;
                console.warn(`Status check failed (${consecutiveFailures}/${maxFailures})`);

                if (consecutiveFailures >= maxFailures) {
                    this.stopPolling();
                    onComplete(false, { error: 'Lost connection to server. Please check if the backend is running.' });
                }
                return;
            }

            // Reset failure counter on success
            consecutiveFailures = 0;

            onProgress(status.progress, status.message);

            if (status.status === 'completed') {
                this.stopPolling();
                onComplete(true, {
                    jobId: this.currentJobId,
                    downloadUrl: `${this.baseUrl}/api/export/${this.currentJobId}/download`
                });
            } else if (status.status === 'failed') {
                this.stopPolling();
                onComplete(false, { error: status.error || status.message });
            }
        };

        // Initial poll immediately
        poll();

        // Then poll every 2 seconds (less aggressive)
        this.pollInterval = setInterval(poll, 2000);
    }

    /**
     * Stop polling for status
     */
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Get status of current export job
     */
    async getStatus() {
        if (!this.currentJobId) return null;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch(
                `${this.baseUrl}/api/export/${this.currentJobId}/status`,
                { signal: controller.signal }
            );

            clearTimeout(timeoutId);

            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Status check timed out');
            } else {
                console.error('Status check failed:', error);
            }
            return null;
        }
    }

    /**
     * Cancel current export job
     */
    async cancelExport() {
        this.stopPolling();

        if (!this.currentJobId) return;

        try {
            await fetch(`${this.baseUrl}/api/export/${this.currentJobId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('Cancel failed:', error);
        }

        this.currentJobId = null;
    }

    /**
     * Download completed export
     */
    downloadExport(jobId) {
        const url = `${this.baseUrl}/api/export/${jobId || this.currentJobId}/download`;
        window.open(url, '_blank');
    }
}

/**
 * Prepare comprehensive export data for Python backend
 * This includes all information needed to render the final video with FFmpeg
 */
export function prepareExportData(project, scenes, mediaFolder, audioConfig = null) {
    // Calculate total scenes duration
    const scenesDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

    // Determine total video duration (max of scenes and trimmed audio)
    const audioDuration = audioConfig?.trimmedDuration || audioConfig?.duration || 0;
    const totalDuration = Math.max(scenesDuration, audioDuration);

    return {
        // Project identification
        project_id: project.id,
        project_name: project.name,

        // Media paths - backend will resolve files from here
        media_base_path: `working-assets/${project.id}`,

        // Output video settings
        output: {
            resolution: {
                width: 1080,
                height: 1920
            },
            fps: 30,
            codec: 'libx264',
            pixel_format: 'yuv420p',
            preset: 'medium',  // FFmpeg preset: ultrafast, fast, medium, slow
            crf: 23,           // Quality: 0-51, lower = better quality
            format: 'mp4'
        },

        // Audio configuration
        audio: audioConfig ? {
            file: audioConfig.file,
            path: audioConfig.path,
            original_duration: audioConfig.duration,
            trimmed_duration: audioConfig.trimmedDuration || audioConfig.duration,
            volume: audioConfig.volume || 1.0,
            start_offset: audioConfig.start_offset || 0,
            fade_out: 0.5  // Fade out audio at end
        } : null,

        // Timeline metadata
        timeline: {
            total_duration: totalDuration,
            scenes_duration: scenesDuration,
            scene_count: scenes.length,
            created_at: new Date().toISOString()
        },

        // Scene-by-scene export data
        scenes: scenes.map((scene, index) => {
            // Calculate start time based on previous scenes
            let startTime = 0;
            for (let i = 0; i < index; i++) {
                startTime += scenes[i].duration;
            }

            const mediaType = getMediaType(scene);
            const isTextScene = mediaType === 'text';

            return {
                // Scene identification
                id: scene.id,
                index: index,
                type: scene.type,

                // Timing
                start_time: startTime,
                duration: scene.duration,
                end_time: startTime + scene.duration,

                // Media source
                media: {
                    type: mediaType,
                    // For image scenes: filename in working-assets/{project_id}/
                    file: isTextScene ? null : (scene.image || `${index + 1}.jpg`),
                    // Full path for backend to use
                    path: isTextScene ? null : `working-assets/${project.id}/${scene.image || `${index + 1}.jpg`}`
                },

                // Text content (for text-type scenes)
                text: isTextScene ? {
                    content: scene.text_content || scene.script || '',
                    font_family: scene.font_family || 'Inter',
                    font_size: scene.text_size || 48,
                    font_style: scene.font_style || 'bold',
                    // Text color: 'white' or 'black' (determines background)
                    color: scene.text_color || 'white',
                    color_hex: (scene.text_color || 'white') === 'white' ? '#ffffff' : '#000000',
                    // Text position (percentage 0-100, null = use alignment)
                    position: {
                        x: scene.text_x ?? null,  // null means use text_align
                        y: scene.text_y ?? null   // null means use vertical_align
                    },
                    // Text alignment (used when position is null)
                    text_align: scene.text_align || 'center',
                    vertical_align: scene.vertical_align || 'center',
                    // Background options
                    background: {
                        // Use image background if available
                        // wbg.png = background for white text (dark/image bg)
                        // bbg.png = background for black text (light/image bg)
                        image: (scene.text_color || 'white') === 'white' ? 'wbg.png' : 'bbg.png',
                        image_path: `working-assets/${project.id}/${(scene.text_color || 'white') === 'white' ? 'wbg.png' : 'bbg.png'}`,
                        // Fallback solid color if no image
                        fallback_color: (scene.text_color || 'white') === 'white' ? '#000000' : '#ffffff'
                    },
                    fade_in: 0.25,   // Fade in during first 25% of duration
                    fade_out: 0.25  // Fade out during last 25% of duration
                } : null,

                // Visual effect
                effect: getEffectConfig(scene.visual_fx || 'static'),

                // Transition to next scene
                transition: {
                    type: index < scenes.length - 1 ? 'crossfade' : 'none',
                    duration: index < scenes.length - 1 ? 0.3 : 0
                }
            };
        })
    };
}

/**
 * Get detailed effect configuration for FFmpeg
 */
function getEffectConfig(effectType) {
    const effects = {
        'static': {
            type: 'static',
            description: 'No animation'
        },
        'zoom_in': {
            type: 'zoom_in',
            description: 'Ken Burns zoom in effect',
            start_scale: 1.0,
            end_scale: 1.2,
            anchor: 'center',  // center, top, bottom, left, right
            easing: 'ease_in_out'
        },
        'zoom_out': {
            type: 'zoom_out',
            description: 'Ken Burns zoom out effect',
            start_scale: 1.2,
            end_scale: 1.0,
            anchor: 'center',
            easing: 'ease_in_out'
        },
        'pan_left': {
            type: 'pan_left',
            description: 'Horizontal pan from right to left',
            pan_amount: 0.2,  // 20% of image width
            easing: 'linear'
        },
        'pan_right': {
            type: 'pan_right',
            description: 'Horizontal pan from left to right',
            pan_amount: 0.2,
            easing: 'linear'
        },
        'pan_up': {
            type: 'pan_up',
            description: 'Vertical pan from bottom to top',
            pan_amount: 0.2,
            easing: 'linear'
        },
        'pan_down': {
            type: 'pan_down',
            description: 'Vertical pan from top to bottom',
            pan_amount: 0.2,
            easing: 'linear'
        },
        'fade': {
            type: 'fade',
            description: 'Fade in from black',
            fade_duration: 0.5
        },
        'shake': {
            type: 'shake',
            description: 'Camera shake effect',
            intensity: 5,      // Pixels of movement
            frequency: 20      // Shakes per second
        }
    };

    return effects[effectType] || effects['static'];
}

/**
 * Get media type for a scene
 */
function getMediaType(scene) {
    // Text scenes don't have media files
    if (scene.type === 'text' || scene.type === 'cta') {
        return 'text';
    }

    // Check file extension if image is specified
    if (scene.image) {
        const ext = scene.image.split('.').pop().toLowerCase();
        if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) {
            return 'video';
        }
    }

    return 'image';
}

/**
 * Validate export data before sending to backend
 */
export function validateExportData(exportData) {
    const errors = [];
    const warnings = [];

    // Check project ID
    if (!exportData.project_id) {
        errors.push('Missing project ID');
    }

    // Check scenes
    if (!exportData.scenes || exportData.scenes.length === 0) {
        errors.push('No scenes to export');
    }

    // Validate each scene
    exportData.scenes?.forEach((scene, index) => {
        if (scene.duration <= 0) {
            errors.push(`Scene ${index + 1}: Invalid duration (${scene.duration}s)`);
        }

        if (scene.media.type === 'image' && !scene.media.file) {
            warnings.push(`Scene ${index + 1}: No media file specified`);
        }

        if (scene.media.type === 'text' && !scene.text?.content) {
            // Only warn if it's explicitly a text type, not CTA (which may just show background)
            if (scene.type === 'text') {
                warnings.push(`Scene ${index + 1}: Text scene has no script content (will show background only)`);
            }
        }
    });

    // Check audio
    if (exportData.audio && !exportData.audio.path) {
        warnings.push('Audio specified but no file path');
    }

    // Check total duration
    if (exportData.timeline.total_duration <= 0) {
        errors.push('Total duration must be greater than 0');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}
