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

import { ElementTooltip } from 'components/misc/element-tooltip';
import { Button } from 'components/redpanda-ui/components/button';
import { HighlightedInput } from 'components/redpanda-ui/components/highlighted-input';
import { Listbox, ListboxGroupLabel, ListboxOption } from 'components/redpanda-ui/components/listbox';
import { cn } from 'components/redpanda-ui/lib/utils';
import { Chip } from 'components/ui/chip';
import { SearchIcon, XIcon } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  buildSuggestions,
  computeGhost,
  type RecentSearch,
  type SuggestionAction,
  type SuggestionItem,
} from './filter-suggestions';
import type { TopicMessage } from '../../../../../state/rest-interfaces';
import type { FilterEntry } from '../../../../../state/ui';
import { TonedIcon } from '../../../shared/toned-icon';
import type { FieldFilterToken } from '../types';
import { formatFilterLine, type LineWord, parseFilterLine, wordRangeAtCaret } from '../utils/filter-line';
import { formatTokenText, sameFieldTokens, tokenEditText } from '../utils/filter-token';

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
  /** Rejects an out-of-range typed `partition:N` word (e.g. `partition:9999` on a 3-partition
   * topic) instead of letting it become a real request. Omit when unknown. */
  partitionCount?: number;
  jsFilters: FilterEntry[];
  onEditJsFilter: (filter: FilterEntry | null, seedCode?: string, seedName?: string) => void;
  onRemoveJsFilter: (id: string) => void;
  canUseJsFilters: boolean;
};

// Shared "this is a filter" text style across the JS chip, the suggestion dropdown's preview
// labels, and (via inheritance from OVERLAY_FONT_CLASS below) the highlighted pills in the
// free-text line — one constant instead of three independent copies, so they can't quietly
// drift the way the JS chip's text already had (13px next to the pills' enforced 14px). Must
// stay `text-sm` to match OVERLAY_FONT_CLASS: the pills get their size by inheriting the
// overlay's own font, not from a class on the pill span itself, so this is the one value that
// keeps all three in lockstep.
const FILTER_BADGE_TEXT_CLASS = 'font-mono text-sm';

type EmittedState = { partitionId: number; fieldTokens: FieldFilterToken[]; quickSearch: string };

/**
 * A piece only counts as genuinely external when it both changed since the previous render AND
 * differs from what the bar itself last emitted — one that's merely still catching up to its own
 * emission is neither (it hasn't changed since last render).
 */
const externalChanges = (incoming: EmittedState, prev: EmittedState, last: EmittedState) => ({
  partitionId: incoming.partitionId !== prev.partitionId && incoming.partitionId !== last.partitionId,
  fieldTokens: !(
    sameFieldTokens(incoming.fieldTokens, prev.fieldTokens) || sameFieldTokens(incoming.fieldTokens, last.fieldTokens)
  ),
  quickSearch: incoming.quickSearch !== prev.quickSearch && incoming.quickSearch !== last.quickSearch,
});

/** Picks, per piece, the external incoming value or a fallback — shared by the "what should
 * `rawText` become" and "what should we now consider last-emitted" resync computations. */
const mergeExternal = (
  external: ReturnType<typeof externalChanges>,
  incoming: EmittedState,
  fallback: { partitionId: number; fieldTokens: FieldFilterToken[]; quickSearch: string }
): EmittedState => ({
  partitionId: external.partitionId ? incoming.partitionId : fallback.partitionId,
  fieldTokens: external.fieldTokens ? incoming.fieldTokens : fallback.fieldTokens,
  quickSearch: external.quickSearch ? incoming.quickSearch : fallback.quickSearch,
});

// The overlay and the real input beneath it must render `rawText` at the exact same width,
// character for character, or the pill highlights drift out from under their text. Monospace
// gives every character (including the space between two adjacent pills) a fixed, generous
// width to work with — on a proportional font a single space is only ~4px, not enough room for
// both a pill's own padding and a visible gap to its neighbor at the same time. Keep this in
// sync with FILTER_BADGE_TEXT_CLASS above — same size, so the pills painted here read as the
// same "filter" language as the JS chip and the suggestion dropdown's labels.
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
//
// Border-only look, matching the JS filter chip (border, no fill) rather than a flat highlight —
// `outline` instead of `border` because outline is a pure paint effect that (like box-shadow)
// never participates in box-model layout, so it needs no width compensation of its own.
const PILL_HIGHLIGHT_CLASS = 'rounded-md px-0.5 py-1 -mx-0.5 outline-1 outline-border/60';

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

