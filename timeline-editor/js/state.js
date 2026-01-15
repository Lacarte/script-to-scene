import { deepClone, calculateTimestamps, Storage } from './utils.js';

const MAX_HISTORY = 20;

class StateManager {
    constructor() {
        this.store = {
            projects: [],
            currentProject: null,
            scenes: [],
            selectedScene: null,
            syncStatus: "synced",
            lastSyncedAt: null,
            validationErrors: [],
            history: [],
            historyIndex: -1
        };
        this.listeners = new Map();
    }

    // Get current state or specific key
    get(key) {
        return key ? this.store[key] : this.store;
    }

    // Set state and notify listeners
    set(updates, skipHistory = false) {
        const prevState = deepClone(this.store);

        // Apply updates
        Object.assign(this.store, updates);

        // Auto-calculate timestamps when scenes change
        if (updates.scenes && !updates._skipTimestampCalc) {
            this.store.scenes = calculateTimestamps(this.store.scenes);
        }

        // Save to history for undo/redo (only for scene changes)
        if (!skipHistory && updates.scenes) {
            this._pushHistory(prevState.scenes);
        }

        // Auto-save to localStorage when scenes change
        if (updates.scenes) {
            this._autoSave();
        }

        // Notify all listeners
        this._notify(Object.keys(updates));
    }

    // Auto-save scenes to localStorage
    _autoSave() {
        const projectId = this.store.currentProject?.project_id;
        if (projectId && this.store.scenes.length) {
            Storage.save(`timeline_scenes_${projectId}`, this.store.scenes);
        }
    }

    // Subscribe to state changes
    subscribe(keys, callback) {
        const id = Symbol();
        this.listeners.set(id, { keys, callback });
        return () => this.listeners.delete(id);
    }

    // Notify listeners of changes
    _notify(changedKeys) {
        this.listeners.forEach(({ keys, callback }) => {
            if (keys.some(k => changedKeys.includes(k)) || keys.includes('*')) {
                callback(this.store);
            }
        });
    }

    // History management for undo/redo
    _pushHistory(scenes) {
        // Remove any future history if we're not at the end
        if (this.store.historyIndex < this.store.history.length - 1) {
            this.store.history = this.store.history.slice(0, this.store.historyIndex + 1);
        }

        this.store.history.push(deepClone(scenes));

        // Limit history size
        if (this.store.history.length > MAX_HISTORY) {
            this.store.history.shift();
        } else {
            this.store.historyIndex++;
        }

        // Notify listeners that history changed
        this._notify(['history', 'historyIndex']);
    }

    undo() {
        if (this.store.historyIndex > 0) {
            this.store.historyIndex--;
            const scenes = deepClone(this.store.history[this.store.historyIndex]);
            this.set({ scenes, _skipTimestampCalc: false }, true);
            this._notify(['historyIndex']);
            return true;
        }
        return false;
    }

    redo() {
        if (this.store.historyIndex < this.store.history.length - 1) {
            this.store.historyIndex++;
            const scenes = deepClone(this.store.history[this.store.historyIndex]);
            this.set({ scenes, _skipTimestampCalc: false }, true);
            this._notify(['historyIndex']);
            return true;
        }
        return false;
    }

    canUndo() {
        return this.store.historyIndex > 0;
    }

    canRedo() {
        return this.store.historyIndex < this.store.history.length - 1;
    }

    // Jump to a specific history state
    jumpToHistory(index) {
        if (index >= 0 && index < this.store.history.length) {
            this.store.historyIndex = index;
            const scenes = deepClone(this.store.history[index]);
            this.set({ scenes, _skipTimestampCalc: false }, true);
            this._notify(['historyIndex']);
            return true;
        }
        return false;
    }

