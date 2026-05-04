import {
  bundledLanguages,
  createHighlighter,
} from 'shiki/bundle/full';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import darkPlusTheme from 'shiki/themes/dark-plus.mjs';

const THEME_NAME = 'phi-dark-plus-vars';

// Dark+ gives broad TextMate-scope coverage. Replace every bundled theme color
// with a VS Code CSS variable so the webview still follows the user's theme.
const DARK_PLUS_COLOR_REPLACEMENTS = new Map([
  ['#000080', 'var(--vscode-textLink-foreground)'],
  ['#4ec9b0', 'var(--vscode-symbolIcon-classForeground, var(--vscode-symbolIcon-typeParameterForeground, var(--vscode-textLink-foreground)))'],
  ['#4fc1ff', 'var(--vscode-symbolIcon-variableForeground, var(--vscode-textLink-foreground))'],
  ['#569cd6', 'var(--vscode-symbolIcon-keywordForeground, var(--vscode-textLink-foreground))'],
  ['#646695', 'var(--vscode-symbolIcon-propertyForeground, var(--vscode-descriptionForeground))'],
  ['#6796e6', 'var(--vscode-textLink-foreground)'],
  ['#6a9955', 'var(--vscode-descriptionForeground)'],
  ['#808080', 'var(--vscode-descriptionForeground)'],
  ['#9cdcfe', 'var(--vscode-symbolIcon-variableForeground, var(--vscode-editor-foreground))'],
  ['#b5cea8', 'var(--vscode-symbolIcon-numberForeground, var(--vscode-terminal-ansiYellow))'],
  ['#c586c0', 'var(--vscode-symbolIcon-keywordForeground, var(--vscode-textLink-foreground))'],
  ['#c8c8c8', 'var(--vscode-descriptionForeground)'],
  ['#ce9178', 'var(--vscode-symbolIcon-stringForeground, var(--vscode-terminal-ansiGreen))'],
  ['#d16969', 'var(--vscode-errorForeground)'],
  ['#d4d4d4', 'var(--vscode-descriptionForeground, var(--vscode-editor-foreground))'],
  ['#d7ba7d', 'var(--vscode-symbolIcon-propertyForeground, var(--vscode-textLink-foreground))'],
  ['#dcdcaa', 'var(--vscode-symbolIcon-functionForeground, var(--vscode-textLink-foreground))'],
  ['#f44747', 'var(--vscode-errorForeground)'],
]);

const theme = createPhiTheme();

const LANGUAGE_ALIASES = new Map([
  ['plain', 'text'],
  ['plaintext', 'text'],
  ['txt', 'text'],
  ['golang', 'go'],
  ['shellscript', 'bash'],
  ['shell', 'bash'],
  ['sh', 'bash'],
  ['zsh', 'bash'],
  ['h++', 'cpp'],
  ['hpp', 'cpp'],
  ['cc', 'cpp'],
  ['cs', 'csharp'],
  ['fs', 'fsharp'],
  ['objective-c', 'objective-c'],
  ['objc', 'objective-c'],
]);

let highlighter = null;
const highlighterPromise = createHighlighter({
  themes: [theme],
  langs: [],
  engine: createJavaScriptRegexEngine(),
}).then((instance) => {
  highlighter = instance;
  return instance;
}).catch((error) => {
  console.warn('Phi: failed to initialize syntax highlighter', error);
  return null;
});

const loadedLanguages = new Set();

export function getLanguageLabel(languageInfo = '', highlightedLanguage = '') {
  return extractLanguageToken(languageInfo) || highlightedLanguage || 'code';
}

export function normalizeLanguage(languageInfo = '') {
  const token = extractLanguageToken(languageInfo).toLowerCase();
  if (!token) return '';
  return LANGUAGE_ALIASES.get(token) || token;
}

export async function highlightRenderedCodeBlocks(root = document) {
  if (!root?.querySelectorAll) return;

  const wrappers = Array.from(
    root.querySelectorAll('.code-block-wrapper:not([data-shiki-highlighted="true"])')
  );
  if (wrappers.length === 0) return;

  const instance = highlighter || await highlighterPromise;
  if (!instance) return;

  for (const wrapper of wrappers) {
    await highlightWrapper(instance, wrapper);
  }
}

async function highlightWrapper(instance, wrapper) {
  const codeEl = wrapper.querySelector('pre code');
  if (!codeEl) return;

  const language = normalizeLanguage(wrapper.dataset.language || '');
  if (!language || language === 'text') return;

  if (!await ensureLanguageLoaded(instance, language)) return;

  try {
    const highlightedHtml = instance.codeToHtml(codeEl.textContent || '', {
      lang: language,
      theme: THEME_NAME,
    });

    const template = document.createElement('template');
    template.innerHTML = highlightedHtml.trim();
    const highlightedPre = template.content.firstElementChild;
    if (!highlightedPre) return;

    highlightedPre.classList.add('code-block-pre');
    wrapper.querySelector('pre')?.replaceWith(highlightedPre);
    wrapper.dataset.shikiHighlighted = 'true';
  } catch (error) {
    console.warn(`Phi: failed to highlight ${language} code block`, error);
  }
}

async function ensureLanguageLoaded(instance, language) {
  if (loadedLanguages.has(language)) return true;
  if (!isBundledLanguage(language)) return false;

  try {
    await instance.loadLanguage(language);
    loadedLanguages.add(language);
    return true;
  } catch (error) {
    console.warn(`Phi: failed to load ${language} syntax grammar`, error);
    return false;
  }
}

function createPhiTheme() {
  const cloned = JSON.parse(JSON.stringify(darkPlusTheme));
  cloned.name = THEME_NAME;
  cloned.colors = {
    ...(cloned.colors || {}),
    'editor.background': 'var(--vscode-editor-background)',
    'editor.foreground': 'var(--vscode-descriptionForeground, var(--vscode-editor-foreground))',
  };

  for (const tokenColor of cloned.tokenColors || []) {
    if (tokenColor.settings?.foreground) {
      tokenColor.settings.foreground = mapThemeColor(tokenColor.settings.foreground);
    }
  }

  return cloned;
}

function mapThemeColor(color) {
  return DARK_PLUS_COLOR_REPLACEMENTS.get(String(color).toLowerCase()) ||
    'var(--vscode-editor-foreground)';
}

function isBundledLanguage(language) {
  return language === 'text' || Boolean(bundledLanguages[language]);
}

function extractLanguageToken(languageInfo = '') {
  const raw = String(languageInfo || '').trim();
  if (!raw) return '';

  return raw.split(/\s+/)[0]
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .replace(/^\./, '')
    .replace(/^language-/i, '')
    .trim();
}
