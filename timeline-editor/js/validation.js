import { ALLOWED_VFX, formatTimestamp, getTotalDuration } from './utils.js';

// Validation error types
export const ErrorType = {
    ERROR: 'error',
    WARNING: 'warning'
};

// Validate a single scene
export function validateScene(scene) {
    const errors = [];

    // Rule 1: duration > 0
    if (!scene.duration || scene.duration <= 0) {
        errors.push({
            type: ErrorType.ERROR,
            sceneId: scene.scene_id,
            field: 'duration',
            message: `Scene ${scene.scene_id}: Duration must be a positive number`,
            suggestion: 'Set a duration value greater than 0 seconds'
        });
    }

    // Rule 6: text/cta scenes require text_content
    if ((scene.scene_type === 'text' || scene.scene_type === 'cta') && !scene.text_content?.trim()) {
        errors.push({
            type: ErrorType.ERROR,
            sceneId: scene.scene_id,
            field: 'text_content',
            message: `Scene ${scene.scene_id}: Text/CTA scenes require text content`,
            suggestion: 'Add text in the "Text Content" field or change scene type'
        });
    }

    // Rule 7: visual scenes should have prompt (warning) - skip text, cta, transition
    const noPromptNeeded = ['text', 'cta', 'transition'];
    if (!noPromptNeeded.includes(scene.scene_type) && !scene.prompt?.trim()) {
        errors.push({
            type: ErrorType.WARNING,
            sceneId: scene.scene_id,
            field: 'prompt',
            message: `Scene ${scene.scene_id}: Missing prompt for visual scene`,
            suggestion: 'Add an image generation prompt describing the visual'
        });
    }

    // Rule 8: visual_fx must be in allowed list
    if (scene.visual_fx && !ALLOWED_VFX.includes(scene.visual_fx)) {
        errors.push({
            type: ErrorType.ERROR,
            sceneId: scene.scene_id,
            field: 'visual_fx',
            message: `Scene ${scene.scene_id}: Invalid visual effect "${scene.visual_fx}"`,
            suggestion: `Use one of: ${ALLOWED_VFX.join(', ')}`,
            fixable: true
        });
    }

    return errors;
}

// Validate all scenes in a project
export function validateProject(scenes, projectDuration = null) {
    const errors = [];

    if (!scenes || scenes.length === 0) {
        return errors;
    }

    // Validate each scene individually
    scenes.forEach(scene => {
        errors.push(...validateScene(scene));
    });

    // Rule 2 & 3: scene_id sequential and no duplicates
    const sceneIds = scenes.map(s => s.scene_id);
    const expectedIds = scenes.map((_, i) => i + 1);

    const hasDuplicates = sceneIds.length !== new Set(sceneIds).size;
    const isSequential = JSON.stringify(sceneIds.sort((a, b) => a - b)) === JSON.stringify(expectedIds);

    if (hasDuplicates) {
        errors.push({
            type: ErrorType.ERROR,
            sceneId: null,
            field: 'scene_id',
            message: 'Duplicate scene IDs detected',
            suggestion: 'Delete duplicate scenes or renumber them manually'
        });
    }

    if (!isSequential) {
        errors.push({
            type: ErrorType.ERROR,
            sceneId: null,
            field: 'scene_id',
            message: 'Scene IDs are not sequential (expected 1, 2, 3...)',
            suggestion: 'Reorder or renumber scenes to be sequential starting from 1'
        });
    }

    // Rule 4: timestamp matches calculated
    let cumulative = 0;
    scenes.forEach(scene => {
        const expectedTimestamp = formatTimestamp(cumulative);
        if (scene.timestamp !== expectedTimestamp) {
            errors.push({
                type: ErrorType.WARNING,
                sceneId: scene.scene_id,
                field: 'timestamp',
                message: `Scene ${scene.scene_id}: Timestamp mismatch (expected ${expectedTimestamp}, got ${scene.timestamp})`,
                suggestion: 'Timestamps auto-recalculate on save'
            });
        }
        cumulative += scene.duration || 0;
    });

    // Rule 5: total duration matches project duration (if available)
    if (projectDuration !== null && projectDuration > 0) {
        const totalDuration = getTotalDuration(scenes);
        if (totalDuration !== projectDuration) {
            const diff = projectDuration - totalDuration;
            const action = diff > 0 ? `add ${diff}s` : `remove ${Math.abs(diff)}s`;
            errors.push({
                type: ErrorType.WARNING,
                sceneId: null,
                field: 'duration',
                message: `Total duration (${totalDuration}s) doesn't match project duration (${projectDuration}s)`,
                suggestion: `Adjust scene durations to ${action} total`,
                fixable: true
            });
        }
    }

    return errors;
}

// Get errors for a specific scene
export function getSceneErrors(errors, sceneId) {
    return errors.filter(e => e.sceneId === sceneId);
}

// Get errors for a specific field
export function getFieldErrors(errors, sceneId, field) {
    return errors.filter(e => e.sceneId === sceneId && e.field === field);
}

// Check if there are any blocking errors (not warnings)
export function hasBlockingErrors(errors) {
    return errors.some(e => e.type === ErrorType.ERROR);
}

// Get error counts by type
export function getErrorCounts(errors) {
    return {
        errors: errors.filter(e => e.type === ErrorType.ERROR).length,
        warnings: errors.filter(e => e.type === ErrorType.WARNING).length,
        total: errors.length
    };
}

// Format error for display
export function formatError(error, includeSuggestion = true) {
    const icon = error.type === ErrorType.ERROR ? '❌' : '⚠️';
    let formatted = `${icon} ${error.message}`;
    if (includeSuggestion && error.suggestion) {
        formatted += `<span class="validation-suggestion">→ ${error.suggestion}</span>`;
    }
    return formatted;
}

export const Validation = {
    validateScene,
    validateProject,
    getSceneErrors,
    getFieldErrors,
    hasBlockingErrors,
    getErrorCounts,
    formatError,
    ErrorType
};
