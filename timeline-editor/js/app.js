import { State } from './state.js';
import { API } from './api.js';
import { Timeline } from './timeline.js';
import { Editor } from './editor.js';
import { validateProject, hasBlockingErrors } from './validation.js';
import { formatRelativeTime, showToast, Storage, getTotalDuration } from './utils.js';

class App {
    constructor() {
        this.timeline = null;
        this.editor = null;
    }

    async init() {
        console.log('App initializing...');

        // Remove any leftover staging overlay (e.g., when navigating back from editor)
        const stagingOverlay = document.getElementById('staging-overlay');
        if (stagingOverlay) {
            stagingOverlay.remove();
        }

        // Initialize components
        this.timeline = new Timeline('timeline-container');
        this.editor = new Editor('scene-editor', 'validation-panel');

        // Set up timeline click handler
        this.timeline.onSceneClick = (scene) => {
            State.selectScene(scene);
            this.timeline.scrollToScene(scene.scene_id);
            this.expandDetailsPanel();
        };

        // Subscribe to state changes for UI updates
        State.subscribe(['syncStatus', 'lastSyncedAt'], () => this.updateSyncStatus());
        State.subscribe(['scenes'], () => this.runValidation());
        State.subscribe(['scenes', 'history', 'historyIndex'], () => this.updateUndoRedoButtons());
        State.subscribe(['projects'], () => this.renderProjectList());

        // Set up sidebar toggle
        this.setupSidebarToggle();

        // Set up details panel toggle
        this.setupDetailsToggle();

        // Set up keyboard shortcuts
        this.setupKeyboardShortcuts();

        // Set up export button
        this.setupExportButton();

        // Set up stage button
        this.setupStageButton();

        // Set up undo/redo buttons
        this.setupUndoRedoButtons();

        // Load projects
        await this.loadProjects();

        // Hide the app loading overlay with fade effect
        this.hideAppLoadingOverlay();

        console.log('App initialized');
    }

