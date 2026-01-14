/**
 * Canvas Preview Module
 * Handles rendering scenes to canvas for real-time preview
 */

export class CanvasPreview {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;

        this.scenes = [];
        this.currentTime = 0;
        this.isPlaying = false;
        this.lastFrameTime = 0;
        this.animationId = null;

        this.onTimeUpdate = options.onTimeUpdate || (() => { });
        this.onPlaybackEnd = options.onPlaybackEnd || (() => { });

        // Image cache
        this.imageCache = new Map();

        // Background color
        this.backgroundColor = '#000000';
    }

    /**
     * Set scenes for preview
     */
    setScenes(scenes) {
        this.scenes = scenes;
        this.preloadImages();
    }

    /**
     * Preload all scene images
     */
    async preloadImages() {
        for (const scene of this.scenes) {
            if (scene.mediaUrl && !this.imageCache.has(scene.id)) {
                const img = new Image();
                img.crossOrigin = 'anonymous';

                try {
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = scene.mediaUrl;
                    });
                    this.imageCache.set(scene.id, img);
                } catch (error) {
                    console.warn(`Failed to load image for scene ${scene.id}:`, error);
                }
            }
        }
    }

    /**
     * Get current scene based on playback time
     */
    getCurrentScene() {
        let accumulated = 0;

        for (const scene of this.scenes) {
            if (this.currentTime >= accumulated && this.currentTime < accumulated + scene.duration) {
                return {
                    scene,
                    localTime: this.currentTime - accumulated,
                    progress: (this.currentTime - accumulated) / scene.duration
                };
            }
            accumulated += scene.duration;
        }

        return null;
    }

    /**
     * Get total duration of all scenes
     */
    getTotalDuration() {
        const scenesDuration = this.scenes.reduce((sum, scene) => sum + scene.duration, 0);
        return Math.max(scenesDuration, this.overrideDuration || 0);
    }

    /**
     * Set override duration (e.g. for audio)
     */
    setDuration(duration) {
        this.overrideDuration = duration;
    }

    /**
     * Seek to specific time
     */
    seek(time) {
        this.currentTime = Math.max(0, Math.min(time, this.getTotalDuration()));
        this.render();
        this.onTimeUpdate(this.currentTime);
    }

    /**
     * Start playback
     */
    play() {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this.lastFrameTime = performance.now();
        this.tick();
    }

    /**
     * Pause playback
     */
    pause() {
        this.isPlaying = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Toggle play/pause
     */
    toggle() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
        return this.isPlaying;
    }

    /**
     * Set external time source (e.g., audio element)
     */
    setTimeSource(getTime) {
        this.externalTimeSource = getTime;
    }

    /**
     * Animation tick
     */
    tick() {
        if (!this.isPlaying) return;

        // Use external time source if available (e.g., audio element for perfect sync)
        if (this.externalTimeSource) {
            this.currentTime = this.externalTimeSource();
        } else {
            const now = performance.now();
            const delta = (now - this.lastFrameTime) / 1000;
            this.lastFrameTime = now;
            this.currentTime += delta;
        }

        const totalDuration = this.getTotalDuration();
        if (this.currentTime >= totalDuration) {
            this.currentTime = 0;
            this.pause();
            this.onPlaybackEnd();
            this.render();
            return;
        }

        this.render();
        this.onTimeUpdate(this.currentTime);

        this.animationId = requestAnimationFrame(() => this.tick());
    }

    /**
     * Render current frame
     */
    render() {
        // Clear canvas
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, this.width, this.height);

        const current = this.getCurrentScene();
        if (!current) return;

        const { scene, progress } = current;
        const img = this.imageCache.get(scene.id);

        if (img) {
            this.renderImage(img, scene.visual_fx || 'static', progress);
        } else {
            this.renderPlaceholder(scene);
        }
    }

    /**
     * Render image with effect
     */
    renderImage(img, effect, progress) {
        this.ctx.save();

        // Calculate how to fit image in canvas (cover)
        const imgAspect = img.width / img.height;
        const canvasAspect = this.width / this.height;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (imgAspect > canvasAspect) {
            // Image is wider - fit to height
            drawHeight = this.height;
            drawWidth = drawHeight * imgAspect;
            offsetX = (this.width - drawWidth) / 2;
            offsetY = 0;
        } else {
            // Image is taller - fit to width
            drawWidth = this.width;
            drawHeight = drawWidth / imgAspect;
            offsetX = 0;
            offsetY = (this.height - drawHeight) / 2;
        }

        // Apply effect
        switch (effect) {
            case 'zoom_in':
                this.applyZoomIn(progress, drawWidth, drawHeight, offsetX, offsetY);
                break;
            case 'zoom_out':
                this.applyZoomOut(progress, drawWidth, drawHeight, offsetX, offsetY);
                break;
            case 'pan_left':
                this.applyPanLeft(progress, drawWidth, drawHeight, offsetY);
                break;
            case 'pan_right':
                this.applyPanRight(progress, drawWidth, drawHeight, offsetY);
                break;
            case 'fade':
                this.ctx.globalAlpha = this.easeInOut(progress);
                break;
            case 'shake':
                this.applyShake(progress);
                break;
            case 'static':
            default:
                // No transform needed
                break;
        }

        this.ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
        this.ctx.restore();
    }

    /**
     * Apply zoom in effect
     */
    applyZoomIn(progress, drawWidth, drawHeight, offsetX, offsetY) {
        const startScale = 1.0;
        const endScale = 1.2;
        const scale = startScale + (endScale - startScale) * this.easeInOut(progress);

        const centerX = this.width / 2;
        const centerY = this.height / 2;

        this.ctx.translate(centerX, centerY);
        this.ctx.scale(scale, scale);
        this.ctx.translate(-centerX, -centerY);
    }

    /**
     * Apply zoom out effect
     */
    applyZoomOut(progress, drawWidth, drawHeight, offsetX, offsetY) {
        const startScale = 1.2;
        const endScale = 1.0;
        const scale = startScale + (endScale - startScale) * this.easeInOut(progress);

        const centerX = this.width / 2;
        const centerY = this.height / 2;

        this.ctx.translate(centerX, centerY);
        this.ctx.scale(scale, scale);
        this.ctx.translate(-centerX, -centerY);
    }

    /**
     * Apply pan left effect
     */
    applyPanLeft(progress, drawWidth, drawHeight, offsetY) {
        const panAmount = (drawWidth - this.width) * 0.5;
        const translateX = panAmount * (1 - progress);
        this.ctx.translate(-translateX, 0);
    }

    /**
     * Apply pan right effect
     */
    applyPanRight(progress, drawWidth, drawHeight, offsetY) {
        const panAmount = (drawWidth - this.width) * 0.5;
        const translateX = panAmount * progress;
        this.ctx.translate(-translateX, 0);
    }

    /**
     * Apply shake effect
     */
    applyShake(progress) {
        const intensity = 5;
        const frequency = 20;
        const shakeX = Math.sin(progress * Math.PI * 2 * frequency) * intensity;
        const shakeY = Math.cos(progress * Math.PI * 2 * frequency) * intensity;
        this.ctx.translate(shakeX, shakeY);
    }

    /**
     * Easing function for smooth animations
     */
    easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    /**
     * Render placeholder when no image is loaded
     */
    renderPlaceholder(scene) {
        // Background gradient based on scene type
        const colors = {
            hook: '#FF4444',
            buildup: '#FF8C00',
            text: '#AA44FF',
            peak: '#FFDD00',
            transition: '#4488FF',
            cta: '#44FF44',
            speaker: '#FF44AA',
            final_statement: '#44FFFF'
        };

        const color = colors[scene.type] || '#666666';

        // Create gradient
        const gradient = this.ctx.createLinearGradient(0, 0, this.width, this.height);
        gradient.addColorStop(0, this.hexToRgba(color, 0.3));
        gradient.addColorStop(1, this.hexToRgba(color, 0.1));

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Draw scene type label
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 48px Inter, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(scene.type.toUpperCase(), this.width / 2, this.height / 2 - 30);

        // Draw scene ID
        this.ctx.font = '32px Inter, sans-serif';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.fillText(`Scene ${scene.id}`, this.width / 2, this.height / 2 + 30);
    }

    /**
     * Convert hex color to rgba
     */
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.pause();
        this.imageCache.forEach(img => {
            if (img.src.startsWith('blob:')) {
                URL.revokeObjectURL(img.src);
            }
        });
        this.imageCache.clear();
    }
}