type TextRange = Pick<LineWord, 'start' | 'end'>;

/** `text` with `range` replaced by `replacement`. */
const spliceRange = (text: string, range: TextRange, replacement: string) =>
  text.slice(0, range.start) + replacement + text.slice(range.end);

/** Every setter and callback applying a suggestion touches, gathered per application. */
type LineEdit = {
  rawText: string;
  setRawText: (text: string) => void;
  deriveAndEmit: (text: string) => void;
  setOpen: (open: boolean) => void;
  setNavigated: (navigated: boolean) => void;
  setActiveIdx: (index: number) => void;
  setCaretPos: (position: number) => void;
  recordRecent: (recent: RecentSearch) => void;
  onEditJsFilter: FilterBarProps['onEditJsFilter'];
  input: HTMLInputElement | null;
};

/** Replaces the line's text and reports the pieces it now parses into. */
const commitLine = (edit: LineEdit, next: string) => {
  edit.setRawText(next);
  edit.deriveAndEmit(next);
};

/** `open-js`: the word under the caret leaves the line and seeds the JavaScript filter dialog instead. */
const moveWordToJsEditor = (
  edit: LineEdit,
  range: TextRange,
  action: Extract<SuggestionAction, { type: 'open-js' }>
) => {
  commitLine(edit, spliceRange(edit.rawText, range, ''));
  edit.setOpen(false);
  edit.setNavigated(false);
  edit.onEditJsFilter(null, action.code, action.name);
};

/** The line with the suggestion's text spliced over `range`, and the caret position just past it. */
const spliceSuggestion = (rawText: string, action: SuggestionAction, range: TextRange) => {
  const replacement = replacementTextFor(action);
  if (replacement === null) {
    return null;
  }
  // A complete token gets a trailing separator so typing continues naturally into the
  // next term — unless one is already there (e.g. inserting mid-line, before existing text).
  const needsSeparator = action.type === 'commit-field' && rawText[range.end] !== ' ';
  const withSpace = needsSeparator ? `${replacement} ` : replacement;
  return { next: spliceRange(rawText, range, withSpace), caret: range.start + withSpace.length };
};

/** A committed field token becomes a recent search; confirming a full-text search closes the popup. */
const noteAppliedAction = (edit: LineEdit, action: SuggestionAction) => {
  if (action.type === 'commit-field') {
    edit.recordRecent({
      label: formatTokenText({ kind: 'field', field: action.field, op: action.op, value: action.value }),
      action,
    });
  }
  if (action.type === 'fill-text' && action.commit) {
    edit.setOpen(false);
  }
};

const placeCaret = (edit: LineEdit, caret: number) => {
  const el = edit.input;
  el?.focus();
  // caret placement must wait for the controlled value to render
  setTimeout(() => el?.setSelectionRange(caret, caret), 0);
  edit.setCaretPos(caret);
};

const insertSuggestion = (edit: LineEdit, action: SuggestionAction, range: TextRange) => {
  const spliced = spliceSuggestion(edit.rawText, action, range);
  if (spliced === null) {
    return;
  }
  commitLine(edit, spliced.next);
  noteAppliedAction(edit, action);
  edit.setActiveIdx(0);
  edit.setNavigated(false);
  placeCaret(edit, spliced.caret);
};

/**
 * When some piece changed outside the bar: the line to show now and what to treat as last
 * emitted. Null when every piece is unchanged or still catching up to the bar's own emission.
 */
const resyncFromProps = (
  incoming: EmittedState,
  prev: EmittedState,
  last: EmittedState,
  rawText: string,
  partitionCount: number | undefined
): { text: string; emitted: EmittedState } | null => {
  const external = externalChanges(incoming, prev, last);
  if (!(external.partitionId || external.fieldTokens || external.quickSearch)) {
    return null;
  }
  // Only the genuinely external piece(s) get applied; every other piece is re-derived from
  // the text already on screen rather than a possibly-still-catching-up prop.
  const current = parseFilterLine(rawText, { partitionCount });
  const resynced = mergeExternal(external, incoming, {
    partitionId: current.partitionId ?? -1,
    fieldTokens: current.fieldTokens,
    quickSearch: current.remainder,
  });
  return {
    text: formatFilterLine(resynced.partitionId, resynced.fieldTokens, resynced.quickSearch),
    emitted: mergeExternal(external, incoming, last),
  };
};

