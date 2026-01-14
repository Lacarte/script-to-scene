// Scene type colors
export const SCENE_COLORS = {
    hook: "#FF4444",
    buildup: "#FF8C00",
    text: "#AA44FF",
    peak: "#FFDD00",
    transition: "#4488FF",
    cta: "#44FF44",
    speaker: "#FF44AA",
    final_statement: "#44FFFF"
};

// Visual FX icons
export const VFX_ICONS = {
    zoom_in: "🔍+",
    zoom_out: "🔍-",
    pan_left: "⬅️",
    pan_right: "➡️",
    fade: "🌫️",
    static: "⏹️",
    shake: "📳",
    slow_motion: "🐌"
};

// Allowed visual effects
export const ALLOWED_VFX = Object.keys(VFX_ICONS);

// Scene types
export const SCENE_TYPES = Object.keys(SCENE_COLORS);

// Status options
export const STATUS_OPTIONS = ["pending", "done", "error"];

// Format seconds to m:ss
export function formatTimestamp(seconds) {
    const totalSeconds = Math.floor(seconds);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Parse m:ss to seconds
export function parseTimestamp(timestamp) {
    const [m, s] = timestamp.split(':').map(Number);
    return m * 60 + s;
}

// Calculate timestamps for all scenes based on durations
export function calculateTimestamps(scenes) {
    let cumulative = 0;
    return scenes.map(scene => {
        const timestamp = formatTimestamp(cumulative);
        cumulative += scene.duration;
        return { ...scene, timestamp };
    });
}

// Get total duration of scenes
export function getTotalDuration(scenes) {
    return scenes.reduce((sum, scene) => sum + (scene.duration || 0), 0);
}

// Generate unique ID
export function generateId() {
    return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// Deep clone object
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// Debounce function
export function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

// Format relative time
export function formatRelativeTime(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return date.toLocaleDateString();
}

// Local storage helpers
export const Storage = {
    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Storage save error:', e);
            return false;
        }
    },

    load(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Storage load error:', e);
            return null;
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    }
};

// Toast container and queue management
let toastContainer = null;
let toastQueue = [];
let isProcessingQueue = false;

function getToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}

// Show toast notification with vertical stacking and delay
export function showToast(message, type = 'info', delay = 0) {
    const container = getToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Stagger the appearance based on existing toasts
    const existingToasts = container.querySelectorAll('.toast.show').length;
    const staggerDelay = delay || existingToasts * 150;

    setTimeout(() => toast.classList.add('show'), 10 + staggerDelay);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000 + staggerDelay);
}
