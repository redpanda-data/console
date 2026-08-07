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
import { formatFilterLine, type LineWord, parseFilterLine, tokenizeLine, wordRangeAtCaret } from '../utils/filter-line';
import { formatTokenText, parseFilterInput, tokenEditText } from '../utils/filter-token';

const MAX_RECENTS = 4;

export type FilterBarProps = {
  messages: TopicMessage[];
  quickSearch: string;
  onQuickSearchChange: (query: string) => void;
  fieldTokens: FieldFilterToken[];
  onFieldTokensChange: (tokens: FieldFilterToken[]) => void;
  /** Partition selection lives in the URL (`p`); shown here as a `partition:N` word when set. */
  partitionId: number;
  onPartitionIdChange: (partitionId: number) => void;
  jsFilters: FilterEntry[];
  onEditJsFilter: (filter: FilterEntry | null, seedCode?: string, seedName?: string) => void;
  onRemoveJsFilter: (id: string) => void;
  canUseJsFilters: boolean;
};

/** JS predicates are multi-line code edited in a dialog — they can't live inline in the free-text line, so they keep their own small chip. */
const JsChip = ({ filter, onEdit, onRemove }: { filter: FilterEntry; onEdit: () => void; onRemove: () => void }) => (
  <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md border border-border/60 py-0.5 pr-0.5 pl-1.5 font-mono text-[13px] text-foreground/90">
    <button
      className="cursor-pointer rounded-sm px-0.5 hover:text-foreground"
      onClick={onEdit}
      title={filter.name ? `${filter.name}: ${filter.code}` : 'Edit JavaScript filter'}
      type="button"
    >
      ƒ {filter.name || filter.code}
    </button>
    <button
      className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      onClick={onRemove}
      title="Remove filter"
      type="button"
    >
      <XIcon className="size-3" />
    </button>
  </span>
);

type EmittedState = { partitionId: number; fieldTokens: FieldFilterToken[]; quickSearch: string };

const sameFieldTokens = (a: FieldFilterToken[], b: FieldFilterToken[]) =>
  a.length === b.length && a.every((t, i) => formatTokenText(t) === formatTokenText(b[i]));

const sameEmittedState = (a: EmittedState, b: EmittedState) =>
  a.partitionId === b.partitionId && a.quickSearch === b.quickSearch && sameFieldTokens(a.fieldTokens, b.fieldTokens);

// The overlay and the real input beneath it must render `rawText` at the exact same width,
// character for character, or the pill highlights drift out from under their text. Monospace
// gives every character (including the space between two adjacent pills) a fixed, generous
// width to work with — on a proportional font a single space is only ~4px, not enough room for
// both a pill's own padding and a visible gap to its neighbor at the same time.
const OVERLAY_FONT_CLASS = 'font-mono text-sm';

// Padding on the horizontal axis adds to an inline element's layout width, so it's offset by an
// equal negative margin — net effect on the real input's character positions is zero, which is
// what keeps the overlay pixel-aligned. Vertical padding on an inline element paints past the
// line box without affecting line height, so it's free and needs no such compensation.
//
// The horizontal value is capped by actual measurement, not guessing: this font/size renders a
// single space at ~7.4px (measured via getBoundingClientRect on a probe span — see the filter
// bar's design notes), and that one space is the entire budget shared by two adjacent pills. At
// 2px/side, two neighbors consume 4px of it, leaving a ~3.4px visible gap; going past ~3px/side
// (6px total) leaves no gap at all and the pills visually fuse.
const PILL_HIGHLIGHT_CLASS = 'rounded-md bg-muted px-0.5 py-1 -mx-0.5';

/** Ranges of `text` that currently parse as a recognized field/partition token — drives the highlight overlay. */
const highlightRanges = (text: string): { start: number; end: number }[] =>
  tokenizeLine(text)
    .filter((word) => parseFilterInput(word.text) !== null)
    .map((word) => ({ start: word.start, end: word.end }));

