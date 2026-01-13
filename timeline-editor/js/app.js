import { State } from './state.js';
import { API } from './api.js';
import { Timeline } from './timeline.js';
import { Editor } from './editor.js';
import { validateProject } from './validation.js';
import { formatRelativeTime, showToast, Storage, getTotalDuration } from './utils.js';

class App {
    constructor() {
        this.timeline = null;
        this.editor = null;
    }

    async init() {
        console.log('App initializing...');

        // Initialize components
        this.timeline = new Timeline('timeline-container');
        this.editor = new Editor('scene-editor', 'validation-panel');

        // Set up timeline click handler
        this.timeline.onSceneClick = (scene) => {
            State.selectScene(scene);
            this.timeline.scrollToScene(scene.scene_id);
        };

        // Subscribe to state changes for UI updates
        State.subscribe(['syncStatus', 'lastSyncedAt'], () => this.updateSyncStatus());
        State.subscribe(['scenes'], () => this.runValidation());
        State.subscribe(['projects'], () => this.renderProjectList());

        // Set up sidebar toggle
        this.setupSidebarToggle();

        // Set up keyboard shortcuts
        this.setupKeyboardShortcuts();

        // Load projects
        await this.loadProjects();

        console.log('App initialized');
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

    async loadProjects() {
        try {
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
        }
    }

    async selectProject(project) {
        State.selectProject(project);

        try {
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
                        <button class="btn-script" title="View script">📜</button>
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
            }
        });
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

    restoreFromBackup() {
        if (State.restoreFromBackup()) {
            showToast('Restored from backup', 'success');
            this.runValidation();
        } else {
            showToast('No backup found', 'warning');
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
