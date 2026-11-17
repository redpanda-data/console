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

import { InlineInput } from 'components/redpanda-ui/components/input';
import { TagsValue } from 'components/redpanda-ui/components/tags';
import { cn } from 'components/redpanda-ui/lib/utils';
import { useState } from 'react';

type TagChipInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  testId: string;
  mono?: boolean;
  /** For a `<label htmlFor>` that names the text field. */
  id?: string;
  /** A muted note after a chip's value, such as where it came from. */
  noteFor?: (item: string) => string | undefined;
};

/**
 * Free-form chip input (Enter/comma commits, Backspace on an empty field
 * removes the last chip). The registry Tags component is a select-from-list
 * combobox, so it can't be used for arbitrary contexts/subjects.
 */
export const TagChipInput = ({
  value,
  onChange,
  placeholder,
  testId,
  mono = false,
  id,
  noteFor,
}: TagChipInputProps) => {
  const [draft, setDraft] = useState('');

  const commitDraft = (text: string) => {
    setDraft('');
    const additions = text
      .split(/[,\r\n]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry && !value.includes(entry));
    if (additions.length) {
      onChange([...value, ...new Set(additions)]);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter/Backspace during an IME composition belong to the composer, not
    // the chip list.
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft(draft);
      return;
    }
    if (event.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
      data-testid={testId}
    >
      {value.map((item) => {
        const note = noteFor?.(item);
        return (
          <TagsValue
            key={item}
            onRemove={() => onChange(value.filter((existing) => existing !== item))}
            testId={`${testId}-chip-${item}`}
          >
            {mono ? <code>{item}</code> : <span>{item}</span>}
            {note ? <span className="pl-1 text-muted-foreground">{note}</span> : null}
          </TagsValue>
        );
      })}
      <InlineInput
        className={cn(
          'h-6 min-w-40 flex-1 bg-transparent text-body outline-none placeholder:text-placeholder',
          mono && 'font-mono'
        )}
        data-testid={`${testId}-field`}
        id={id}
        onBlur={() => commitDraft(draft)}
        onKeyDown={handleKeyDown}
        onPaste={(event) => {
          const text = event.clipboardData.getData('text');
          if (/[,\r\n]/.test(text)) {
            event.preventDefault();
            const { selectionStart, selectionEnd } = event.currentTarget;
            commitDraft(
              draft.slice(0, selectionStart ?? draft.length) + text + draft.slice(selectionEnd ?? draft.length)
            );
          }
        }}
        onValueChange={setDraft}
        placeholder={placeholder}
        value={draft}
      />
    </div>
  );
};