type FilterLineOptions = Pick<
  FilterBarProps,
  | 'partitionId'
  | 'fieldTokens'
  | 'quickSearch'
  | 'partitionCount'
  | 'onPartitionIdChange'
  | 'onFieldTokensChange'
  | 'onQuickSearchChange'
  | 'jsFilters'
  | 'onRemoveJsFilter'
>;

/**
 * The free-text line (`rawText` + caret) and its two-way sync with the partition, field-token
 * and quick-search props it parses into.
 */
function useFilterLine({
  partitionId,
  fieldTokens,
  quickSearch,
  partitionCount,
  onPartitionIdChange,
  onFieldTokensChange,
  onQuickSearchChange,
  jsFilters,
  onRemoveJsFilter,
}: FilterLineOptions) {
  const [rawText, setRawText] = useState(() => formatFilterLine(partitionId, fieldTokens, quickSearch));
  const [caretPos, setCaretPos] = useState(0);
  // What we last reported upward, so the resync effect below can tell "the
  // parent just echoed what we told it" apart from a genuinely external
  // change (initial mount, Clear all, browser back/forward) — the former
  // must never reformat `rawText` mid-edit, or it'll fight the user's typing.
  const lastEmittedRef = useRef<EmittedState>({ partitionId, fieldTokens, quickSearch });
  // Props as of the previous render, independent of `lastEmittedRef` — lets the effect below
  // tell "this piece hasn't caught up to our own emission yet" apart from "this piece changed."
  // Comparing only against `lastEmittedRef` breaks the moment the three onChange calls echo
  // back as separate renders instead of one atomic update: a piece that simply hasn't arrived
  // yet still differs from `lastEmittedRef` and used to be misread as an external change that
  // then wiped whatever the *other* two pieces held mid-edit.
  const prevPropsRef = useRef<EmittedState>({ partitionId, fieldTokens, quickSearch });

  useEffect(() => {
    const incoming: EmittedState = { partitionId, fieldTokens, quickSearch };
    const resync = resyncFromProps(incoming, prevPropsRef.current, lastEmittedRef.current, rawText, partitionCount);
    prevPropsRef.current = incoming;
    if (resync) {
      lastEmittedRef.current = resync.emitted;
      setRawText(resync.text);
    }
  }, [partitionId, fieldTokens, quickSearch, rawText, partitionCount]);

  const deriveAndEmit = useCallback(
    (text: string) => {
      const parsed = parseFilterLine(text, { partitionCount });
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
    [
      partitionId,
      fieldTokens,
      quickSearch,
      onPartitionIdChange,
      onFieldTokensChange,
      onQuickSearchChange,
      partitionCount,
    ]
  );

  const highlightRanges = useMemo(
    () => parseFilterLine(rawText, { partitionCount }).tokenRanges,
    [rawText, partitionCount]
  );

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

  return { rawText, setRawText, caretPos, setCaretPos, deriveAndEmit, highlightRanges, clearAll };
}

/** The suggestion popup's open state and keyboard cursor; any click outside `containerRef` closes it. */
function useSuggestionDropdown() {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  // Whether the user explicitly moved the active item with ArrowUp/ArrowDown/hover since it
  // was last reset — Enter only auto-applies the top suggestion when they typed something
  // (non-empty query) or explicitly chose it this way; otherwise a stray Enter (e.g. right
  // after committing, when the caret sits past a trailing space with an empty query) would
  // silently apply whatever default suggestion happens to be first.
  const [navigated, setNavigated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return { open, setOpen, activeIdx, setActiveIdx, navigated, setNavigated, containerRef };
}

function useRecentSearches() {
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const recordRecent = useCallback((recent: RecentSearch) => {
    setRecents((prev) => [recent, ...prev.filter((r) => r.label !== recent.label)].slice(0, MAX_RECENTS));
  }, []);
  return { recents, recordRecent };
}

type FilterSuggestionsOptions = Pick<FilterBarProps, 'messages' | 'fieldTokens' | 'partitionId' | 'canUseJsFilters'> & {
  rawText: string;
  caretPos: number;
  recents: RecentSearch[];
};

/** Suggestions and ghost completion for the word under the caret. */
function useFilterSuggestions({
  rawText,
  caretPos,
  messages,
  fieldTokens,
  partitionId,
  canUseJsFilters,
  recents,
}: FilterSuggestionsOptions) {
  const currentWord = useMemo(() => wordRangeAtCaret(rawText, caretPos), [rawText, caretPos]);
  const query = currentWord?.text ?? '';

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

  return { currentWord, query, caretAtEnd: caretPos === rawText.length, heading, items, ghost, actionableItems };
}

type SuggestionActionsOptions = {
  line: ReturnType<typeof useFilterLine>;
  dropdown: ReturnType<typeof useSuggestionDropdown>;
  suggestions: ReturnType<typeof useFilterSuggestions>;
  recordRecent: (recent: RecentSearch) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onEditJsFilter: FilterBarProps['onEditJsFilter'];
};

/** Applying suggestions (click, Enter, Tab) and the input's keyboard handling. */
function useSuggestionActions({
  line,
  dropdown,
  suggestions,
  recordRecent,
  inputRef,
  onEditJsFilter,
}: SuggestionActionsOptions) {
  const { rawText, setRawText, deriveAndEmit, caretPos, setCaretPos } = line;
  const { open, setOpen, activeIdx, setActiveIdx, navigated, setNavigated } = dropdown;
  const { currentWord, query, ghost, caretAtEnd, actionableItems } = suggestions;

  const applySuggestionAt = useCallback(
    (action: SuggestionAction, range: TextRange) => {
      const edit: LineEdit = {
        rawText,
        setRawText,
        deriveAndEmit,
        setOpen,
        setNavigated,
        setActiveIdx,
        setCaretPos,
        recordRecent,
        onEditJsFilter,
        input: inputRef.current,
      };
      if (action.type === 'open-js') {
        moveWordToJsEditor(edit, range, action);
      } else {
        insertSuggestion(edit, action, range);
      }
    },
    [
      rawText,
      deriveAndEmit,
      onEditJsFilter,
      recordRecent,
      setRawText,
      setOpen,
      setNavigated,
      setActiveIdx,
      setCaretPos,
      inputRef,
    ]
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
    [
      actionableItems,
      activeIdx,
      open,
      query,
      navigated,
      applySuggestion,
      ghost,
      caretAtEnd,
      setOpen,
      setNavigated,
      setActiveIdx,
      inputRef,
    ]
  );

  return { applySuggestion, onKeyDown };
}

type SuggestionListProps = {
  id: string;
  heading: string;
  items: SuggestionItem[];
  activeIdx: number;
  onApply: (action: SuggestionAction) => void;
  onHover: (optionIdx: number) => void;
};

const SuggestionList = ({ id, heading, items, activeIdx, onApply, onHover }: SuggestionListProps) => {
  let itemIdx = -1;
  return (
    <Listbox aria-label={heading} className="absolute top-full left-0 z-30 mt-1.5" id={id}>
      <ListboxGroupLabel>{heading}</ListboxGroupLabel>
      {items.map((item, i) => {
        if (item.kind === 'header') {
          return <ListboxGroupLabel key={`h-${item.label}-${i}`}>{item.label}</ListboxGroupLabel>;
        }
        itemIdx += 1;
        const optionIdx = itemIdx;
        const isActive = optionIdx === activeIdx;
        return (
          <ListboxOption
            active={isActive}
            id={`${id}-option-${optionIdx}`}
            key={`${item.label}-${i}`}
            onClick={() => onApply(item.action)}
            onMouseEnter={() => onHover(optionIdx)}
          >
            <span
              className={cn('rounded-md border bg-background px-2 py-0.5 whitespace-nowrap', FILTER_BADGE_TEXT_CLASS)}
            >
              {item.label}
            </span>
            {item.sub && (
              <span className="font-mono text-caption whitespace-nowrap text-muted-foreground">{item.sub}</span>
            )}
          </ListboxOption>
        );
      })}
    </Listbox>
  );
};

export const FilterBar = ({
  messages,
  quickSearch,
  onQuickSearchChange,
  fieldTokens,
  onFieldTokensChange,
  partitionId,
  onPartitionIdChange,
  partitionCount,
  jsFilters,
  onEditJsFilter,
  onRemoveJsFilter,
  canUseJsFilters,
}: FilterBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const line = useFilterLine({
    partitionId,
    fieldTokens,
    quickSearch,
    partitionCount,
    onPartitionIdChange,
    onFieldTokensChange,
    onQuickSearchChange,
    jsFilters,
    onRemoveJsFilter,
  });
  const dropdown = useSuggestionDropdown();
  const { recents, recordRecent } = useRecentSearches();
  const suggestions = useFilterSuggestions({
    rawText: line.rawText,
    caretPos: line.caretPos,
    messages,
    fieldTokens,
    partitionId,
    canUseJsFilters,
    recents,
  });
  const { applySuggestion, onKeyDown } = useSuggestionActions({
    line,
    dropdown,
    suggestions,
    recordRecent,
    inputRef,
    onEditJsFilter,
  });
  const activeOptionId =
    dropdown.open && suggestions.actionableItems[dropdown.activeIdx]
      ? `${listboxId}-option-${dropdown.activeIdx}`
      : undefined;
  const hasChips = jsFilters.length > 0 || fieldTokens.length > 0 || partitionId >= 0 || line.rawText.length > 0;

  return (
    <div className="relative" data-testid="messages-filter-bar" ref={dropdown.containerRef}>
      <div
        className={cn(
          'flex min-h-10 cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background py-1 pr-2 pl-3 shadow-xs',
          dropdown.open && 'border-primary'
        )}
        onClick={() => inputRef.current?.focus()}
        onKeyDown={() => {
          // clicks focus the input; keyboard handling lives on the input itself
        }}
      >
        <TonedIcon className="size-4 shrink-0" icon={SearchIcon} tone="muted" />
        {jsFilters.map((filter) => (
          <Chip
            className={FILTER_BADGE_TEXT_CLASS}
            key={filter.id}
            onEdit={() => onEditJsFilter(filter)}
            onRemove={() => onRemoveJsFilter(filter.id)}
            removeLabel="Remove filter"
            title={filter.name ? `${filter.name}: ${filter.code}` : 'Edit JavaScript filter'}
          >
            ƒ {filter.name || filter.code}
          </Chip>
        ))}
        <HighlightedInput
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-controls={dropdown.open ? listboxId : undefined}
          aria-expanded={dropdown.open}
          className="min-w-24 flex-1"
          ghostText={suggestions.ghost && suggestions.caretAtEnd ? suggestions.ghost.rest : undefined}
          highlightClassName={PILL_HIGHLIGHT_CLASS}
          highlightRanges={line.highlightRanges}
          onChange={(e) => {
            const next = e.target.value;
            line.setRawText(next);
            line.deriveAndEmit(next);
            dropdown.setActiveIdx(0);
            dropdown.setNavigated(false);
            dropdown.setOpen(true);
            line.setCaretPos(e.currentTarget.selectionStart ?? next.length);
          }}
          onFocus={() => dropdown.setOpen(true)}
          onKeyDown={onKeyDown}
          onSelect={(e) => line.setCaretPos(e.currentTarget.selectionStart ?? 0)}
          overlayTestId="messages-filter-highlight-overlay"
          placeholder={jsFilters.length > 0 ? 'Add another filter…' : 'Filter — type or pick a field…'}
          ref={inputRef}
          role="combobox"
          testId="messages-filter-input"
          textClassName={cn('py-1', OVERLAY_FONT_CLASS)}
          value={line.rawText}
        />
        {hasChips && (
          <ElementTooltip content="Clear all filters">
            <Button
              aria-label="Clear all filters"
              className="shrink-0"
              onClick={line.clearAll}
              size="icon-xs"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </ElementTooltip>
        )}
      </div>

      {dropdown.open && suggestions.items.length > 0 && (
        <SuggestionList
          activeIdx={dropdown.activeIdx}
          heading={suggestions.heading}
          id={listboxId}
          items={suggestions.items}
          onApply={applySuggestion}
          onHover={(optionIdx) => {
            dropdown.setActiveIdx(optionIdx);
            dropdown.setNavigated(true);
          }}
        />
      )}
    </div>
  );
};
