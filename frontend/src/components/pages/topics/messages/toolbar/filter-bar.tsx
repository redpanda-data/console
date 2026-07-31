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

import { Kbd } from 'components/redpanda-ui/components/kbd';
import { cn } from 'components/redpanda-ui/lib/utils';
import { SearchIcon, XIcon } from 'lucide-react';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  buildSuggestions,
  computeGhost,
  type RecentSearch,
  type SuggestionAction,
  type SuggestionItem,
} from './filter-suggestions';
import type { TopicMessage } from '../../../../../state/rest-interfaces';
import type { FilterEntry } from '../../../../../state/ui';
import type { FieldFilterToken } from '../types';
import { formatTokenText, tokenEditText } from '../utils/filter-token';

const MAX_RECENTS = 4;

export type FilterBarProps = {
  messages: TopicMessage[];
  quickSearch: string;
  onQuickSearchChange: (query: string) => void;
  fieldTokens: FieldFilterToken[];
  onFieldTokensChange: (tokens: FieldFilterToken[]) => void;
  /** Partition selection lives in the URL (`p`); shown here as a removable chip when set. */
  partitionId: number;
  onPartitionIdChange: (partitionId: number) => void;
  jsFilters: FilterEntry[];
  onEditJsFilter: (filter: FilterEntry | null, seedCode?: string) => void;
  onRemoveJsFilter: (id: string) => void;
  canUseJsFilters: boolean;
};