/** Text a suggestion/ghost action should splice in at the current word, or `null` for actions handled specially (opening the JS dialog). */
const replacementTextFor = (action: SuggestionAction): string | null => {
  switch (action.type) {
    case 'set-pending':
      return `${action.field}:`;
    case 'commit-field':
      return tokenEditText({ kind: 'field', field: action.field, op: action.op, value: action.value });
    case 'fill-text':
      return action.text;
    case 'open-js':
      return null;
    default:
      return null;
  }
};

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
  const [activeIdx, setActiveIdx] = useState(0);
  // Whether the user explicitly moved the active item with ArrowUp/ArrowDown/hover since it
  // was last reset — Enter only auto-applies the top suggestion when they typed something
  // (non-empty query) or explicitly chose it this way; otherwise a stray Enter (e.g. right
  // after committing, when the caret sits past a trailing space with an empty query) would
  // silently apply whatever default suggestion happens to be first.
  const [navigated, setNavigated] = useState(false);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [rawText, setRawText] = useState(() => formatFilterLine(partitionId, fieldTokens, quickSearch));
  const [caretPos, setCaretPos] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // What we last reported upward, so the resync effect below can tell "the
  // parent just echoed what we told it" apart from a genuinely external
  // change (initial mount, Clear all, browser back/forward) — the former
  // must never reformat `rawText` mid-edit, or it'll fight the user's typing.
  const lastEmittedRef = useRef<EmittedState>({ partitionId, fieldTokens, quickSearch });

  useEffect(() => {
    const incoming: EmittedState = { partitionId, fieldTokens, quickSearch };
    if (!sameEmittedState(incoming, lastEmittedRef.current)) {
      lastEmittedRef.current = incoming;
      setRawText(formatFilterLine(partitionId, fieldTokens, quickSearch));
    }
  }, [partitionId, fieldTokens, quickSearch]);

  const deriveAndEmit = useCallback(
    (text: string) => {
      const parsed = parseFilterLine(text);
      const nextPartitionId = parsed.partitionId ?? -1;
      lastEmittedRef.current = {
        partitionId: nextPartitionId,
        fieldTokens: parsed.fieldTokens,
        quickSearch: parsed.remainder,
      };
      // Only call up when a piece actually changed — typing inside plain text
      // (no field tokens involved) shouldn't fire onPartitionIdChange(-1) etc.
      // on every keystroke just because nothing there changed.
      if (nextPartitionId !== partitionId) {
        onPartitionIdChange(nextPartitionId);
      }
      if (!sameFieldTokens(parsed.fieldTokens, fieldTokens)) {
        onFieldTokensChange(parsed.fieldTokens);
      }
      if (parsed.remainder !== quickSearch) {
        onQuickSearchChange(parsed.remainder);
      }
    },
    [partitionId, fieldTokens, quickSearch, onPartitionIdChange, onFieldTokensChange, onQuickSearchChange]
  );

  const currentWord = useMemo(() => wordRangeAtCaret(rawText, caretPos), [rawText, caretPos]);
  const query = currentWord?.text ?? '';
  const caretAtEnd = caretPos === rawText.length;

  const recordRecent = useCallback((recent: RecentSearch) => {
    setRecents((prev) => [recent, ...prev.filter((r) => r.label !== recent.label)].slice(0, MAX_RECENTS));
  }, []);

  // Never suggest re-adding something that's already an active filter — besides being a
  // pointless suggestion, it's what let a stray Enter re-insert (duplicate) the filter you
  // just typed: right after committing, the caret sits past the trailing space with an empty
  // current word, so the just-recorded recent became the top "active" suggestion.
  const visibleRecents = useMemo(() => {
    const activeLabels = new Set(fieldTokens.map((t) => formatTokenText(t)));
    if (partitionId >= 0) {
      activeLabels.add(`partition:${partitionId}`);
    }
    return recents.filter((r) => !activeLabels.has(r.label));
  }, [recents, fieldTokens, partitionId]);

  const suggestionsInput = useMemo(
    () => ({ query, pendingField: null, messages, recents: visibleRecents, canUseJsFilters }),
    [query, messages, visibleRecents, canUseJsFilters]
  );
  const { heading, items } = useMemo(() => buildSuggestions(suggestionsInput), [suggestionsInput]);
  const ghost = useMemo(() => computeGhost(suggestionsInput), [suggestionsInput]);
  const actionableItems = useMemo(
    () => items.filter((i): i is SuggestionItem & { kind: 'item' } => i.kind === 'item'),
    [items]
  );

  const overlaySegments = useMemo(() => {
    const ranges = highlightRanges(rawText);
    const segments: { text: string; highlighted: boolean }[] = [];
    let cursor = 0;
    for (const range of ranges) {
      if (range.start > cursor) {
        segments.push({ text: rawText.slice(cursor, range.start), highlighted: false });
      }
      segments.push({ text: rawText.slice(range.start, range.end), highlighted: true });
      cursor = range.end;
    }
    if (cursor < rawText.length) {
      segments.push({ text: rawText.slice(cursor), highlighted: false });
    }
    return segments;
  }, [rawText]);

  // Close on outside click
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const applySuggestionAt = useCallback(
    (action: SuggestionAction, range: LineWord | Pick<LineWord, 'start' | 'end'>) => {
      if (action.type === 'open-js') {
        const next = rawText.slice(0, range.start) + rawText.slice(range.end);
        setRawText(next);
        deriveAndEmit(next);
        setOpen(false);
        setNavigated(false);
        onEditJsFilter(null, action.code, action.name);
        return;
      }
      const replacement = replacementTextFor(action);
      if (replacement === null) {
        return;
      }
      // A complete token gets a trailing separator so typing continues naturally into the
      // next term — unless one is already there (e.g. inserting mid-line, before existing text).
      const needsSeparator = action.type === 'commit-field' && rawText[range.end] !== ' ';
      const withSpace = needsSeparator ? `${replacement} ` : replacement;
      const next = rawText.slice(0, range.start) + withSpace + rawText.slice(range.end);
      const caret = range.start + withSpace.length;
      setRawText(next);
      deriveAndEmit(next);
      if (action.type === 'commit-field') {
        recordRecent({
          label: formatTokenText({ kind: 'field', field: action.field, op: action.op, value: action.value }),
          action,
        });
      }
      setActiveIdx(0);
      setNavigated(false);
      const el = inputRef.current;
      el?.focus();
      // caret placement must wait for the controlled value to render
      setTimeout(() => el?.setSelectionRange(caret, caret), 0);
      setCaretPos(caret);
    },
    [rawText, deriveAndEmit, onEditJsFilter, recordRecent]
  );

  const applySuggestion = useCallback(
    (action: SuggestionAction) => {
      const range = currentWord ?? { start: caretPos, end: caretPos };
      applySuggestionAt(action, range);
    },
    [currentWord, caretPos, applySuggestionAt]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setOpen(true);
          setNavigated(true);
          setActiveIdx((i) => Math.min(i + 1, actionableItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setNavigated(true);
          setActiveIdx((i) => Math.max(i - 1, 0));
          break;
        case 'Enter': {
          const active = actionableItems[activeIdx];
          if (open && active && (query || navigated)) {
            e.preventDefault();
            applySuggestion(active.action);
            setNavigated(false);
          } else {
            setOpen(false);
          }
          break;
        }
        case 'Tab':
          if (ghost && caretAtEnd) {
            e.preventDefault();
            applySuggestion(ghost.action);
          }
          break;
        case 'Escape':
          setOpen(false);
          setNavigated(false);
          inputRef.current?.blur();
          break;
        default:
          break;
      }
    },
    [actionableItems, activeIdx, open, query, navigated, applySuggestion, ghost, caretAtEnd]
  );

  const hasChips = jsFilters.length > 0 || fieldTokens.length > 0 || partitionId >= 0 || rawText.length > 0;

  const clearAll = useCallback(() => {
    setRawText('');
    lastEmittedRef.current = { partitionId: -1, fieldTokens: [], quickSearch: '' };
    onFieldTokensChange([]);
    onPartitionIdChange(-1);
    onQuickSearchChange('');
    for (const filter of jsFilters) {
      onRemoveJsFilter(filter.id);
    }
  }, [onFieldTokensChange, onPartitionIdChange, onQuickSearchChange, jsFilters, onRemoveJsFilter]);

  const placeholder = jsFilters.length > 0 ? 'Add another filter…' : 'Filter — type or pick a field…';

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
        {jsFilters.map((filter) => (
          <JsChip
            filter={filter}
            key={filter.id}
            onEdit={() => onEditJsFilter(filter)}
            onRemove={() => onRemoveJsFilter(filter.id)}
          />
        ))}
        <span className="relative min-w-24 flex-1">
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-0 flex items-center whitespace-pre py-1',
              OVERLAY_FONT_CLASS
            )}
            data-testid="messages-filter-highlight-overlay"
          >
            {overlaySegments.map((seg, i) => (
              <span
                className={cn('text-transparent', seg.highlighted && PILL_HIGHLIGHT_CLASS)}
                key={`${i}-${seg.text}`}
              >
                {seg.text}
              </span>
            ))}
            {ghost && caretAtEnd ? <span className="text-muted-foreground/60">{ghost.rest}</span> : null}
          </div>
          <input
            className={cn('relative w-full bg-transparent py-1 outline-none', OVERLAY_FONT_CLASS)}
            data-testid="messages-filter-input"
            onChange={(e) => {
              const next = e.target.value;
              setRawText(next);
              deriveAndEmit(next);
              setActiveIdx(0);
              setNavigated(false);
              setOpen(true);
              setCaretPos(e.currentTarget.selectionStart ?? next.length);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            onSelect={(e) => setCaretPos(e.currentTarget.selectionStart ?? 0)}
            placeholder={placeholder}
            ref={inputRef}
            value={rawText}
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
                onClick={() => applySuggestion(item.action)}
                onMouseEnter={() => {
                  setActiveIdx(itemIdx);
                  setNavigated(true);
                }}
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
        </div>
      )}
    </div>
  );
};
