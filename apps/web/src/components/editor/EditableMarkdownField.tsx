import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { MD_COLOR_LIST, MD_COLOR_NAMES, renderInlineMarkdown, renderMarkdownDocument } from '@/lib/markdown';

interface Props {
  blockId: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onActivate?: () => void;
  placeholder?: string;
  registerRef?: (id: string, el: HTMLElement | null) => void;
  multiline?: boolean;
  inputClassName?: string;
  previewClassName?: string;
  rows?: number;
  extra?: ReactNode;
  /** 预览态如何进入源码：flow 用 click，舞台用 dblclick */
  activateOn?: 'click' | 'dblclick';
  showModeToggle?: boolean;
  readOnly?: boolean;
  /** 挂载时直接进入源码（如新建块 autoFocus） */
  defaultEditing?: boolean;
}

function wrapSelection(
  el: HTMLInputElement | HTMLTextAreaElement,
  before: string,
  after: string,
  onChange: (v: string) => void,
) {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const selected = el.value.slice(start, end) || '文本';
  const next = el.value.slice(0, start) + before + selected + after + el.value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    const a = start + before.length;
    const b = a + selected.length;
    el.setSelectionRange(a, b);
  });
}

/** 默认预览 Markdown；可切换到源码编辑 */
export function EditableMarkdownField({
  blockId,
  value,
  onChange,
  onKeyDown,
  onActivate,
  placeholder = '',
  registerRef,
  multiline = true,
  inputClassName = '',
  previewClassName = '',
  rows = 2,
  extra,
  activateOn = 'click',
  showModeToggle = true,
  readOnly = false,
  defaultEditing = false,
}: Props) {
  const [editing, setEditing] = useState(defaultEditing && !readOnly);
  const shellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!registerRef) return;
    if (editing) registerRef(blockId, inputRef.current);
    else registerRef(blockId, shellRef.current);
  }, [blockId, editing, registerRef]);

  useEffect(() => {
    if (defaultEditing && !readOnly) setEditing(true);
  }, [defaultEditing, readOnly]);

  function startEditing() {
    if (readOnly) return;
    onActivate?.();
    setEditing(true);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }

  function stopEditing() {
    setEditing(false);
  }

  function renderPreview() {
    if (!value.trim()) {
      return <span className="md-field-placeholder muted">{placeholder}</span>;
    }
    if (multiline) {
      return (
        <div className={`preview-md ${previewClassName}`}>
          {renderMarkdownDocument(value, 'md-field-line')}
        </div>
      );
    }
    return (
      <span className={`preview-md ${previewClassName}`}>{renderInlineMarkdown(value)}</span>
    );
  }

  function onPreviewActivate(e: React.MouseEvent | React.FocusEvent) {
    if (readOnly) return;
    if (activateOn === 'dblclick' && e.type !== 'dblclick') {
      // 单击仅聚焦预览壳，不进源码（舞台可拖）
      return;
    }
    e.preventDefault?.();
    startEditing();
  }

  const toolbar = editing && !readOnly && (
    <div className="md-field-toolbar" data-stage-interactive onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" title="粗体" onClick={() => inputRef.current && wrapSelection(inputRef.current, '**', '**', onChange)}>
        B
      </button>
      <button type="button" title="斜体" onClick={() => inputRef.current && wrapSelection(inputRef.current, '*', '*', onChange)}>
        I
      </button>
      <button type="button" title="删除线" onClick={() => inputRef.current && wrapSelection(inputRef.current, '~~', '~~', onChange)}>
        S
      </button>
      <button type="button" title="下划线" onClick={() => inputRef.current && wrapSelection(inputRef.current, '++', '++', onChange)}>
        U
      </button>
      <button type="button" title="行内代码" onClick={() => inputRef.current && wrapSelection(inputRef.current, '`', '`', onChange)}>
        {'</>'}
      </button>
      <button
        type="button"
        title="代码块"
        onClick={() =>
          inputRef.current && wrapSelection(inputRef.current, '```\n', '\n```', onChange)
        }
      >
        {'{ }'}
      </button>
      <span className="md-field-toolbar-sep" />
      {MD_COLOR_LIST.map((name) => (
        <button
          key={name}
          type="button"
          className="md-color-dot"
          title={name}
          style={{ background: MD_COLOR_NAMES[name] }}
          onClick={() =>
            inputRef.current && wrapSelection(inputRef.current, `{${name}}`, '{/}', onChange)
          }
        />
      ))}
    </div>
  );

  const modeToggle = showModeToggle && !readOnly && (
    <button
      type="button"
      className="md-mode-toggle"
      data-stage-interactive
      title={editing ? '显示预览' : '编辑 Markdown 源码'}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (editing) stopEditing();
        else startEditing();
      }}
    >
      {editing ? '预览' : '源码'}
    </button>
  );

  if (!editing) {
    return (
      <div className="md-field">
        <div className="md-field-bar">
          {extra}
          {modeToggle}
        </div>
        <div
          ref={shellRef}
          className={`md-field-preview ${inputClassName} ${!value.trim() ? 'is-empty' : ''}`}
          tabIndex={0}
          role="textbox"
          aria-multiline={multiline}
          aria-readonly={readOnly}
          onMouseDown={(e) => {
            if (activateOn === 'click' && !readOnly) {
              e.preventDefault();
              startEditing();
            }
          }}
          onDoubleClick={(e) => {
            if (activateOn === 'dblclick') onPreviewActivate(e);
          }}
          onKeyDown={(e) => {
            if (readOnly) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              startEditing();
            }
          }}
        >
          {renderPreview()}
        </div>
      </div>
    );
  }

  const common = {
    value,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        stopEditing();
        return;
      }
      onKeyDown?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      const next = e.relatedTarget as HTMLElement | null;
      if (next?.closest('.md-field-toolbar, .md-mode-toggle')) return;
      stopEditing();
    },
    placeholder,
    autoFocus: true,
  };

  return (
    <div className="md-field is-editing" data-stage-interactive>
      <div className="md-field-bar">
        {extra}
        {modeToggle}
      </div>
      {toolbar}
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className={inputClassName}
          rows={Math.max(rows, value.split('\n').length)}
          {...common}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          className={inputClassName}
          {...common}
        />
      )}
    </div>
  );
}
