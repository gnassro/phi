/**
 * Theme system — VS Code handles theming natively.
 * These exports exist only to avoid breaking imports in app.js.
 */

export const themes = {};
export function applyTheme() { /* no-op: VS Code theme is automatic */ }
export function getCurrentTheme() { return 'vscode'; }
