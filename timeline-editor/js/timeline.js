import { State } from './state.js';
import { SCENE_COLORS, VFX_ICONS, SCENE_TYPE_ICONS, formatTimestamp, getTotalDuration } from './utils.js';
import { getSceneErrors, ErrorType } from './validation.js';

// Format scene type for display (remove underscores, capitalize)
function formatSceneType(type) {
    const typeMap = {
        'hook': 'Hook',
        'buildup': 'Build',
        'text': 'Text',
        'peak': 'Peak',
        'transition': 'Trans',
        'cta': 'CTA',
        'speaker': 'Speaker',
        'final_statement': 'Final'
    };
    return typeMap[type] || type;
}

class TimelineRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.viewport = document.querySelector('.timeline-viewport');
        this.indicator = document.querySelector('.timeline-scroll-indicator');
        this.indicatorLeft = document.querySelector('.timeline-scroll-indicator-left');
        this.onSceneClick = null;

        // Subscribe to state changes
        State.subscribe(['scenes', 'selectedScene', 'validationErrors'], () => {
            this.render();
            this.checkScroll();
        });

        // Scroll listener
        if (this.viewport) {
            this.viewport.addEventListener('scroll', () => this.checkScroll());
            window.addEventListener('resize', () => this.checkScroll());

            // Mouse wheel horizontal scrolling
            this.viewport.addEventListener('wheel', (e) => {
                // Only handle if there's horizontal overflow
                if (this.viewport.scrollWidth > this.viewport.clientWidth) {
                    e.preventDefault();
                    // Use deltaY for vertical scroll wheel, convert to horizontal
                    const scrollAmount = e.deltaY || e.deltaX;
                    this.viewport.scrollLeft += scrollAmount;
                }
            }, { passive: false });
        }

        // Click on right indicator to go to last scene
        if (this.indicator) {
            this.indicator.style.cursor = 'pointer';
            this.indicator.addEventListener('click', () => {
                const scenes = State.get('scenes');
                if (scenes && scenes.length > 0) {
                    const lastScene = scenes[scenes.length - 1];
                    if (this.onSceneClick) {
                        this.onSceneClick(lastScene);
                    }
                    this.scrollToScene(lastScene.scene_id);
                }
            });
        }

        // Click on left indicator to go to first scene
        if (this.indicatorLeft) {
            this.indicatorLeft.style.cursor = 'pointer';
            this.indicatorLeft.addEventListener('click', () => {
                const scenes = State.get('scenes');
                if (scenes && scenes.length > 0) {
                    const firstScene = scenes[0];
                    if (this.onSceneClick) {
                        this.onSceneClick(firstScene);
                    }
                    this.scrollToScene(firstScene.scene_id);
                }
            });
        }
    }

    checkScroll() {
        if (!this.viewport) return;

        const hasOverflow = this.viewport.scrollWidth > this.viewport.clientWidth;
        const reachedEnd = Math.abs(this.viewport.scrollWidth - this.viewport.clientWidth - this.viewport.scrollLeft) < 10;
        const atStart = this.viewport.scrollLeft < 10;

        // Right indicator
        if (this.indicator) {
            if (hasOverflow && !reachedEnd) {
                this.indicator.classList.add('visible');
            } else {
                this.indicator.classList.remove('visible');
            }
        }

        // Left indicator
        if (this.indicatorLeft) {
            if (hasOverflow && !atStart) {
                this.indicatorLeft.classList.add('visible');
            } else {
                this.indicatorLeft.classList.remove('visible');
            }
        }
    }

    render() {
        const scenes = State.get('scenes');
        const selectedScene = State.get('selectedScene');
        const errors = State.get('validationErrors');

        // Update stats
        const sceneCount = scenes ? scenes.length : 0;
        const totalDuration = getTotalDuration(scenes || []);

        const countEl = document.getElementById('stats-scenes');
        const durEl = document.getElementById('stats-duration');

        if (countEl) countEl.innerHTML = `<strong>${sceneCount}</strong> scenes`;
        if (durEl) durEl.innerHTML = `<strong>${formatTimestamp(totalDuration)}</strong> total`;

        // Update status badges
        const doneCount = scenes ? scenes.filter(s => s.status === 'done').length : 0;
        const pendingCount = scenes ? scenes.filter(s => s.status === 'pending').length : 0;
        const errorCount = errors ? errors.filter(e => e.type === ErrorType.ERROR).length : 0;

        const badgeDone = document.querySelector('#badge-done .badge-count');
        const badgePending = document.querySelector('#badge-pending .badge-count');
        const badgeError = document.querySelector('#badge-error .badge-count');

        if (badgeDone) badgeDone.textContent = doneCount;
        if (badgePending) badgePending.textContent = pendingCount;
        if (badgeError) badgeError.textContent = errorCount;

        if (!scenes || scenes.length === 0) {
            this.container.innerHTML = `
                <div class="timeline-empty">
                    <div class="empty-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="2" y="4" width="20" height="16" rx="2"/>
                            <path d="M2 8h20"/>
                            <path d="M6 4v4"/>
                            <path d="M10 4v4"/>
                            <path d="M14 4v4"/>
                            <path d="M18 4v4"/>
                        </svg>
                    </div>
                    <p>No scenes to display</p>
                    <p class="text-muted">Select a project from the sidebar</p>
                </div>
            `;
            return;
        }

        // Build timeline HTML (Track only)
        let html = `
            <div class="timeline-track">
        `;

        scenes.forEach(scene => {
            const isSelected = selectedScene?.scene_id === scene.scene_id;
            const sceneErrors = getSceneErrors(errors, scene.scene_id);
            const hasError = sceneErrors.some(e => e.type === ErrorType.ERROR);
            const hasWarning = sceneErrors.some(e => e.type === ErrorType.WARNING);

            const color = SCENE_COLORS[scene.scene_type] || '#666666';
            const vfxIcon = VFX_ICONS[scene.visual_fx] || '';
            const sceneIcon = SCENE_TYPE_ICONS[scene.scene_type] || '';
            const displayType = formatSceneType(scene.scene_type);

            html += `
                <div class="timeline-block ${isSelected ? 'selected' : ''} ${hasError ? 'has-error' : ''} ${hasWarning && !hasError ? 'has-warning' : ''}"
                     data-scene-id="${scene.scene_id}"
                     style="--scene-color: ${color};">
                    <div class="block-content">
                        <div class="block-header">
                            <span class="block-id">${scene.scene_id}</span>
                            <span class="block-type">${displayType}</span>
                        </div>
                        <div class="block-icons">
                            ${sceneIcon ? `<span class="block-scene-icon" title="${scene.scene_type}">${sceneIcon}</span>` : ''}
                            ${vfxIcon ? `<span class="block-vfx" title="${scene.visual_fx}">${vfxIcon}</span>` : ''}
                        </div>
                    </div>
                    <div class="block-footer">
                        <div class="block-duration">${scene.duration}s</div>
                        <div class="block-status status-${scene.status}" title="${scene.status}"></div>
                    </div>
                </div>
            `;
        });

        html += '</div>';

        // Timestamps row - wrapper for positioning
        html += '<div class="timeline-timestamps-wrapper">';
        html += '<div class="timeline-timestamps">';
        let cumulative = 0;
        scenes.forEach(scene => {
            html += `
                <div class="timestamp-marker">
                    ${formatTimestamp(cumulative)}
                </div>
            `;
            cumulative += scene.duration;
        });
        html += '</div>';
        // End timestamp positioned separately
        html += `<div class="timestamp-end">${formatTimestamp(totalDuration)}</div>`;
        html += '</div>';

        this.container.innerHTML = html;

        // Attach click handlers
        this.container.querySelectorAll('.timeline-block').forEach(block => {
            block.addEventListener('click', () => {
                const sceneId = parseInt(block.dataset.sceneId);
                const scene = scenes.find(s => s.scene_id === sceneId);
                if (scene && this.onSceneClick) {
                    this.onSceneClick(scene);
                }
            });
        });
    }

    // Navigate to adjacent scene
    navigateScene(direction) {
        const scenes = State.get('scenes');
        const selectedScene = State.get('selectedScene');

        if (!scenes.length) return;

        let newIndex;
        if (!selectedScene) {
            newIndex = direction > 0 ? 0 : scenes.length - 1;
        } else {
            const currentIndex = scenes.findIndex(s => s.scene_id === selectedScene.scene_id);
            newIndex = currentIndex + direction;

            if (newIndex < 0) newIndex = scenes.length - 1;
            if (newIndex >= scenes.length) newIndex = 0;
        }

        const newScene = scenes[newIndex];
        if (newScene && this.onSceneClick) {
            this.onSceneClick(newScene);
        }
    }

    // Scroll selected scene into view
    scrollToScene(sceneId) {
        const block = this.container.querySelector(`[data-scene-id="${sceneId}"]`);
        if (block) {
            block.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }
}

export const Timeline = TimelineRenderer;
