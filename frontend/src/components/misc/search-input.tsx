/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { CloseIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Input, InputEnd, InputStart } from 'components/redpanda-ui/components/input';
import { cn } from 'components/redpanda-ui/lib/utils';
import { SearchIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Leading icon; a magnifier unless given. */
  icon?: ReactNode;
  /** `/` anywhere on the page focuses the field. */
  slashToFocus?: boolean;
  className?: string;
  containerClassName?: string;
  testId?: string;
  'aria-label'?: string;
};

// Where `/` is a character the user is typing, not a shortcut.
const TYPING_TARGET = 'input, textarea, select, [contenteditable], [role="textbox"], [role="combobox"]';
const DIALOG = '[role="dialog"], [role="alertdialog"]';

/** Search field: leading icon, clear button, `/` to focus, Escape to clear (or blur when empty). */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  icon,
  slashToFocus = true,
  className,
  containerClassName,
  testId = 'search-field-input',
  'aria-label': ariaLabel,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isEmpty = value === '';

  useEffect(() => {
    if (!slashToFocus) {
      return;
    }
    const focusOnSlash = (event: KeyboardEvent) => {
      if (
        event.key !== '/' ||
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.isContentEditable || target?.closest(TYPING_TARGET)) {
        return;
      }
      // Focus inside an open dialog stays there unless the field is in the same dialog.
      const dialog = target?.closest(DIALOG);
      if (dialog && !dialog.contains(inputRef.current)) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', focusOnSlash);
    return () => document.removeEventListener('keydown', focusOnSlash);
  }, [slashToFocus]);

  // Refocus before the re-render disables the button, or focus lands on <body>.
  const clear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <Input
      aria-keyshortcuts="/"
      aria-label={ariaLabel}
      className={className}
      containerClassName={containerClassName}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.nativeEvent.isComposing) {
          return;
        }
        if (isEmpty) {
          event.currentTarget.blur();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onChange('');
      }}
      placeholder={placeholder}
      ref={inputRef}
      testId={testId}
      value={value}
    >
      <InputStart>
        <span className="flex text-muted-foreground" data-testid="search-field-search-icon">
          {icon ?? <SearchIcon className="size-4" />}
        </span>
      </InputStart>
      {/* Always mounted: InputEnd never resets the padding it measured. Click-through while empty. */}
      <InputEnd className={cn(!isEmpty && 'pointer-events-auto')}>
        <Button
          aria-label="Clear search"
          className={cn(isEmpty && 'invisible')}
          data-testid="search-field-reset-icon"
          disabled={isEmpty}
          onClick={clear}
          size="icon-xs"
          title="Clear (Esc)"
          variant="ghost"
        >
          <CloseIcon />
        </Button>
      </InputEnd>
    </Input>
  );
}
