/**
 * Lightweight Markdown renderer with bundled Shiki fenced-code support.
 * Handles: headings, bold, italic, inline code, code blocks with language,
 * links, unordered/ordered lists, blockquotes, horizontal rules, tables,
 * task lists, images, paragraphs.
 */

import { getLanguageLabel, highlightRenderedCodeBlocks } from './syntax-highlighter.js';

export function renderMarkdown(text, options = {}) {
  if (!text) return '';

  // Normalize line endings
  text = text.replace(/\r\n/g, '\n');

  // Extract code blocks first to protect them
  const codeBlocks = [];
  text = text.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_, languageInfo, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ languageInfo, code: code.replace(/\n$/, '') });
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Split into lines and process block-level elements
  const lines = text.split('\n');
  let html = '';
  let inList = false;
  let listType = '';
  let inBlockquote = false;
  let blockquoteLines = [];

  function flushBlockquote() {
    if (inBlockquote) {
      html += '<blockquote>' + blockquoteLines.map(l => renderInline(l)).join('<br>') + '</blockquote>';
      inBlockquote = false;
      blockquoteLines = [];
    }
  }

  function flushList() {
    if (inList) { html += `</${listType}>`; inList = false; }
  }

  // Check if a line is a table separator (e.g. |---|---|)
  function isTableSeparator(line) {
    return /^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
  }

  // Check if a line looks like a table row
  function isTableRow(line) {
    return line.trim().startsWith('|') && line.trim().endsWith('|');
  }

  // Parse alignment from separator row
  function parseAlignments(line) {
    return line.split('|').filter(c => c.trim()).map(cell => {
      const trimmed = cell.trim();
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
      if (trimmed.endsWith(':')) return 'right';
      return 'left';
    });
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Code block placeholder
    const codeMatch = line.match(/^%%CODEBLOCK_(\d+)%%$/);
    if (codeMatch) {
      flushList();
      flushBlockquote();
      const block = codeBlocks[parseInt(codeMatch[1])];
      const shouldHighlight = options.highlightCodeBlocks !== false;
      const langLabel = getLanguageLabel(block.languageInfo);
      const highlightAttrs = shouldHighlight ? ` data-language="${escapeHtml(block.languageInfo || '')}"` : '';
      html += `<div class="code-block-wrapper"${highlightAttrs}>`;
      html += `<div class="code-block-header"><span>${escapeHtml(langLabel)}</span><button class="copy-btn" type="button">Copy</button></div>`;
      html += `<pre><code>${escapeHtml(block.code)}</code></pre></div>`;
      continue;
    }

    // Table detection: look ahead for header + separator pattern
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushList();
      flushBlockquote();

      const alignments = parseAlignments(lines[i + 1]);

      // Parse header
      const headerCells = line.split('|').filter(c => c.trim() !== '' || line.trim() === '|');
      // More robust: split between first and last pipe
      const headerRow = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');

      html += '<div class="table-wrapper"><table><thead><tr>';
      headerRow.forEach((cell, idx) => {
        const align = alignments[idx] || 'left';
        html += `<th style="text-align:${align}">${renderInline(cell.trim())}</th>`;
      });
      html += '</tr></thead><tbody>';

      // Skip separator
      i += 2;

      // Parse body rows
      while (i < lines.length && isTableRow(lines[i])) {
        const rowCells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
        html += '<tr>';
        rowCells.forEach((cell, idx) => {
          const align = alignments[idx] || 'left';
          html += `<td style="text-align:${align}">${renderInline(cell.trim())}</td>`;
        });
        html += '</tr>';
        i++;
      }

      html += '</tbody></table></div>';
      i--; // back up since the for loop will increment
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushList();
      flushBlockquote();
      html += '<hr>';
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      flushBlockquote();
      const level = headingMatch[1].length;
      html += `<h${level}>${renderInline(headingMatch[2])}</h${level}>`;
      continue;
    }

    // Blockquote — handle `>` with or without trailing space, and empty `>` lines
    if (/^>\s?/.test(line)) {
      flushList();
      if (!inBlockquote) { inBlockquote = true; blockquoteLines = []; }
      const content = line.replace(/^>\s?/, '');
      if (content === '') {
        // Empty blockquote line acts as paragraph break within quote
        blockquoteLines.push('');
      } else {
        blockquoteLines.push(content);
      }
      continue;
    } else if (inBlockquote) {
      flushBlockquote();
    }

    // Task list (must check before regular list)
    const taskMatch = line.match(/^(\s*)[*\-+]\s+\[([ xX])\]\s+(.+)$/);
    if (taskMatch) {
      if (!inList || listType !== 'ul') {
        flushList();
        html += '<ul class="task-list">';
        inList = true;
        listType = 'ul';
      }
      const checked = taskMatch[2] !== ' ';
      html += `<li class="task-list-item"><input type="checkbox" disabled ${checked ? 'checked' : ''}> ${renderInline(taskMatch[3])}</li>`;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[*\-+]\s+(.+)$/);
    if (ulMatch) {
      flushBlockquote();
      if (!inList || listType !== 'ul') {
        if (inList) html += `</${listType}>`;
        html += '<ul>';
        inList = true;
        listType = 'ul';
      }
      html += `<li>${renderInline(ulMatch[2])}</li>`;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      flushBlockquote();
      if (!inList || listType !== 'ol') {
        if (inList) html += `</${listType}>`;
        html += '<ol>';
        inList = true;
        listType = 'ol';
      }
      html += `<li>${renderInline(olMatch[2])}</li>`;
      continue;
    }

    // Close list if we're out of list items
    flushList();

    // Empty line
    if (line.trim() === '') {
      continue;
    }

    // Regular paragraph
    html += `<p>${renderInline(line)}</p>`;
  }

  // Close any open blocks
  flushList();
  flushBlockquote();

  return html;
}