    // Delete a specific history state
    deleteHistoryAt(index) {
        // Can't delete index 0 (initial state) or if only one item
        if (index <= 0 || index >= this.store.history.length) return false;

        // Remove the history entry
        this.store.history.splice(index, 1);

        // Adjust historyIndex if needed
        if (this.store.historyIndex >= index) {
            this.store.historyIndex = Math.max(0, this.store.historyIndex - 1);
        }

        // If we deleted current state, load the new current state
        const scenes = deepClone(this.store.history[this.store.historyIndex]);
        this.set({ scenes, _skipTimestampCalc: false }, true);
        this._notify(['history', 'historyIndex']);
        return true;
    }

    // Clear all history except current state
    clearHistory() {
        const currentScenes = deepClone(this.store.scenes);
        this.store.history = [currentScenes];
        this.store.historyIndex = 0;
        this._notify(['history', 'historyIndex']);
    }

    // Project operations
    setProjects(projects) {
        this.set({ projects }, true);
    }

    selectProject(project) {
        this.set({
            currentProject: project,
            scenes: [],
            selectedScene: null,
            history: [],
            historyIndex: -1
        }, true);

        // Remember last project
        if (project) {
            Storage.save('timeline_last_project', project.project_id);
        }
    }

    // Scene operations
    setScenes(scenes, skipLocalStorage = false) {
        // Check for saved scenes in localStorage first (unless skipLocalStorage)
        const projectId = this.store.currentProject?.project_id;
        let scenesToUse = scenes;

        if (!skipLocalStorage && projectId) {
            const savedScenes = Storage.load(`timeline_scenes_${projectId}`);
            if (savedScenes && savedScenes.length) {
                scenesToUse = savedScenes;
                console.log(`Loaded ${savedScenes.length} saved scenes from localStorage`);
            }
        }

        const calculated = calculateTimestamps(scenesToUse);
        this.store.history = [deepClone(calculated)];
        this.store.historyIndex = 0;
        this.set({ scenes: calculated, _skipTimestampCalc: true }, true);
    }

    // Clear saved scenes for a project
    clearSavedScenes() {
        const projectId = this.store.currentProject?.project_id;
        if (projectId) {
            Storage.remove(`timeline_scenes_${projectId}`);
        }
    }

    selectScene(scene) {
        this.set({ selectedScene: scene }, true);
    }

    updateScene(sceneId, updates) {
        const scenes = this.store.scenes.map(s =>
            s.scene_id === sceneId ? { ...s, ...updates } : s
        );
        this.set({ scenes });
    }

    addScene(scene) {
        const scenes = [...this.store.scenes, scene];
        this.set({ scenes });
    }

    removeScene(sceneId) {
        const scenes = this.store.scenes
            .filter(s => s.scene_id !== sceneId)
            .map((s, i) => ({ ...s, scene_id: i + 1 })); // Resequence
        this.set({ scenes });

        // Deselect if removed scene was selected
        if (this.store.selectedScene?.scene_id === sceneId) {
            this.set({ selectedScene: null }, true);
        }
    }

    reorderScenes(fromIndex, toIndex) {
        const scenes = [...this.store.scenes];
        const [moved] = scenes.splice(fromIndex, 1);
        scenes.splice(toIndex, 0, moved);

        // Resequence scene_ids
        const resequenced = scenes.map((s, i) => ({ ...s, scene_id: i + 1 }));
        this.set({ scenes: resequenced });
    }

    // Sync status
    setSyncStatus(status) {
        const updates = { syncStatus: status };
        if (status === 'synced') {
            updates.lastSyncedAt = new Date();
        }
        this.set(updates, true);
    }

    // Validation
    setValidationErrors(errors) {
        this.set({ validationErrors: errors }, true);
    }

    // Backup to localStorage
    backupScenes() {
        const projectId = this.store.currentProject?.project_id;
        if (projectId && this.store.scenes.length) {
            Storage.save(`timeline_backup_${projectId}`, this.store.scenes);
        }
    }

    restoreFromBackup() {
        const projectId = this.store.currentProject?.project_id;
        if (projectId) {
            const backup = Storage.load(`timeline_backup_${projectId}`);
            if (backup) {
                this.setScenes(backup);
                return true;
            }
        }
        return false;
    }
}

// Singleton instance
export const State = new StateManager();
