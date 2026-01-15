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

        // Text background images cache (wbg.png = white text bg, bbg.png = black text bg)
        this.textBackgrounds = {
            white: null,  // Background for white text (dark bg image)
            black: null   // Background for black text (light bg image)
        };

        // Project base path for loading assets
        this.projectBasePath = '';

        // Background color
        this.backgroundColor = '#000000';
    }

    /**
     * Set project base path for loading text backgrounds
     */
    setProjectPath(basePath) {
        this.projectBasePath = basePath;
        this.loadTextBackgrounds();
    }

    /**
     * Load text background images from working-assets/{project_id}/
     * wbg.png = background for white text (typically dark)
     * bbg.png = background for black text (typically light)
     */
    async loadTextBackgrounds() {
        if (!this.projectBasePath) return;

        // Load white text background (wbg.png)
        const wbgPath = `${this.projectBasePath}/wbg.png`;
        try {
            const wbgImg = new Image();
            await new Promise((resolve, reject) => {
                wbgImg.onload = resolve;
                wbgImg.onerror = reject;
                wbgImg.src = wbgPath;
            });
            this.textBackgrounds.white = wbgImg;
            console.log('Loaded white text background:', wbgPath);
        } catch (e) {
            console.log('No white text background found at:', wbgPath);
        }

        // Load black text background (bbg.png)
        const bbgPath = `${this.projectBasePath}/bbg.png`;
        try {
            const bbgImg = new Image();
            await new Promise((resolve, reject) => {
                bbgImg.onload = resolve;
                bbgImg.onerror = reject;
                bbgImg.src = bbgPath;
            });
            this.textBackgrounds.black = bbgImg;
            console.log('Loaded black text background:', bbgPath);
        } catch (e) {
            console.log('No black text background found at:', bbgPath);
        }
    }

    /**
     * Set scenes for preview
     */
    setScenes(scenes) {
        this.scenes = scenes;
        const withMedia = scenes.filter(s => s.mediaUrl).length;
        console.log(`Preview: setScenes called with ${scenes.length} scenes (${withMedia} with mediaUrl)`);
        this.preloadImages().then(() => {
            console.log(`Preview: preloadImages complete, cache has ${this.imageCache.size} images`);
            this.render();
        });
    }

    /**
     * Preload all scene images
     */
    async preloadImages() {
        for (const scene of this.scenes) {
            if (scene.mediaUrl && !this.imageCache.has(scene.id)) {
                const img = new Image();
                // Only set crossOrigin for non-local URLs (blob: or http:)
                if (scene.mediaUrl.startsWith('blob:') || scene.mediaUrl.startsWith('http')) {
                    img.crossOrigin = 'anonymous';
                }

                try {
                    await new Promise((resolve, reject) => {
                        img.onload = () => {
                            console.log(`Preview: Loaded image for scene ${scene.id}`);
                            resolve();
                        };
                        img.onerror = (e) => {
                            console.warn(`Preview: Failed to load image for scene ${scene.id}:`, scene.mediaUrl, e);
                            reject(e);
                        };
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

        // For text scenes, render background + text overlay
        if (scene.type === 'text') {
            this.renderTextScene(scene, progress);
            return;
        }

        // For image/video scenes, render media with effects
        if (img) {
            this.renderImage(img, scene.visual_fx || 'static', progress);
        } else {
            this.renderPlaceholder(scene);
        }
    }

    /**
     * Render a text scene with optional background image
     * Uses wbg.png for white text, bbg.png for black text
     */
    renderTextScene(scene, progress) {
        // Determine text color preference (default: white text on dark background)
        const textColor = scene.text_color || 'white';
        const bgImage = textColor === 'white' ? this.textBackgrounds.white : this.textBackgrounds.black;

        // Render background at full opacity (no fade on background)
        if (bgImage) {
            this.renderBackgroundImage(bgImage);
        } else {
            // Fallback to solid background
            this.ctx.fillStyle = textColor === 'white' ? '#000000' : '#ffffff';
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        // Render text on top with fade effect
        const textContent = scene.text_content || scene.script;
        if (textContent) {
            this.renderTextOverlay(textContent, progress, {
                color: textColor,
                size: scene.text_size || 48,
                style: scene.font_style || 'bold',
                fontFamily: scene.font_family || 'Inter',
                textAlign: scene.text_align || 'center',
                verticalAlign: scene.vertical_align || 'center',
                textX: scene.text_x,
                textY: scene.text_y
            });
        }

        // Store current scene for drag reference
        this.currentTextScene = scene;
    }

    /**
     * Render background image (cover fit)
     */
    renderBackgroundImage(img) {
        const imgAspect = img.width / img.height;
        const canvasAspect = this.width / this.height;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (imgAspect > canvasAspect) {
            drawHeight = this.height;
            drawWidth = drawHeight * imgAspect;
            offsetX = (this.width - drawWidth) / 2;
            offsetY = 0;
        } else {
            drawWidth = this.width;
            drawHeight = drawWidth / imgAspect;
            offsetX = 0;
            offsetY = (this.height - drawHeight) / 2;
        }

        this.ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    }

    /**
     * Render text overlay with specified options
     * @param {string} text - Text to render
     * @param {number} progress - Animation progress (0-1)
     * @param {object|string} options - Text options or legacy textColor string
     */
    renderTextOverlay(text, progress, options = {}) {
        // Support legacy string parameter for backward compatibility
        if (typeof options === 'string') {
            options = { color: options };
        }

        const textColor = options.color || 'white';
        const textSize = options.size || 48;
        const fontStyle = options.style || 'bold';
        const fontFamily = options.fontFamily || 'Inter';
        const textAlign = options.textAlign || 'center';
        const verticalAlign = options.verticalAlign || 'center';
        // Custom position (0-100 percentage, null means use alignment)
        const textX = options.textX;
        const textY = options.textY;

        this.ctx.save();

        // Apply fade effect based on progress
        const fadeIn = Math.min(1, progress * 4); // Fade in during first 25%
        const fadeOut = Math.min(1, (1 - progress) * 4); // Fade out during last 25%
        this.ctx.globalAlpha = Math.min(fadeIn, fadeOut);

        // Text styling based on color preference
        this.ctx.fillStyle = textColor === 'white' ? '#ffffff' : '#000000';
        this.ctx.textBaseline = 'middle';

        // Calculate font size - support both pixel values and legacy string values
        let baseFontSize;
        if (typeof textSize === 'number') {
            // Pixel value - scale relative to canvas (canvas is 1080x1920, scale accordingly)
            baseFontSize = textSize * (this.height / 1920);
        } else {
            // Legacy string value for backward compatibility
            const sizeMultipliers = {
                small: 0.6,
                medium: 1.0,
                large: 1.4,
                xlarge: 1.8
            };
            const sizeMultiplier = sizeMultipliers[textSize] || 1.0;
            baseFontSize = Math.min(48, this.height / 10) * sizeMultiplier;
        }

        // Build font string based on style
        let fontWeight = '400';  // normal
        let fontStyleStr = 'normal';

        switch (fontStyle) {
            case 'bold':
                fontWeight = '700';
                break;
            case 'light':
                fontWeight = '300';
                break;
            case 'italic':
                fontStyleStr = 'italic';
                break;
            case 'bold-italic':
                fontWeight = '700';
                fontStyleStr = 'italic';
                break;
            case 'normal':
            default:
                fontWeight = '400';
                break;
        }

        const fontString = `${fontStyleStr} ${fontWeight} ${baseFontSize}px "${fontFamily}", sans-serif`;

        // Word wrap the text
        const maxWidth = this.width * 0.9; // 90% of canvas width
        const lines = this.wrapText(text, maxWidth, baseFontSize, fontString);
        const lineHeight = baseFontSize * 1.3;
        const totalHeight = lines.length * lineHeight;

        // Calculate position - use custom position if set, otherwise use alignment
        let finalX, finalY;

        if (textX !== null && textX !== undefined) {
            // Custom position: percentage (0-100) of canvas
            finalX = (textX / 100) * this.width;
            this.ctx.textAlign = 'center'; // Always center-align when using custom position
        } else {
            // Use text alignment
            this.ctx.textAlign = textAlign;
            switch (textAlign) {
                case 'left':
                    finalX = this.width * 0.05; // 5% padding from left
                    break;
                case 'right':
                    finalX = this.width * 0.95; // 5% padding from right
                    break;
                case 'center':
                default:
                    finalX = this.width / 2;
                    break;
            }
        }

        if (textY !== null && textY !== undefined) {
            // Custom position: percentage (0-100) of canvas
            finalY = (textY / 100) * this.height;
        } else {
            // Use vertical alignment
            switch (verticalAlign) {
                case 'top':
                    finalY = lineHeight / 2 + (this.height * 0.05); // 5% padding from top
                    break;
                case 'bottom':
                    finalY = this.height - totalHeight + lineHeight / 2 - (this.height * 0.05); // 5% padding from bottom
                    break;
                case 'center':
                default:
                    finalY = (this.height - totalHeight) / 2 + lineHeight / 2;
                    break;
            }
        }

        // Store text bounds for hit testing (used for dragging)
        this.lastTextBounds = {
            x: finalX,
            y: finalY,
            width: maxWidth,
            height: totalHeight,
            lines: lines,
            lineHeight: lineHeight
        };

        // Draw each line
        this.ctx.font = fontString;
        lines.forEach((line, index) => {
            this.ctx.fillText(line, finalX, finalY + index * lineHeight);
        });

        this.ctx.restore();
    }

    /**
     * Wrap text to fit within maxWidth
     * @param {string} text - Text to wrap
     * @param {number} maxWidth - Maximum line width
     * @param {number} fontSize - Font size (used for fallback font string)
     * @param {string} fontString - Optional full font string to use
     */
    wrapText(text, maxWidth, fontSize, fontString = null) {
        this.ctx.font = fontString || `bold ${fontSize}px Inter, sans-serif`;
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const metrics = this.ctx.measureText(testLine);

            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }

        if (currentLine) {
            lines.push(currentLine);
        }

        return lines;
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
     * Enable text dragging on the canvas
     * @param {function} onPositionChange - Callback when text position changes (x, y in percentage)
     */
    enableTextDrag(onPositionChange) {
        this.onTextPositionChange = onPositionChange;
        this.isDraggingText = false;
        this.dragStartPos = null;

        // Mouse event handlers
        this.canvas.addEventListener('mousedown', this._handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this._handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this._handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this._handleMouseUp.bind(this));

        // Touch event handlers for mobile
        this.canvas.addEventListener('touchstart', this._handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this._handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this._handleTouchEnd.bind(this));
    }

    /**
     * Get mouse position relative to canvas
     */
    _getCanvasPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    /**
     * Check if position is within text bounds
     */
    _isOverText(pos) {
        if (!this.lastTextBounds || !this.currentTextScene) return false;

        const bounds = this.lastTextBounds;
        const halfWidth = bounds.width / 2;
        const halfHeight = bounds.height / 2;

        return pos.x >= bounds.x - halfWidth &&
               pos.x <= bounds.x + halfWidth &&
               pos.y >= bounds.y - halfHeight &&
               pos.y <= bounds.y + bounds.height - halfHeight;
    }

    /**
     * Handle mouse down - start dragging if over text
     */
    _handleMouseDown(e) {
        if (!this.currentTextScene) return;

        const pos = this._getCanvasPos(e);
        if (this._isOverText(pos)) {
            this.isDraggingText = true;
            this.dragStartPos = pos;
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
        }
    }

    /**
     * Handle mouse move - update text position while dragging
     */
    _handleMouseMove(e) {
        const pos = this._getCanvasPos(e);

        if (this.isDraggingText && this.currentTextScene) {
            // Calculate new position as percentage
            const newX = (pos.x / this.width) * 100;
            const newY = (pos.y / this.height) * 100;

            // Clamp to canvas bounds (5% padding)
            const clampedX = Math.max(5, Math.min(95, newX));
            const clampedY = Math.max(5, Math.min(95, newY));

            // Update scene position
            this.currentTextScene.text_x = clampedX;
            this.currentTextScene.text_y = clampedY;

            // Re-render
            this.render();

            // Notify callback
            if (this.onTextPositionChange) {
                this.onTextPositionChange(clampedX, clampedY, this.currentTextScene);
            }

            e.preventDefault();
        } else {
            // Update cursor based on hover state
            if (this._isOverText(pos) && this.currentTextScene) {
                this.canvas.style.cursor = 'grab';
            } else {
                this.canvas.style.cursor = 'default';
            }
        }
    }

    /**
     * Handle mouse up - stop dragging
     */
    _handleMouseUp(e) {
        if (this.isDraggingText) {
            this.isDraggingText = false;
            this.dragStartPos = null;
            this.canvas.style.cursor = this._isOverText(this._getCanvasPos(e)) ? 'grab' : 'default';
        }
    }

    /**
     * Handle touch start
     */
    _handleTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this._handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
        }
    }

    /**
     * Handle touch move
     */
    _handleTouchMove(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this._handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
        }
    }

    /**
     * Handle touch end
     */
    _handleTouchEnd(e) {
        this._handleMouseUp({ clientX: 0, clientY: 0 });
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