    hideAppLoadingOverlay() {
        const overlay = document.getElementById('app-loading-overlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.classList.add('hidden');
            }, 300);
        }
    }

    setupExportButton() {
        const exportBtn = document.getElementById('export-timeline');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportTimeline());
        }
    }

    setupStageButton() {
        const stageBtn = document.getElementById('stage-timeline');
        if (stageBtn) {
            stageBtn.addEventListener('click', () => this.stageTimeline());
        }
    }

    setupSidebarToggle() {
        const toggle = document.getElementById('sidebar-toggle');
        const layout = document.querySelector('.app-layout');

        if (!toggle || !layout) return;

        // Load saved state (default to collapsed)
        const savedState = Storage.load('timeline_sidebar_collapsed');
        if (savedState !== false) {
            layout.dataset.sidebar = 'collapsed';
        } else {
            layout.dataset.sidebar = 'expanded';
        }

        toggle.addEventListener('click', () => {
            const isCollapsed = layout.dataset.sidebar === 'collapsed';
            layout.dataset.sidebar = isCollapsed ? 'expanded' : 'collapsed';
            Storage.save('timeline_sidebar_collapsed', !isCollapsed);
        });
    }

    setupDetailsToggle() {
        const toggle = document.getElementById('details-toggle');
        const layout = document.querySelector('.app-layout');

        if (!toggle || !layout) return;

        // Load saved state (default to expanded)
        const savedState = Storage.load('timeline_details_collapsed');
        if (savedState === true) {
            layout.dataset.details = 'collapsed';
        } else {
            layout.dataset.details = 'expanded';
        }

        toggle.addEventListener('click', () => {
            const isCollapsed = layout.dataset.details === 'collapsed';
            layout.dataset.details = isCollapsed ? 'expanded' : 'collapsed';
            Storage.save('timeline_details_collapsed', !isCollapsed);
        });
    }

    expandDetailsPanel() {
        const layout = document.querySelector('.app-layout');
        if (layout && layout.dataset.details === 'collapsed') {
            layout.dataset.details = 'expanded';
            Storage.save('timeline_details_collapsed', false);
        }
    }

    async loadProjects() {
        const projectsLoading = document.getElementById('projects-loading');

        try {
            // Show loading state
            if (projectsLoading) projectsLoading.classList.remove('hidden');

            const projects = await API.fetchProjects();

            // Sort by date descending
            projects.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            State.setProjects(projects);

            // Check for last opened project
            const lastProjectId = Storage.load('timeline_last_project');
            if (lastProjectId) {
                const lastProject = projects.find(p => p.project_id === lastProjectId);
                if (lastProject) {
                    await this.selectProject(lastProject);
                }
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
            showToast('Failed to load projects', 'error');
        } finally {
            // Hide loading state
            if (projectsLoading) projectsLoading.classList.add('hidden');
        }
    }

    async selectProject(project) {
        State.selectProject(project);

        // Hide welcome message when a project is selected
        const welcomeMessage = document.getElementById('welcome-message');
        if (welcomeMessage) welcomeMessage.classList.add('hidden');

        // Update visual selection in project list
        document.querySelectorAll('.project-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.projectId === project.project_id);
        });

        const timelineLoading = document.getElementById('timeline-loading');

        try {
            // Show loading overlay
            if (timelineLoading) timelineLoading.classList.remove('hidden');

            const scenes = await API.fetchScenes(project.project_id, project.chat_id);

            if (scenes.length === 0 && project.scenes_json) {
                // Fallback to scenes_json
                try {
                    const parsed = JSON.parse(project.scenes_json);
                    State.setScenes(parsed);
                    showToast('Loaded scenes from backup', 'info');
                } catch {
                    State.setScenes([]);
                }
            } else {
                State.setScenes(scenes);
            }

            this.runValidation();
        } catch (error) {
            console.error('Failed to load scenes:', error);
            showToast('Failed to load scenes', 'error');
        } finally {
            // Hide loading overlay
            if (timelineLoading) timelineLoading.classList.add('hidden');
        }
    }

    renderProjectList() {
        const projects = State.get('projects');
        const currentProject = State.get('currentProject');
        const projectList = document.getElementById('project-list');

        if (!projectList) return;

        if (projects.length === 0) {
            projectList.innerHTML = '<li class="no-projects">No projects found</li>';
            return;
        }

        projectList.innerHTML = projects.map(project => {
            const isSelected = currentProject?.project_id === project.project_id;
            const date = new Date(project.created_at);
            const scriptExcerpt = project.script ? project.script.slice(0, 24) + '...' : '';

            return `
                <li class="project-item ${isSelected ? 'selected' : ''}" data-project-id="${project.project_id}">
                    <div class="project-header">
                        <div class="project-name">${project.project_id.slice(0, 20)}...</div>
                        <button class="btn-script" title="View script"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg></button>
                    </div>
                    ${scriptExcerpt ? `<div class="project-excerpt">${scriptExcerpt}</div>` : ''}
                    <div class="project-meta">
                        <span>${project.duration}s</span>
                        <span>${formatRelativeTime(date)}</span>
                    </div>
                </li>
            `;
        }).join('');

        // Attach click handlers
        projectList.querySelectorAll('.project-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't select project if clicking script button
                if (e.target.classList.contains('btn-script')) return;

                const projectId = item.dataset.projectId;
                const project = projects.find(p => p.project_id === projectId);
                if (project) {
                    this.selectProject(project);
                }
            });
        });

        // Script button handlers
        projectList.querySelectorAll('.btn-script').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const projectId = btn.closest('.project-item').dataset.projectId;
                const project = projects.find(p => p.project_id === projectId);
                if (project) {
                    this.showScriptModal(project.script);
                }
            });
        });
    }

    showScriptModal(script) {
        const modal = document.getElementById('script-modal');
        const content = document.getElementById('script-content');
        const closeBtn = modal.querySelector('.modal-close');
        const copyBtn = document.getElementById('copy-script');

        if (!modal || !content) return;

        content.textContent = script || 'No script available';
        modal.classList.add('show');

        // Close handlers
        const closeModal = () => modal.classList.remove('show');

        closeBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        // Copy handler
        copyBtn.onclick = async () => {
            if (script) {
                await navigator.clipboard.writeText(script);
                showToast('Script copied to clipboard', 'success');
            }
        };

        // Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    runValidation() {
        const scenes = State.get('scenes');
        const project = State.get('currentProject');
        const projectDuration = project?.duration || null;

        const errors = validateProject(scenes, projectDuration);
        State.setValidationErrors(errors);
    }

    updateSyncStatus() {
        const status = State.get('syncStatus');
        const lastSynced = State.get('lastSyncedAt');

        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');

        if (!statusDot || !statusText) return;

        // Remove existing status classes
        statusDot.classList.remove('status-synced', 'status-saving', 'status-error');

        switch (status) {
            case 'synced':
                statusDot.classList.add('status-synced');
                statusText.textContent = lastSynced
                    ? `Synced ${formatRelativeTime(lastSynced)}`
                    : 'Synced';
                break;
            case 'saving':
                statusDot.classList.add('status-saving');
                statusText.textContent = 'Saving...';
                break;
            case 'error':
                statusDot.classList.add('status-error');
                statusText.textContent = 'Sync error';
                break;
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in input/textarea
            if (e.target.matches('input, textarea, select')) {
                // Only allow Escape in form fields
                if (e.key !== 'Escape') return;
            }

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.timeline.navigateScene(-1);
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    this.timeline.navigateScene(1);
                    break;

                case 'Escape':
                    e.preventDefault();
                    State.selectScene(null);
                    break;

                case 'Delete':
                    if (State.get('selectedScene')) {
                        e.preventDefault();
                        document.getElementById('delete-scene')?.click();
                    }
                    break;

                case 's':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.saveAll();
                    }
                    break;

                case 'z':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        if (e.shiftKey) {
                            if (State.redo()) {
                                showToast('Redo', 'info');
                            }
                        } else {
                            if (State.undo()) {
                                showToast('Undo', 'info');
                            }
                        }
                    }
                    break;

                case '?':
                    e.preventDefault();
                    this.showShortcutsModal();
                    break;
            }
        });
    }

    showShortcutsModal() {
        const modal = document.getElementById('shortcuts-modal');
        const closeBtn = modal?.querySelector('.modal-close');

        if (!modal) return;

        modal.classList.add('show');

        const closeModal = () => modal.classList.remove('show');

        closeBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    async saveAll() {
        const scenes = State.get('scenes');
        if (!scenes.length) return;

        try {
            await API.saveAllScenes(scenes);
            State.backupScenes();
        } catch (error) {
            console.error('Failed to save all scenes:', error);
        }
    }

    // Quick actions
    recalculateTimestamps() {
        const scenes = State.get('scenes');
        State.setScenes(scenes); // This triggers timestamp recalculation
        showToast('Timestamps recalculated', 'success');
    }

    async copyAllPrompts() {
        const scenes = State.get('scenes');
        const prompts = scenes
            .filter(s => s.prompt?.trim())
            .map(s => `Scene ${s.scene_id}: ${s.prompt}`)
            .join('\n\n');

        if (prompts) {
            await navigator.clipboard.writeText(prompts);
            showToast('All prompts copied', 'success');
        } else {
            showToast('No prompts to copy', 'warning');
        }
    }

    markAllPending() {
        const scenes = State.get('scenes').map(s => ({ ...s, status: 'pending' }));
        State.set({ scenes });
        showToast('All scenes marked as pending', 'success');
    }

    clearAllImages() {
        const scenes = State.get('scenes').map(s => ({ ...s, image_url: '' }));
        State.set({ scenes });
        showToast('All image URLs cleared', 'success');
    }

    exportProject() {
        const project = State.get('currentProject');
        const scenes = State.get('scenes');

        if (!project) {
            showToast('No project selected', 'warning');
            return;
        }

        const data = {
            project,
            scenes,
            exportedAt: new Date().toISOString(),
            totalDuration: getTotalDuration(scenes)
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.project_id}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Project exported', 'success');
    }

    async exportTimeline() {
        const project = State.get('currentProject');
        const scenes = State.get('scenes');

        if (!project || !scenes.length) {
            showToast('No project or scenes to export', 'warning');
            return;
        }

        const errors = State.get('validationErrors');
        if (hasBlockingErrors(errors)) {
            showToast('Cannot export: fix validation errors first', 'error');
            return;
        }

        // Show loading state
        const exportBtn = document.getElementById('export-timeline');
        const timelineArea = document.querySelector('.timeline-area');

        exportBtn?.classList.add('btn-loading');
        timelineArea?.classList.add('exporting');

        // Simulate processing delay for visual feedback
        await new Promise(resolve => setTimeout(resolve, 800));

        let imageCounter = 1;
        const timeline = {
            project_id: project.project_id,
            total_duration: getTotalDuration(scenes),
            scene_count: scenes.length,
            exported_at: new Date().toISOString(),
            scenes: scenes.map(scene => {
                const isVisualScene = !['text', 'cta'].includes(scene.scene_type);
                const imageFile = isVisualScene ? `image${imageCounter++}.jpg` : null;

                return {
                    id: scene.scene_id,
                    type: scene.scene_type,
                    timestamp: scene.timestamp,
                    duration: scene.duration,
                    description: scene.description || '',
                    visual_fx: scene.visual_fx,
                    style: scene.style || '',
                    status: scene.status,
                    // Visual scenes get image filename
                    ...(isVisualScene && {
                        image: imageFile,
                        prompt: scene.prompt || ''
                    }),
                    // Text/CTA scenes get text content
                    ...(!isVisualScene && {
                        text_content: scene.text_content || '',
                        text_bg: scene.text_bg || ''
                    })
                };
            })
        };

        const blob = new Blob([JSON.stringify(timeline, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `timeline_${project.project_id.slice(0, 20)}.json`;
        a.click();
        URL.revokeObjectURL(url);

        // Remove loading state
        exportBtn?.classList.remove('btn-loading');
        timelineArea?.classList.remove('exporting');

        showToast(`Timeline exported with ${imageCounter - 1} images`, 'success');
    }

    stageTimeline() {
        const project = State.get('currentProject');
        const scenes = State.get('scenes');

        if (!project || !scenes.length) {
            showToast('No project or scenes to stage', 'warning');
            return;
        }

        const errors = State.get('validationErrors');
        if (hasBlockingErrors(errors)) {
            showToast('Cannot stage: fix validation errors first', 'error');
            return;
        }

        // Show loading state on button
        const stageBtn = document.getElementById('stage-timeline');
        if (stageBtn) {
            stageBtn.classList.add('btn-loading');
            stageBtn.disabled = true;
        }

        // Show full-page loading overlay
        this.showStagingOverlay();

        // Prepare staged data (with small delay for UI feedback)
        setTimeout(() => {
            let imageCounter = 1;
            const stagedData = {
                project_id: project.project_id,
                project_name: project.name || project.project_id,
                total_duration: getTotalDuration(scenes),
                scene_count: scenes.length,
                staged_at: new Date().toISOString(),
                scenes: scenes.map(scene => {
                    const isVisualScene = !['text', 'cta'].includes(scene.scene_type);
                    const imageFile = isVisualScene ? `image${imageCounter++}.jpg` : null;

                    return {
                        id: scene.scene_id,
                        type: scene.scene_type,
                        timestamp: scene.timestamp,
                        duration: scene.duration,
                        description: scene.description || '',
                        visual_fx: scene.visual_fx,
                        style: scene.style || '',
                        status: scene.status,
                        ...(isVisualScene && {
                            image: imageFile,
                            prompt: scene.prompt || ''
                        }),
                        ...(!isVisualScene && {
                            text_content: scene.text_content || '',
                            text_bg: scene.text_bg || ''
                        })
                    };
                })
            };

            // Store in sessionStorage for Stage 2 to read
            sessionStorage.setItem('staged_timeline', JSON.stringify(stagedData));

            // Update overlay message
            this.updateStagingOverlay('Opening Video Editor...');

            // Navigate to Stage 2 editor
            setTimeout(() => {
                window.location.href = 'editor.html';
            }, 300);
        }, 100);
    }

    showStagingOverlay() {
        // Create overlay if it doesn't exist
        let overlay = document.getElementById('staging-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'staging-overlay';
            overlay.className = 'staging-overlay';
            overlay.innerHTML = `
                <div class="staging-content">
                    <div class="staging-spinner"></div>
                    <div class="staging-message">Preparing Timeline...</div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        // Show with animation
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    }

    updateStagingOverlay(message) {
        const msgEl = document.querySelector('.staging-message');
        if (msgEl) {
            msgEl.textContent = message;
        }
    }

    restoreFromBackup() {
        if (State.restoreFromBackup()) {
            showToast('Restored from backup', 'success');
            this.runValidation();
        } else {
            showToast('No backup found', 'warning');
        }
    }

    setupUndoRedoButtons() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');

        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                if (State.undo()) {
                    showToast('Undo', 'info');
                }
            });
        }

        if (redoBtn) {
            redoBtn.addEventListener('click', () => {
                if (State.redo()) {
                    showToast('Redo', 'info');
                }
            });
        }

        // Setup history dropdown
        this.setupHistoryDropdown();

        // Initial state update
        this.updateUndoRedoButtons();
    }

    setupHistoryDropdown() {
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
                this.renderHistoryList();
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
                    State.clearHistory();
                    this.renderHistoryList();
                    showToast('History cleared', 'info');
                }
            });
        }
    }

    renderHistoryList() {
        const historyList = document.getElementById('history-list');
        if (!historyList) return;

        const history = State.get('history');
        const historyIndex = State.get('historyIndex');

        if (!history || history.length <= 1) {
            historyList.innerHTML = '<li class="history-empty">No history yet</li>';
            return;
        }

        // Render history items (most recent first, skip index 0 which is initial state)
        historyList.innerHTML = history.map((scenes, index) => {
            if (index === 0) {
                return `
                    <li class="history-item ${index === historyIndex ? 'current' : ''}" data-index="${index}">
                        <span class="history-item-index">${index}</span>
                        <div class="history-item-info">
                            <div class="history-item-label">Initial state</div>
                            <div class="history-item-meta">${scenes.length} scenes</div>
                        </div>
                    </li>
                `;
            }

            // Try to describe what changed
            const prevScenes = history[index - 1];
            const changeDesc = this.describeHistoryChange(prevScenes, scenes);

            return `
                <li class="history-item ${index === historyIndex ? 'current' : ''}" data-index="${index}">
                    <span class="history-item-index">${index}</span>
                    <div class="history-item-info">
                        <div class="history-item-label">${changeDesc}</div>
                        <div class="history-item-meta">${scenes.length} scenes</div>
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
                State.jumpToHistory(index);
                this.renderHistoryList();
                showToast(`Jumped to state ${index}`, 'info');
            });
        });

        // Add click handlers for delete buttons
        historyList.querySelectorAll('.history-item-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                State.deleteHistoryAt(index);
                this.renderHistoryList();
                showToast('State removed', 'info');
            });
        });
    }

    describeHistoryChange(prevScenes, currentScenes) {
        if (!prevScenes || !currentScenes) return 'Unknown change';

        // Check for scene count change
        if (prevScenes.length !== currentScenes.length) {
            if (currentScenes.length > prevScenes.length) {
                return `Added scene`;
            } else {
                return `Removed scene`;
            }
        }

        // Find what changed
        for (let i = 0; i < currentScenes.length; i++) {
            const prev = prevScenes[i];
            const curr = currentScenes[i];

            if (!prev || !curr) continue;

            if (prev.duration !== curr.duration) {
                return `Scene ${curr.scene_id}: duration → ${curr.duration}s`;
            }
            if (prev.scene_type !== curr.scene_type) {
                return `Scene ${curr.scene_id}: type → ${curr.scene_type}`;
            }
            if (prev.visual_fx !== curr.visual_fx) {
                return `Scene ${curr.scene_id}: effect → ${curr.visual_fx}`;
            }
            if (prev.text_content !== curr.text_content) {
                return `Scene ${curr.scene_id}: text changed`;
            }
            if (prev.status !== curr.status) {
                return `Scene ${curr.scene_id}: status → ${curr.status}`;
            }
            if (prev.prompt !== curr.prompt) {
                return `Scene ${curr.scene_id}: prompt changed`;
            }
        }

        return 'Scene modified';
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        const historyBadge = document.getElementById('history-badge');

        if (undoBtn) {
            undoBtn.disabled = !State.canUndo();
        }

        if (redoBtn) {
            redoBtn.disabled = !State.canRedo();
        }

        // Update history badge
        if (historyBadge) {
            const historyIndex = State.get('historyIndex');
            historyBadge.textContent = historyIndex;
            historyBadge.classList.toggle('has-history', historyIndex > 0);
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();

    // Expose to window for console access and quick actions
    window.app = app;
});
