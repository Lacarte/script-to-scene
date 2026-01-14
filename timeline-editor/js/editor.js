import { State } from './state.js';
import { API } from './api.js';
import { SCENE_TYPES, ALLOWED_VFX, VFX_ICONS, STATUS_OPTIONS, SCENE_COLORS, debounce, showToast, getTotalDuration } from './utils.js';
import { getSceneErrors, formatError, ErrorType } from './validation.js';

class SceneEditor {
    constructor(editorContainerId, validationContainerId) {
        this.editorContainer = document.getElementById(editorContainerId);
        this.validationContainer = document.getElementById(validationContainerId);
        this.currentScene = null;
        this.isEditorCollapsed = false;

        // Debounced save
        this.debouncedSave = debounce((scene) => this.saveScene(scene), 500);

        // Subscribe to state changes
        State.subscribe(['selectedScene'], (state) => this.loadScene(state.selectedScene));
        State.subscribe(['validationErrors'], () => this.renderValidation());
    }

    loadScene(scene) {
        this.currentScene = scene;

        if (!scene) {
            this.editorContainer.innerHTML = `
                <h3>
                    Scene Details
                    <button class="panel-toggle ${this.isEditorCollapsed ? 'collapsed' : ''}" id="editor-toggle" title="Toggle panel">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 9l6 6 6-6"/>
                        </svg>
                    </button>
                </h3>
                <div class="panel-content ${this.isEditorCollapsed ? 'collapsed' : ''}">
                    <div class="placeholder-text">Select a scene to edit</div>
                </div>
            `;
            this.attachToggleListener();
            return;
        }

        const errors = State.get('validationErrors');
        const sceneErrors = getSceneErrors(errors, scene.scene_id);
        const color = SCENE_COLORS[scene.scene_type] || '#666666';

        this.editorContainer.innerHTML = `
            <h3>
                <span class="scene-badge" style="background: ${color};">${scene.scene_id}</span>
                Scene Details
                <button class="panel-toggle ${this.isEditorCollapsed ? 'collapsed' : ''}" id="editor-toggle" title="Toggle panel">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </button>
            </h3>

            <div class="panel-content ${this.isEditorCollapsed ? 'collapsed' : ''}">
            <div class="editor-form">
                <div class="form-group">
                    <label>Scene Type</label>
                    <select id="edit-scene-type" class="form-select">
                        ${SCENE_TYPES.map(type => `
                            <option value="${type}" ${scene.scene_type === type ? 'selected' : ''}>
                                ${type}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label>Duration (seconds)</label>
                    <input type="number" id="edit-duration" class="form-input ${this.hasFieldError(sceneErrors, 'duration') ? 'input-error' : ''}"
                           value="${scene.duration}" min="1" max="60">
                </div>

                <div class="form-group">
                    <label>Description</label>
                    <textarea id="edit-description" class="form-textarea" rows="2">${scene.description || ''}</textarea>
                </div>

                <div class="form-group ${scene.scene_type === 'text' || scene.scene_type === 'cta' ? '' : 'hidden'}">
                    <label>Text Content</label>
                    <textarea id="edit-text-content" class="form-textarea ${this.hasFieldError(sceneErrors, 'text_content') ? 'input-error' : ''}"
                              rows="2">${scene.text_content || ''}</textarea>
                </div>

                <div class="form-group ${scene.scene_type === 'text' || scene.scene_type === 'cta' ? '' : 'hidden'}">
                    <label>Text Background</label>
                    <input type="text" id="edit-text-bg" class="form-input" value="${scene.text_bg || ''}" placeholder="#000000">
                </div>

                <div class="form-group ${scene.scene_type !== 'text' && scene.scene_type !== 'cta' ? '' : 'hidden'}">
                    <label>Prompt</label>
                    <div class="input-with-button">
                        <textarea id="edit-prompt" class="form-textarea ${this.hasFieldError(sceneErrors, 'prompt') ? 'input-warning' : ''}"
                                  rows="3">${scene.prompt || ''}</textarea>
                        <button type="button" id="copy-prompt" class="btn-icon" title="Copy prompt">📋</button>
                    </div>
                </div>

                <div class="form-group">
                    <label>Visual Effect</label>
                    <select id="edit-visual-fx" class="form-select">
                        ${ALLOWED_VFX.map(vfx => `
                            <option value="${vfx}" ${scene.visual_fx === vfx ? 'selected' : ''}>
                                ${VFX_ICONS[vfx]} ${vfx}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label>Style</label>
                    <input type="text" id="edit-style" class="form-input" value="${scene.style || ''}"
                           placeholder="cinematic realistic, dramatic lighting...">
                </div>

                <div class="form-group">
                    <label>Status</label>
                    <select id="edit-status" class="form-select">
                        ${STATUS_OPTIONS.map(status => `
                            <option value="${status}" ${scene.status === status ? 'selected' : ''}>
                                ${status === 'pending' ? '⏳' : status === 'done' ? '✅' : '❌'} ${status}
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label>Image URL</label>
                    <input type="text" id="edit-image-url" class="form-input" value="${scene.image_url || ''}"
                           placeholder="https://...">
                </div>

                ${scene.image_url ? `
                    <div class="image-preview">
                        <img src="${scene.image_url}" alt="Scene preview" onerror="this.style.display='none'">
                    </div>
                ` : `
                    <div class="image-placeholder">
                        <span>No image</span>
                    </div>
                `}

                <div class="form-actions">
                    <button type="button" id="duplicate-scene" class="btn btn-secondary">Duplicate</button>
                    <button type="button" id="delete-scene" class="btn btn-danger">Delete</button>
                </div>
            </div>
            </div>
        `;

        this.attachEventListeners();
        this.attachToggleListener();
    }

    hasFieldError(errors, field) {
        return errors.some(e => e.field === field && e.type === ErrorType.ERROR);
    }

    attachToggleListener() {
        const toggleBtn = document.getElementById('editor-toggle');
        toggleBtn?.addEventListener('click', () => {
            this.isEditorCollapsed = !this.isEditorCollapsed;
            toggleBtn.classList.toggle('collapsed', this.isEditorCollapsed);
            const content = this.editorContainer.querySelector('.panel-content');
            content?.classList.toggle('collapsed', this.isEditorCollapsed);
        });
    }

    attachEventListeners() {
        // Scene type change - show/hide text fields
        const sceneTypeSelect = document.getElementById('edit-scene-type');
        sceneTypeSelect?.addEventListener('change', (e) => {
            const isTextType = e.target.value === 'text' || e.target.value === 'cta';

            // Toggle visibility of text fields
            document.getElementById('edit-text-content')?.closest('.form-group')?.classList.toggle('hidden', !isTextType);
            document.getElementById('edit-text-bg')?.closest('.form-group')?.classList.toggle('hidden', !isTextType);
            document.getElementById('edit-prompt')?.closest('.form-group')?.classList.toggle('hidden', isTextType);

            this.handleFieldChange('scene_type', e.target.value);
        });

        // Duration
        document.getElementById('edit-duration')?.addEventListener('change', (e) => {
            const value = parseInt(e.target.value) || 1;
            this.handleFieldChange('duration', Math.max(1, value));
        });

        // Description
        document.getElementById('edit-description')?.addEventListener('input', (e) => {
            this.handleFieldChange('description', e.target.value);
        });

        // Text content
        document.getElementById('edit-text-content')?.addEventListener('input', (e) => {
            this.handleFieldChange('text_content', e.target.value);
        });

        // Text background
        document.getElementById('edit-text-bg')?.addEventListener('input', (e) => {
            this.handleFieldChange('text_bg', e.target.value);
        });

        // Prompt
        document.getElementById('edit-prompt')?.addEventListener('input', (e) => {
            this.handleFieldChange('prompt', e.target.value);
        });

        // Copy prompt button
        document.getElementById('copy-prompt')?.addEventListener('click', () => {
            const prompt = document.getElementById('edit-prompt')?.value;
            if (prompt) {
                navigator.clipboard.writeText(prompt);
                showToast('Prompt copied to clipboard', 'success');
            }
        });

        // Visual FX
        document.getElementById('edit-visual-fx')?.addEventListener('change', (e) => {
            this.handleFieldChange('visual_fx', e.target.value);
        });

        // Style
        document.getElementById('edit-style')?.addEventListener('input', (e) => {
            this.handleFieldChange('style', e.target.value);
        });

        // Status
        document.getElementById('edit-status')?.addEventListener('change', (e) => {
            this.handleFieldChange('status', e.target.value);
        });

        // Image URL
        document.getElementById('edit-image-url')?.addEventListener('input', (e) => {
            this.handleFieldChange('image_url', e.target.value);
        });

        // Duplicate scene
        document.getElementById('duplicate-scene')?.addEventListener('click', () => {
            this.duplicateScene();
        });

        // Delete scene
        document.getElementById('delete-scene')?.addEventListener('click', () => {
            this.deleteScene();
        });
    }

    handleFieldChange(field, value) {
        if (!this.currentScene) return;

        // Update state
        State.updateScene(this.currentScene.scene_id, { [field]: value });

        // Update local reference
        this.currentScene = { ...this.currentScene, [field]: value };

        // Trigger debounced save
        this.debouncedSave(this.currentScene);

        // Backup to localStorage
        State.backupScenes();
    }

    async saveScene(scene) {
        // Show saving indicator
        this.showSaveIndicator('saving');
        try {
            await API.saveScene(scene, scene.scene_id + 1); // +1 for header row
            this.showSaveIndicator('saved');
        } catch (error) {
            console.error('Failed to save scene:', error);
            this.showSaveIndicator('error');
        }
    }

    showSaveIndicator(status) {
        let indicator = document.getElementById('save-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'save-indicator';
            indicator.className = 'save-indicator';
            this.editorContainer.insertBefore(indicator, this.editorContainer.firstChild);
        }

        indicator.className = `save-indicator save-${status}`;

        switch (status) {
            case 'saving':
                indicator.innerHTML = '<span class="save-spinner"></span> Saving...';
                break;
            case 'saved':
                indicator.innerHTML = '✓ Saved';
                setTimeout(() => indicator.classList.add('fade-out'), 1500);
                break;
            case 'error':
                indicator.innerHTML = '✗ Save failed';
                break;
        }
    }

    duplicateScene() {
        if (!this.currentScene) return;

        const scenes = State.get('scenes');
        const currentIndex = scenes.findIndex(s => s.scene_id === this.currentScene.scene_id);

        // Create new scene with incremented ID
        const maxId = Math.max(...scenes.map(s => s.scene_id));
        const newScene = {
            ...this.currentScene,
            scene_id: maxId + 1,
            status: 'pending',
            image_url: '',
            created_at: new Date().toISOString()
        };

        // Insert after current scene
        const newScenes = [
            ...scenes.slice(0, currentIndex + 1),
            newScene,
            ...scenes.slice(currentIndex + 1)
        ];

        State.setScenes(newScenes);
        State.selectScene(newScene);
        showToast(`Duplicated scene ${this.currentScene.scene_id} → ${newScene.scene_id}`, 'success');
    }

    async deleteScene() {
        if (!this.currentScene) return;

        const confirmed = confirm(`Delete scene ${this.currentScene.scene_id}? This cannot be undone.`);
        if (!confirmed) return;

        try {
            const projectId = this.currentScene.project_id;
            const sceneId = this.currentScene.scene_id;

            await API.deleteScene(projectId, sceneId);
            State.removeScene(sceneId);
        } catch (error) {
            console.error('Failed to delete scene:', error);
        }
    }

    renderValidation() {
        const errors = State.get('validationErrors');
        const errorList = document.getElementById('error-list');

        if (!errorList) return;

        if (!errors || errors.length === 0) {
            errorList.innerHTML = '<li class="no-errors">All validations passed</li>';
            return;
        }

        // Sort: errors first, then warnings
        const sorted = [...errors].sort((a, b) => {
            if (a.type === ErrorType.ERROR && b.type !== ErrorType.ERROR) return -1;
            if (a.type !== ErrorType.ERROR && b.type === ErrorType.ERROR) return 1;
            return (a.sceneId || 0) - (b.sceneId || 0);
        });

        errorList.innerHTML = sorted.map(error => {
            const isFixable = this.isFixableError(error);
            return `
                <li class="validation-item validation-${error.type}" data-scene-id="${error.sceneId || ''}" data-field="${error.field || ''}">
                    <span class="validation-message">${formatError(error)}</span>
                    ${isFixable ? `<button class="btn-fix" data-fix-type="${error.field}" title="Fix this issue">Fix</button>` : ''}
                </li>
            `;
        }).join('');

        // Click to navigate to scene
        errorList.querySelectorAll('.validation-item[data-scene-id]').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-fix')) return;
                const sceneId = parseInt(item.dataset.sceneId);
                if (sceneId) {
                    const scene = State.get('scenes').find(s => s.scene_id === sceneId);
                    if (scene) {
                        State.selectScene(scene);
                    }
                }
            });
        });

        // Fix buttons
        errorList.querySelectorAll('.btn-fix').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fixType = btn.dataset.fixType;
                const sceneId = parseInt(btn.closest('.validation-item').dataset.sceneId) || null;
                this.handleFix(fixType, sceneId);
            });
        });
    }

    isFixableError(error) {
        // Use the fixable flag from validation if present
        if (error.fixable) return true;

        // Fallback checks for backwards compatibility
        // Duration mismatch (project vs total scenes)
        if (error.field === 'duration' && error.sceneId === null && error.message.includes("doesn't match project")) {
            return true;
        }
        // Invalid visual_fx
        if (error.field === 'visual_fx' && error.sceneId !== null) {
            return true;
        }
        return false;
    }

    handleFix(fixType, sceneId) {
        if (fixType === 'duration' && sceneId === null) {
            // Fix project duration mismatch - update last scene
            const scenes = State.get('scenes');
            const project = State.get('currentProject');
            if (!scenes.length || !project) return;

            const totalDuration = getTotalDuration(scenes);
            const projectDuration = project.duration;
            const diff = projectDuration - totalDuration;

            if (diff === 0) return;

            // Adjust last scene duration
            const lastScene = scenes[scenes.length - 1];
            const newDuration = Math.max(1, lastScene.duration + diff);

            State.updateScene(lastScene.scene_id, { duration: newDuration });
            showToast(`Adjusted last scene duration to ${newDuration}s`, 'success');
        } else if (fixType === 'visual_fx' && sceneId !== null) {
            // Fix invalid visual_fx - set to 'static'
            State.updateScene(sceneId, { visual_fx: 'static' });
            showToast(`Set scene ${sceneId} visual effect to "static"`, 'success');
        }
    }
}

export const Editor = SceneEditor;
