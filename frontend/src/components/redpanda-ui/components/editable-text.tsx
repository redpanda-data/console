'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { type CSSProperties, type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import { Input } from './input';
import { cn } from '../lib/utils';

const headingClasses: Record<number, string> = {
  1: 'text-heading-xl',
  2: 'text-heading-lg',
  3: 'text-heading-md',
  4: 'text-heading-sm',
  5: 'text-heading-xs',
};

interface EditableTextProps {
  as?: 'heading' | 'text' | undefined;
  autoFocus?: boolean | undefined;
  className?: string | undefined;
  error?: boolean | undefined;
  errorMessage?: string | undefined;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | undefined;
  /** A stable field name announced while editing, independent of its current value. */
  label: string;
  onBlur?: (() => void) | undefined;
  onChange?: ((value: string) => void) | undefined;
  placeholder?: string | undefined;
  readOnly?: boolean | undefined;
  value: string;
}

function EditableText({
  label,
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
  const showError = error === true && errorMessage !== undefined && errorMessage !== '';
  const errorId = useId();
  const describedBy = showError ? errorId : undefined;
  const displayedText = value === '' ? placeholder : value;
  const [isEditing, setIsEditing] = useState(autoFocus === true && readOnly !== true);
  const [draft, setDraft] = useState(value);
  const [textWidth, setTextWidth] = useState<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const spanRef = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  const restoreFocus = useRef(false);
  useLayoutEffect(
    function focusEditorMode() {
      if (isEditing) {
        const measuredWidth = measureRef.current?.offsetWidth;
        setTextWidth((previous) => previous ?? measuredWidth);
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (restoreFocus.current) {
        restoreFocus.current = false;
        spanRef.current?.focus();
      }
    },
    [isEditing]
  );

  const typographyClasses = as === 'heading' ? headingClasses[headingLevel] : 'font-sans text-body';

  const startEditing = () => {
    if (readOnly === true) {
      return;
    }
    setDraft(value);
    setTextWidth(spanRef.current?.offsetWidth);
    setIsEditing(true);
  };

  const commitDraft = () => {
    setIsEditing(false);
    if (draft !== value) {
      onChange?.(draft);
    }
    onBlur?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      restoreFocus.current = true;
      inputRef.current?.blur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      restoreFocus.current = true;
      setDraft(value);
      setIsEditing(false);
    }
  };

  const errorClasses = error === true ? 'border-destructive' : '';
  const measuredWidth: CSSProperties & { '--editable-text-width': string | undefined } = {
    '--editable-text-width': textWidth === undefined ? undefined : `${textWidth}px`,
  };

  return (
    <div className={cn('relative', typographyClasses)}>
      {isEditing ? (
        <>
          <span
            aria-hidden="true"
            className={cn(typographyClasses, 'pointer-events-none invisible absolute whitespace-pre')}
            ref={measureRef}
          >
            {displayedText}
          </span>
          <Input
            appearance="inline"
            aria-describedby={describedBy}
            aria-invalid={error === true || undefined}
            aria-label={label}
            className={cn(
              'max-w-full min-w-25 overflow-hidden',
              className,
              textWidth !== undefined && 'w-(--editable-text-width)'
            )}
            onBlur={commitDraft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            readOnly={readOnly}
            ref={inputRef}
            style={measuredWidth}
            value={draft}
          />
        </>
      ) : (
        <ButtonPrimitive
          aria-describedby={describedBy}
          className={cn(
            typographyClasses,
            'cursor-text border-b border-transparent text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none',
            'hover:not-disabled:border-input-hover',
            'line-clamp-1 max-w-full min-w-25 overflow-hidden text-ellipsis',
            value === '' && 'text-subtle',
            errorClasses,
            className
          )}
          disabled={readOnly}
          onClick={startEditing}
          ref={spanRef}
          type="button"
        >
          {displayedText}
        </ButtonPrimitive>
      )}
      {showError && (
        <p className="absolute top-full mt-1 text-body-sm text-destructive" id={errorId}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export { EditableText, type EditableTextProps };
