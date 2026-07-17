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

import { TagsValue } from 'components/redpanda-ui/components/tags';
import { cn } from 'components/redpanda-ui/lib/utils';
import { useState } from 'react';

type TagChipInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  testId: string;
  mono?: boolean;
};

/**
 * Free-form chip input (Enter/comma commits, Backspace on an empty field
 * removes the last chip). The registry Tags component is a select-from-list
 * combobox, so it can't be used for arbitrary contexts/subjects.
 */
export const TagChipInput = ({ value, onChange, placeholder, testId, mono = false }: TagChipInputProps) => {
  const [draft, setDraft] = useState('');

  const commitDraft = () => {
    const additions = draft
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (additions.length === 0) {
      return;
    }

    setDraft('');
    const next = [...value];
    for (const addition of additions) {
      if (!next.includes(addition)) {
        next.push(addition);
      }
    }
    onChange(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter/Backspace during an IME composition belong to the composer, not
    // the chip list.
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft();
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
      {value.map((item) => (
        <TagsValue
          className={cn(mono && 'font-mono')}
          key={item}
          onRemove={() => onChange(value.filter((existing) => existing !== item))}
          testId={`${testId}-chip-${item}`}
        >
          {item}
        </TagsValue>
      ))}
      <input
        className={cn(
          'h-6 min-w-40 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground',
          mono && 'font-mono'
        )}
        data-testid={`${testId}-field`}
        onBlur={commitDraft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        value={draft}
      />
    </div>
  );
};
