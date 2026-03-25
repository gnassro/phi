import * as vscode from 'vscode';

/**
 * EditorContext
 *
 * Reads VS Code editor state and exposes it for IpcBridge to send to the webview.
 *
 * RULE: This module is STRICTLY READ-ONLY.
 * It never writes to the editor, never calls vscode.workspace.applyEdit(),
 * never modifies any file. All file changes go through Pi's built-in tools.
 *
 * Exported shape (EditorContext):
 * {
 *   file: string | null           — absolute path of the active file
 *   language: string | null       — VS Code language ID ("typescript", "python", …)
 *   selection: {
 *     text: string
 *     startLine: number           — 1-based
 *     endLine: number             — 1-based
 *   } | null                      — null when nothing is selected
 *   diagnostics: Array<{
 *     file: string
 *     line: number                — 1-based
 *     message: string
 *     severity: 'error' | 'warning'
 *   }>
 * }
 */

export interface SelectionContext {
  text: string;
  startLine: number;
  endLine: number;
}

export interface DiagnosticItem {
  file: string;
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface EditorContextShape {
  file: string | null;
  language: string | null;
  selection: SelectionContext | null;
  diagnostics: DiagnosticItem[];
}

// ─── Watch utilities ──────────────────────────────────────────────────────────

let selectionDebounce: ReturnType<typeof setTimeout> | null = null;
let diagnosticsDebounce: ReturnType<typeof setTimeout> | null = null;

/**
 * Watch for active editor selection changes.
 * Debounced to 300ms to avoid flooding the webview while the user drags.
 */
export function watchSelection(callback: () => void): vscode.Disposable {
  return vscode.window.onDidChangeTextEditorSelection(() => {
    if (selectionDebounce) clearTimeout(selectionDebounce);
    selectionDebounce = setTimeout(callback, 300);
  });
}

/**
 * Watch for workspace diagnostics changes (errors / warnings).
 * Debounced to 500ms — diagnostics can update rapidly during typing.
 */
export function watchDiagnostics(callback: () => void): vscode.Disposable {
  return vscode.languages.onDidChangeDiagnostics(() => {
    if (diagnosticsDebounce) clearTimeout(diagnosticsDebounce);
    diagnosticsDebounce = setTimeout(callback, 500);
  });
}

// ─── Context builders ─────────────────────────────────────────────────────────

/**
 * Build the full EditorContext snapshot from current VS Code state.
 */
export function getContext(): EditorContextShape {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return {
      file: null,
      language: null,
      selection: null,
      diagnostics: getDiagnostics(),
    };
  }

  const doc = editor.document;
  const sel = editor.selection;
  const selectedText = doc.getText(sel).trim();

  return {
    file: doc.uri.fsPath,
    language: doc.languageId,
    selection:
      selectedText.length > 0
        ? {
            text: selectedText,
            startLine: sel.start.line + 1, // convert 0-based to 1-based
            endLine: sel.end.line + 1,
          }
        : null,
    diagnostics: getDiagnostics(),
  };
}

/**
 * Get all errors and warnings from the current workspace.
 * Filters to only Error and Warning severity (ignores Hint, Information).
 * Caps at 20 items to avoid flooding the webview with noise.
 */
function getDiagnostics(): DiagnosticItem[] {
  const result: DiagnosticItem[] = [];

  for (const [uri, diags] of vscode.languages.getDiagnostics()) {
    for (const diag of diags) {
      if (
        diag.severity !== vscode.DiagnosticSeverity.Error &&
        diag.severity !== vscode.DiagnosticSeverity.Warning
      ) {
        continue;
      }

      result.push({
        file: uri.fsPath,
        line: diag.range.start.line + 1,
        message: diag.message,
        severity:
          diag.severity === vscode.DiagnosticSeverity.Error
            ? 'error'
            : 'warning',
      });

      if (result.length >= 20) return result; // cap at 20
    }
  }

  return result;
}

/**
 * Build a formatted prompt string from the current selection.
 * Used by the "phi.askAboutSelection" command.
 *
 * Example output:
 *   In `src/app.ts` lines 42-58 (typescript):
 *   ```
 *   function foo() { ... }
 *   ```
 */
export function buildSelectionPrompt(): string | null {
  const ctx = getContext();
  if (!ctx.file || !ctx.selection) return null;

  const lang = ctx.language ?? '';
  const lines = `lines ${ctx.selection.startLine}-${ctx.selection.endLine}`;

  return `In \`${ctx.file}\` ${lines} (${lang}):\n\`\`\`${lang}\n${ctx.selection.text}\n\`\`\``;
}
