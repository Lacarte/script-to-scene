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
     * Check if the backend server is available
     */
    async checkHealth() {
        try {
            const response = await fetch(`${this.baseUrl}/api/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            return response.ok;
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
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
            const healthy = await this.checkHealth();
            if (!healthy) {
                onComplete(false, { error: 'Backend server not available. Please start the server.' });
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

        this.pollInterval = setInterval(async () => {
            const status = await this.getStatus();

            if (!status) {
                this.stopPolling();
                onComplete(false, { error: 'Failed to get export status' });
                return;
            }

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
        }, 1000); // Poll every second
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
            const response = await fetch(
                `${this.baseUrl}/api/export/${this.currentJobId}/status`
            );

            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('Status check failed:', error);
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
 * Prepare export data from editor state
 */
export function prepareExportData(project, scenes, mediaFolder, audioConfig = null) {
    return {
        project_id: project.id,
        media_folder: mediaFolder,
        output: {
            resolution: [1080, 1920],
            fps: 30,
            codec: 'h264',
            quality: 'high'
        },
        audio: audioConfig,
        scenes: scenes.map((scene, index) => {
            // Calculate start time based on previous scenes
            let startTime = 0;
            for (let i = 0; i < index; i++) {
                startTime += scenes[i].duration;
            }

            return {
                id: scene.id,
                media_file: scene.image || `scene_${scene.id}.jpg`,
                media_type: getMediaType(scene),
                start_time: startTime,
                duration: scene.duration,
                effect: {
                    type: scene.visual_fx || 'static',
                    start_scale: 1.0,
                    end_scale: scene.visual_fx === 'zoom_in' ? 1.2 : (scene.visual_fx === 'zoom_out' ? 0.8 : 1.0)
                },
                transition_out: {
                    type: 'crossfade',
                    duration: 0.3
                }
            };
        })
    };
}

/**
 * Get media type for a scene
 */
function getMediaType(scene) {
    if (scene.type === 'text' || scene.type === 'cta') {
        return 'text';
    }
    if (scene.image) {
        const ext = scene.image.split('.').pop().toLowerCase();
        if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) {
            return 'video';
        }
    }
    return 'image';
}