/**
 * Lightweight user-message renderer — inline formatting + blockquotes only.
 * Preserves whitespace/newlines for everything else.
 */
export function renderUserMarkdown(text) {
  if (!text) return '';
  text = text.replace(/\r\n/g, '\n');

  const lines = text.split('\n');
  let html = '';
  let inBlockquote = false;
  let bqLines = [];

  function flushBq() {
    if (inBlockquote) {
      html += '<blockquote>' + bqLines.map(l => renderInline(l)).join('<br>') + '</blockquote>';
      inBlockquote = false;
      bqLines = [];
    }
  }

  for (const line of lines) {
    if (/^>\s?/.test(line)) {
      if (!inBlockquote) { inBlockquote = true; bqLines = []; }
      bqLines.push(line.replace(/^>\s?/, ''));
      continue;
    }
    flushBq();
    html += renderInline(line) + '\n';
  }
  flushBq();

  return html.replace(/\n$/, '');
}

function renderInline(text) {
  // Inline code (must come first to protect content)
  const codeSpans = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = codeSpans.length;
    // Detect file path references: contains / and looks like a path (optionally with :line-line)
    const pathMatch = code.match(/^([a-zA-Z0-9_.\-~][a-zA-Z0-9_.\-~/]+)(?::(\d+)-(\d+))?$/);
    const fullPath = pathMatch ? pathMatch[1] : '';
    const fileName = fullPath ? fullPath.split('/').filter(Boolean).pop() : '';

    // Must have at least one slash, not end in slash, not be a skill command, and not have spaces
    const isFilePath = pathMatch && 
                       fullPath.includes('/') && 
                       !code.endsWith('/') && 
                       !code.includes('skill:') &&
                       fileName && 
                       fileName.length > 0 && 
                       !fullPath.includes(' ') && 
                       fullPath.length < 150;

    if (isFilePath) {
      // It's a file path reference — show only filename
      const lineRange = pathMatch[2] && pathMatch[3] ? `:${pathMatch[2]}-${pathMatch[3]}` : '';
      const label = escapeHtml(fileName + lineRange);
      codeSpans.push(
        `<code class="context-ref-inline" title="${escapeHtml(code)}">` +
        `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:2px;opacity:0.6">` +
        `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>` +
        `<polyline points="14 2 14 8 20 8"/>` +
        `</svg>${label}</code>`
      );
    } else {
      codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    }
    return `%%ICODE${idx}%%`;
  });

  // Images (before links so ![...](...) isn't caught by link regex)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="inline-image">');

  // Bold + italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');

  // Strikethrough
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Auto-link bare URLs
  text = text.replace(/(^|[^"'])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');

  // Restore inline code
  text = text.replace(/%%ICODE(\d+)%%/g, (_, idx) => codeSpans[parseInt(idx)]);

  return text;
}

export { highlightRenderedCodeBlocks };

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

installCodeBlockCopyHandler();

function installCodeBlockCopyHandler() {
  if (typeof document === 'undefined') return;

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const btn = target.closest('.code-block-header .copy-btn');
    if (!btn) return;

    const codeBlock = btn.closest('.code-block-wrapper')?.querySelector('code');
    const text = codeBlock?.textContent || '';
    if (!text) return;

    copyText(text).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 2000);
    });
  });
}

function copyText(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return Promise.resolve();
}
