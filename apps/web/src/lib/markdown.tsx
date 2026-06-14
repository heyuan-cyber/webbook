import type { ReactNode } from 'react';

/** 轻量 Markdown 行内渲染（预览模式用） */
export function renderInlineMarkdown(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (link) {
        parts.push(
          <a key={key++} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>,
        );
      }
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

/** 多行文本预览：按 \\n 拆行并逐行渲染行内 Markdown */
export function renderMultilineMarkdown(text: string, lineClassName = 'preview-line') {
  const lines = text.split('\n');
  if (lines.length <= 1) {
    return <span className={lineClassName}>{renderInlineMarkdown(text)}</span>;
  }
  return lines.map((line, i) => (
    <p key={i} className={lineClassName}>
      {line.trim() ? renderInlineMarkdown(line) : '\u00a0'}
    </p>
  ));
}

