'use client';

import { type KeyboardEvent, useCallback, useRef, useState } from 'react';

import { cn } from '../lib/utils';

const headingClasses: Record<number, string> = {
  1: 'font-display font-medium leading-none tracking-heading text-2xl',
  2: 'font-display font-medium leading-none tracking-heading text-xl',
  3: 'font-display font-medium leading-none tracking-heading text-lg',
  4: 'font-display font-medium leading-none tracking-heading text-md',
  5: 'font-display font-medium leading-none tracking-heading text-sm',
};

type EditableTextProps = {
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  as?: 'heading' | 'text';
  headingLevel?: 1 | 2 | 3 | 4 | 5;
  error?: boolean;
  errorMessage?: string;
  autoFocus?: boolean;
};

function EditableText({
  value,
  onChange,
  onBlur,
  placeholder,
  readOnly,
  className,
  as = 'text',
  headingLevel = 1,
  error,
  errorMessage,
  autoFocus,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(autoFocus ?? false);
  const [draft, setDraft] = useState(value);
  const [textWidth, setTextWidth] = useState<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const spanRef = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  const handleInputRef = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (!node) {
      return;
    }
    if (measureRef.current) {
      const measuredWidth = measureRef.current.offsetWidth;
      setTextWidth((prev) => prev ?? measuredWidth);
    }
    node.focus();
    node.select();
  }, []);

  const typographyClasses =
    as === 'heading' ? headingClasses[headingLevel] : 'font-sans font-normal text-sm leading-5 tracking-normal';

  const handleClick = useCallback(() => {
    if (readOnly) {
      return;
    }
    setDraft(value);
    setTextWidth(spanRef.current?.offsetWidth);
    setIsEditing(true);
  }, [readOnly, value]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (draft !== value) {
      onChange?.(draft);
    }
    onBlur?.();
  }, [draft, value, onChange, onBlur]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        inputRef.current?.blur();
      }
      if (e.key === 'Escape') {
        setDraft(value);
        setIsEditing(false);
      }
    },
    [value]
  );

  const errorClasses = error ? 'border-destructive' : '';

  if (isEditing) {
    return (
      <div className="relative">
        <span
          aria-hidden="true"
          className={cn(typographyClasses, 'pointer-events-none invisible absolute whitespace-pre')}
          ref={measureRef}
        >
          {value || placeholder}
        </span>
        <input
          className={cn(
            typographyClasses,
            'border-transparent bg-transparent px-0 shadow-none outline-none focus-visible:border-ring focus-visible:ring-0',
            'border-b',
            'line-clamp-1 min-w-[100px] max-w-full overflow-hidden text-ellipsis',
            errorClasses,
            className
          )}
          onBlur={handleBlur}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={handleInputRef}
          style={{ width: textWidth }}
          value={draft}
        />
        {error && !!errorMessage && <p className="absolute top-full mt-1 text-destructive text-xs">{errorMessage}</p>}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        className={cn(
          typographyClasses,
          'cursor-text border-transparent border-b text-left',
          'line-clamp-1 min-w-[100px] max-w-full overflow-hidden text-ellipsis',
          !value && 'text-muted-foreground',
          errorClasses,
          className
        )}
        disabled={readOnly}
        onClick={handleClick}
        ref={spanRef}
        type="button"
      >
        {value || placeholder}
      </button>
      {error && !!errorMessage && <p className="absolute top-full mt-1 text-destructive text-xs">{errorMessage}</p>}
    </div>
  );
}

export { EditableText, type EditableTextProps };