const Chip = ({
  text,
  title,
  onEdit,
  onRemove,
}: {
  text: string;
  title: string;
  onEdit?: () => void;
  onRemove: () => void;
}) => (
  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border bg-muted py-0.5 pr-1 pl-2 text-[13px]">
    <button
      className={cn('rounded-sm px-0.5 font-mono', onEdit && 'cursor-pointer hover:bg-border')}
      onClick={onEdit}
      title={title}
      type="button"
    >
      {text}
    </button>
    <button
      className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-border hover:text-foreground"
      onClick={onRemove}
      title="Remove filter"
      type="button"
    >
      <XIcon className="size-3" />
    </button>
  </span>
);

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: single interactive control combining chips, ghost completion and keyboard navigation
export const FilterBar = ({
  messages,
  quickSearch,
  onQuickSearchChange,
  fieldTokens,
  onFieldTokensChange,
  partitionId,
  onPartitionIdChange,
  jsFilters,
  onEditJsFilter,
  onRemoveJsFilter,
  canUseJsFilters,
}: FilterBarProps) => {
  const [open, setOpen] = useState(false);
  const [pendingField, setPendingField] = useState<string | null>(null);
  const [pendingValue, setPendingValue] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // While a chip is unwrapped for textual editing, remembers its position in
  // fieldTokens so recommitting puts it back in place instead of appending.
  const editSlotRef = useRef<number | null>(null);

  const query = pendingField ? pendingValue : quickSearch;

  const suggestionsInput = useMemo(
    () => ({ query, pendingField, messages, recents, canUseJsFilters }),
    [query, pendingField, messages, recents, canUseJsFilters]
  );
  const { heading, items } = useMemo(() => buildSuggestions(suggestionsInput), [suggestionsInput]);
  const ghost = useMemo(() => computeGhost(suggestionsInput), [suggestionsInput]);
  const actionableItems = useMemo(
    () => items.filter((i): i is SuggestionItem & { kind: 'item' } => i.kind === 'item'),
    [items]
  );

  // Close on outside click
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPendingField(null);
        setPendingValue('');
        editSlotRef.current = null;
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const recordRecent = useCallback((recent: RecentSearch) => {
    setRecents((prev) => [recent, ...prev.filter((r) => r.label !== recent.label)].slice(0, MAX_RECENTS));
  }, []);

  // Unwrap a committed badge back into plain text in the input, caret at the
  // end, so it can be edited textually and recommitted with Enter.
  const editChipAsText = useCallback(
    (text: string) => {
      onQuickSearchChange(text);
      setOpen(true);
      const el = inputRef.current;
      el?.focus();
      // caret placement must wait for the controlled value to render
      setTimeout(() => el?.setSelectionRange(text.length, text.length), 0);
    },
    [onQuickSearchChange]
  );

  const applyAction = useCallback(
    (action: SuggestionAction) => {
      switch (action.type) {
        case 'set-pending':
          setPendingField(action.field);
          setPendingValue('');
          setActiveIdx(0);
          inputRef.current?.focus();
          break;
        case 'commit-field': {
          if (action.field === 'partition') {
            onPartitionIdChange(Number(action.value));
          } else {
            const token = { kind: 'field', field: action.field, op: action.op, value: action.value } as const;
            const next = [...fieldTokens];
            const slot = editSlotRef.current;
            next.splice(slot !== null && slot >= 0 && slot <= next.length ? slot : next.length, 0, token);
            onFieldTokensChange(next);
          }
          editSlotRef.current = null;
          recordRecent({ label: formatTokenText({ kind: 'field', ...action }), action });
          setPendingField(null);
          setPendingValue('');
          onQuickSearchChange('');
          setActiveIdx(0);
          // keep typing where the badge just landed — the input sits right after it
          inputRef.current?.focus();
          break;
        }
        case 'fill-text':
          setPendingField(null);
          setPendingValue('');
          editChipAsText(action.text);
          break;
        case 'open-js':
          setOpen(false);
          setPendingField(null);
          setPendingValue('');
          onQuickSearchChange('');
          onEditJsFilter(null, action.code);
          break;
        default:
          break;
      }
    },
    [
      fieldTokens,
      onFieldTokensChange,
      onPartitionIdChange,
      onQuickSearchChange,
      onEditJsFilter,
      recordRecent,
      editChipAsText,
    ]
  );

  // One ordered model for every badge — rendering and keyboard editing share it.
  const chipDescriptors = useMemo(() => {
    const chips: { key: string; text: string; title: string; edit?: () => void; remove: () => void }[] = [];
    if (partitionId >= 0) {
      chips.push({
        key: 'partition',
        text: `partition:${partitionId}`,
        title: 'Click to edit the partition filter',
        edit: () => {
          editSlotRef.current = null;
          onPartitionIdChange(-1);
          editChipAsText(`partition:${partitionId}`);
        },
        remove: () => onPartitionIdChange(-1),
      });
    }
    fieldTokens.forEach((token, i) => {
      chips.push({
        key: `field-${formatTokenText(token)}`,
        text: formatTokenText(token),
        title: 'Click to edit this filter',
        edit: () => {
          editSlotRef.current = i;
          onFieldTokensChange(fieldTokens.filter((_, idx) => idx !== i));
          editChipAsText(tokenEditText(token));
        },
        remove: () => onFieldTokensChange(fieldTokens.filter((_, idx) => idx !== i)),
      });
    });
    for (const filter of jsFilters) {
      chips.push({
        key: `js-${filter.id}`,
        text: `ƒ ${filter.name || filter.code}`,
        title: filter.name ? `${filter.name}: ${filter.code}` : 'Edit JavaScript filter',
        edit: () => onEditJsFilter(filter),
        remove: () => onRemoveJsFilter(filter.id),
      });
    }
    return chips;
  }, [
    partitionId,
    onPartitionIdChange,
    editChipAsText,
    fieldTokens,
    onFieldTokensChange,
    jsFilters,
    onEditJsFilter,
    onRemoveJsFilter,
  ]);

  const removeLastChip = useCallback(() => {
    if (fieldTokens.length > 0) {
      onFieldTokensChange(fieldTokens.slice(0, -1));
      return;
    }
    const lastJs = jsFilters.at(-1);
    if (lastJs) {
      onRemoveJsFilter(lastJs.id);
      return;
    }
    if (partitionId >= 0) {
      onPartitionIdChange(-1);
    }
  }, [fieldTokens, onFieldTokensChange, jsFilters, onRemoveJsFilter, partitionId, onPartitionIdChange]);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one keyboard state machine for suggestions + chip cursor
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const caretAtStart = e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0;

      switch (e.key) {
        case 'ArrowLeft': {
          // ArrowLeft on an empty input walks back into the last badge: it
          // unwraps into editable text so the value can be changed in place.
          const last = chipDescriptors.at(-1);
          if (caretAtStart && !pendingField && query.length === 0 && last?.edit) {
            e.preventDefault();
            last.edit();
          }
          break;
        }
        case 'ArrowDown':
          e.preventDefault();
          setOpen(true);
          setActiveIdx((i) => Math.min(i + 1, actionableItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIdx((i) => Math.max(i - 1, 0));
          break;
        case 'Enter': {
          const active = actionableItems[activeIdx];
          if (open && active) {
            e.preventDefault();
            applyAction(active.action);
          } else {
            setOpen(false);
          }
          break;
        }
        case 'Tab':
          if (ghost) {
            e.preventDefault();
            applyAction(ghost.action);
          }
          break;
        case 'Backspace':
          if (query.length === 0) {
            e.preventDefault();
            if (pendingField) {
              setPendingField(null);
            } else {
              removeLastChip();
            }
          }
          break;
        case 'Escape':
          setOpen(false);
          setPendingField(null);
          setPendingValue('');
          editSlotRef.current = null;
          inputRef.current?.blur();
          break;
        default:
          break;
      }
    },
    [actionableItems, activeIdx, open, applyAction, ghost, query, pendingField, removeLastChip, chipDescriptors]
  );

  const hasChips = fieldTokens.length > 0 || jsFilters.length > 0 || partitionId >= 0;

  const clearAll = useCallback(() => {
    onFieldTokensChange([]);
    for (const filter of jsFilters) {
      onRemoveJsFilter(filter.id);
    }
    onPartitionIdChange(-1);
    onQuickSearchChange('');
  }, [onFieldTokensChange, jsFilters, onRemoveJsFilter, onPartitionIdChange, onQuickSearchChange]);

  const placeholder = pendingField
    ? `Select or type ${pendingField}…`
    : hasChips
      ? 'Add another filter…'
      : 'Filter — type or pick a field…';

  let itemIdx = -1;

  return (
    <div className="relative" data-testid="messages-filter-bar" ref={containerRef}>
      <div
        className={cn(
          'flex min-h-10 cursor-text flex-wrap items-center gap-1.5 rounded-lg border bg-background py-1 pr-2 pl-3 shadow-xs',
          open && 'border-primary'
        )}
        onClick={() => inputRef.current?.focus()}
        onKeyDown={() => {
          // clicks focus the input; keyboard handling lives on the input itself
        }}
      >
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        {chipDescriptors.map((chip) => (
          <Chip key={chip.key} onEdit={chip.edit} onRemove={chip.remove} text={chip.text} title={chip.title} />
        ))}
        {pendingField && (
          <span className="flex shrink-0 items-center gap-1 rounded-md border border-primary bg-muted py-0.5 pr-1 pl-2 font-mono text-[13px]">
            {pendingField}:
            <button
              className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-border"
              onClick={() => setPendingField(null)}
              title="Cancel"
              type="button"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        )}
        <span className="relative min-w-24 flex-1">
          {ghost && (
            <span className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre py-1 text-sm">
              <span className="invisible">{query}</span>
              <span className="text-muted-foreground/60">{ghost.rest}</span>
            </span>
          )}
          <input
            className="relative w-full bg-transparent py-1 text-sm outline-none"
            data-testid="messages-filter-input"
            onChange={(e) => {
              if (pendingField) {
                setPendingValue(e.target.value);
              } else {
                onQuickSearchChange(e.target.value);
              }
              setActiveIdx(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            ref={inputRef}
            value={query}
          />
        </span>
        {hasChips && (
          <button
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            onClick={clearAll}
            title="Clear all filters"
            type="button"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>

      {open && items.length > 0 && (
        <div className="absolute top-full left-0 z-30 mt-1.5 max-h-[340px] w-[380px] overflow-auto rounded-lg border bg-popover p-1.5 shadow-lg">
          <div className="px-2.5 pt-1.5 pb-1 font-semibold text-[10.5px] text-muted-foreground uppercase tracking-wider">
            {heading}
          </div>
          {items.map((item, i) => {
            if (item.kind === 'header') {
              return (
                <div
                  className="px-2.5 pt-2 pb-1 font-semibold text-[10.5px] text-muted-foreground uppercase tracking-wider"
                  key={`h-${item.label}-${i}`}
                >
                  {item.label}
                </div>
              );
            }
            itemIdx += 1;
            const isActive = itemIdx === activeIdx;
            return (
              <button
                className={cn(
                  'flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left',
                  isActive ? 'bg-accent' : 'hover:bg-accent/60'
                )}
                key={`${item.label}-${i}`}
                onClick={() => applyAction(item.action)}
                onMouseEnter={() => setActiveIdx(itemIdx)}
                type="button"
              >
                <span className="whitespace-nowrap rounded-md border bg-background px-2 py-0.5 font-mono text-[13px]">
                  {item.label}
                </span>
                {item.sub && (
                  <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">{item.sub}</span>
                )}
              </button>
            );
          })}
          <div className="mt-1 flex items-center gap-3 border-t px-2.5 pt-2 pb-1 text-[11px] text-muted-foreground">
            <span>
              <Kbd>↑↓</Kbd> navigate
            </span>
            <span>
              <Kbd>↵</Kbd> select
            </span>
            <span>
              <Kbd>←</Kbd> edit last
            </span>
            <span>
              <Kbd>⌫</Kbd> remove last
            </span>
            <span className="ml-auto">
              <Kbd>esc</Kbd> close
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
