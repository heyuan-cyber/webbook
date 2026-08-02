import type { ReactNode } from 'react';

/** 固定色板（`{red}文本{/}`） */
export const MD_COLOR_NAMES: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#ca8a04',
  green: '#16a34a',
  blue: '#2563eb',
  purple: '#9333ea',
  pink: '#db2777',
  gray: '#64748b',
};

export const MD_COLOR_LIST = Object.keys(MD_COLOR_NAMES);

function resolveColor(name: string): string | null {
  const key = name.trim().toLowerCase();
  if (MD_COLOR_NAMES[key]) return MD_COLOR_NAMES[key];
  if (/^#[0-9a-f]{3,8}$/i.test(key)) return key;
  return null;
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < text.length) {
    if (text[i] === '[') {
      const m = text.slice(i).match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if (m) {
        parts.push(
          <a key={key++} href={m[2]} target="_blank" rel="noreferrer">
            {renderInline(m[1])}
          </a>,
        );
        i += m[0].length;
        continue;
      }
    }
    if (text[i] === '{') {
      const m = text.slice(i).match(/^\{([a-zA-Z#0-9]+)\}([\s\S]+?)\{\/\}/);
      if (m) {
        const color = resolveColor(m[1]);
        if (color) {
          parts.push(
            <span key={key++} style={{ color }}>
              {renderInline(m[2])}
            </span>,
          );
          i += m[0].length;
          continue;
        }
      }
    }
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        parts.push(<strong key={key++}>{renderInline(text.slice(i + 2, end))}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (text.startsWith('~~', i)) {
      const end = text.indexOf('~~', i + 2);
      if (end !== -1) {
        parts.push(<del key={key++}>{renderInline(text.slice(i + 2, end))}</del>);
        i = end + 2;
        continue;
      }
    }
    if (text.startsWith('++', i)) {
      const end = text.indexOf('++', i + 2);
      if (end !== -1) {
        parts.push(<u key={key++}>{renderInline(text.slice(i + 2, end))}</u>);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end !== -1 && text[end + 1] !== '*') {
        parts.push(<em key={key++}>{renderInline(text.slice(i + 1, end))}</em>);
        i = end + 1;
        continue;
      }
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        parts.push(<code key={key++}>{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }

    let j = i + 1;
    while (j < text.length) {
      const c = text[j];
      if (c === '[' || c === '{' || c === '*' || c === '~' || c === '+' || c === '`') break;
      j++;
    }
    parts.push(text.slice(i, j));
    i = j;
  }

  return parts.length ? parts : [text];
}

/** 轻量行内 Markdown（预览用；不执行任意 HTML） */
export function renderInlineMarkdown(text: string): ReactNode[] {
  return renderInline(text);
}

type BlockNode =
  | { type: 'code'; lang: string; code: string }
  | { type: 'tasks'; items: { checked: boolean; text: string }[] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'p'; text: string };

const TASK_LINE_RE = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const UL_LINE_RE = /^\s*[-*+]\s+(?!\[)/;
const OL_LINE_RE = /^\s*\d+\.\s+/;

function parseBlocks(src: string): BlockNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const lang = fence[1] || '';
      i++;
      const buf: string[] = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      out.push({ type: 'code', lang, code: buf.join('\n') });
      continue;
    }

    if (TASK_LINE_RE.test(line)) {
      const items: { checked: boolean; text: string }[] = [];
      while (i < lines.length) {
        const m = lines[i].match(TASK_LINE_RE);
        if (!m) break;
        items.push({ checked: m[1].toLowerCase() === 'x', text: m[2] });
        i++;
      }
      out.push({ type: 'tasks', items });
      continue;
    }

    if (UL_LINE_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_LINE_RE.test(lines[i]) && !TASK_LINE_RE.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      out.push({ type: 'list', ordered: false, items });
      continue;
    }

    if (OL_LINE_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_LINE_RE.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push({ type: 'list', ordered: true, items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push({ type: 'quote', text: buf.join('\n') });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !TASK_LINE_RE.test(lines[i]) &&
      !UL_LINE_RE.test(lines[i]) &&
      !OL_LINE_RE.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push({ type: 'p', text: buf.join('\n') });
  }

  return out;
}

/** 多行文档预览：代码块 / 列表 / 引用 / 段落 + 行内格式 */
export function renderMarkdownDocument(text: string, lineClassName = 'preview-line'): ReactNode {
  if (!text.trim()) return null;
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((b, idx) => {
        switch (b.type) {
          case 'code':
            return (
              <pre key={idx} className="md-code-block">
                <code data-lang={b.lang || undefined}>{b.code}</code>
              </pre>
            );
          case 'tasks':
            return (
              <ul key={idx} className="md-list md-task-list">
                {b.items.map((it, j) => (
                  <li key={j} className={it.checked ? 'is-checked' : ''}>
                    <span className="md-task-box" aria-hidden>
                      {it.checked ? '☑' : '☐'}
                    </span>
                    <span>{renderInline(it.text)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul';
            return (
              <Tag key={idx} className="md-list">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </Tag>
            );
          }
          case 'quote':
            return (
              <blockquote key={idx} className="md-quote">
                {b.text.split('\n').map((line, j) => (
                  <p key={j} className={lineClassName}>
                    {line.trim() ? renderInline(line) : '\u00a0'}
                  </p>
                ))}
              </blockquote>
            );
          case 'p':
            return (
              <div key={idx} className="md-paragraph">
                {b.text.split('\n').map((line, j) => (
                  <p key={j} className={lineClassName}>
                    {line.trim() ? renderInline(line) : '\u00a0'}
                  </p>
                ))}
              </div>
            );
        }
      })}
    </>
  );
}

/** 兼容旧调用 */
export function renderMultilineMarkdown(text: string, lineClassName = 'preview-line') {
  const node = renderMarkdownDocument(text, lineClassName);
  if (!node) return <span className={lineClassName}>{'\u00a0'}</span>;
  return node;
}
