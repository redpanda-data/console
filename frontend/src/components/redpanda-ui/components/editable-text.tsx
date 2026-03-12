/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

// TODO: upstream to UI registry
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

const headingClasses: Record<number, string> = {
  1: 'font-display font-medium leading-none tracking-heading text-2xl',
  2: 'font-display font-medium leading-none tracking-heading text-xl',
  3: 'font-display font-medium leading-none tracking-heading text-lg',
  4: 'font-display font-medium leading-none tracking-heading text-md',
  5: 'font-display font-medium leading-none tracking-heading text-sm',
};

interface EditableTextProps {
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
}

export function EditableText({
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const typographyClasses =
    as === 'heading' ? headingClasses[headingLevel] : 'font-sans font-normal text-sm leading-5 tracking-normal';

  const handleClick = useCallback(() => {
    if (readOnly) return;
    setIsEditing(true);
  }, [readOnly]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (draft !== value) {
      onChange?.(draft);
    }
    onBlur?.();
  }, [draft, value, onChange, onBlur]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        <input
          ref={inputRef}
          className={cn(
            typographyClasses,
            'border-transparent bg-transparent px-0 shadow-none outline-none focus-visible:border-ring focus-visible:ring-0',
            'border-b',
            errorClasses,
            className
          )}
          onBlur={handleBlur}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          value={draft}
        />
        {error && errorMessage && (
          <p className="absolute top-full mt-1 text-destructive text-xs">{errorMessage}</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <span
        className={cn(
          typographyClasses,
          'cursor-text border-b border-transparent',
          !value && 'text-muted-foreground',
          errorClasses,
          className
        )}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick();
        }}
        role="button"
        tabIndex={readOnly ? undefined : 0}
      >
        {value || placeholder}
      </span>
      {error && errorMessage && (
        <p className="absolute top-full mt-1 text-destructive text-xs">{errorMessage}</p>
      )}
    </div>
  );
}
