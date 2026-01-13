// Google Sheets API Key configuration
export const SHEETS_CONFIG = {
    SHEET_ID: "1tnEvx0R3Fo7J6kwHCZKdQEhipXLMZmJY7jgDp3lkEyU",
    API_KEY: "AIzaSyCmczFnl6hG0VNBOyeeKBD_RNqgUOPEr0U",
    SESSIONS_RANGE: "sessions!A:F",
    SCENES_RANGE: "script-to-scene!A:P"
};

export function isConfigured() {
    return !SHEETS_CONFIG.SHEET_ID.includes("YOUR_SHEET") &&
        !SHEETS_CONFIG.API_KEY.includes("YOUR_API");
}
