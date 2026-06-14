import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { renderInlineMarkdown } from '@/lib/markdown';

interface Props {
  blockId: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  registerRef: (id: string, el: HTMLElement | null) => void;
  multiline?: boolean;
  inputClassName?: string;
  previewClassName?: string;
  rows?: number;
  extra?: ReactNode;
}

/** 失焦显示 Markdown 渲染，聚焦编辑源码 */
export function EditableMarkdownField({
  blockId,
  value,
  onChange,
  onKeyDown,
  placeholder = '',
  registerRef,
  multiline = true,
  inputClassName = '',
  previewClassName = '',
  rows = 2,
  extra,
}: Props) {
  const [editing, setEditing] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      registerRef(blockId, inputRef.current);
    } else {
      registerRef(blockId, shellRef.current);
    }
  }, [blockId, editing, registerRef]);

  function startEditing() {
    setEditing(true);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }

  function renderPreview() {
    if (!value.trim()) {
      return <span className="md-field-placeholder muted">{placeholder}</span>;
    }
    if (multiline) {
      return value.split('\n').map((line, i) => (
        <p key={i} className={`preview-md md-field-line ${previewClassName}`}>
          {line.trim() ? renderInlineMarkdown(line) : '\u00a0'}
        </p>
      ));
    }
    return (
      <span className={`preview-md ${previewClassName}`}>{renderInlineMarkdown(value)}</span>
    );
  }

  if (!editing) {
    return (
      <div className="md-field">
        {extra}
        <div
          ref={shellRef}
          className={`md-field-preview ${inputClassName} ${!value.trim() ? 'is-empty' : ''}`}
          tabIndex={0}
          role="textbox"
          aria-multiline={multiline}
          onMouseDown={(e) => {
            e.preventDefault();
            startEditing();
          }}
          onFocus={startEditing}
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
    onKeyDown,
    onBlur: () => setEditing(false),
    placeholder,
    autoFocus: true,
  };

  if (multiline) {
    return (
      <div className="md-field">
        {extra}
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className={inputClassName}
          rows={Math.max(rows, value.split('\n').length)}
          {...common}
        />
      </div>
    );
  }

  return (
    <div className="md-field">
      {extra}
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        className={inputClassName}
        {...common}
      />
    </div>
  );
}
