import { forwardRef, useMemo } from 'react';
import type React from 'react';

import { cn, type SharedProps } from '../lib/utils';

export type HighlightRange = { start: number; end: number };

export type HighlightedInputProps = Omit<React.ComponentProps<'input'>, 'className'> &
  SharedProps & {
    /** Wrapper span className — controls the whole control's position/sizing (e.g. `flex-1`, `min-w-24`). */
    className?: string;
    /**
     * Applied identically to the invisible overlay text and the real input. Must stay in sync
     * between the two — any mismatch (font, size, padding) desyncs the highlight from the text
     * it's supposed to sit behind.
     */
    textClassName?: string;
    /** Character ranges within `value` to paint a highlight behind — purely visual, no effect on editing. */
    highlightRanges?: readonly HighlightRange[];
    /** className applied to each highlighted range's span (e.g. a pill's outline/radius/background). */
    highlightClassName?: string;
    /** Greyed-out inline completion preview rendered after the visible text (e.g. only when the caret is at the end). */
    ghostText?: string;
    /** data-testid for the invisible overlay layer, for tests that need to assert on painted segments. */
    overlayTestId?: string;
  };

const buildSegments = (text: string, ranges: readonly HighlightRange[]) => {
  const segments: { text: string; highlighted: boolean }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), highlighted: false });
    }
    segments.push({ text: text.slice(range.start, range.end), highlighted: true });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false });
  }
  return segments;
};

/**
 * A text input with purely visual, non-interactive highlights painted behind arbitrary character
 * ranges — e.g. recognized `field:value` words in a free-text filter/search bar. The caret and all
 * editing behavior stay 100% native; highlighting never adds or removes anything from the DOM the
 * user is typing into. Implemented as an absolutely-positioned transparent-text overlay behind a
 * real `<input>` — later DOM order wins the paint order for same-level positioned elements, so the
 * input's own glyphs paint over the overlay.
 */
const HighlightedInput = forwardRef<HTMLInputElement, HighlightedInputProps>(
  (
    { className, textClassName, highlightRanges = [], highlightClassName, ghostText, overlayTestId, testId, value, ...props },
    ref
  ) => {
    const text = typeof value === 'string' ? value : '';
    const segments = useMemo(() => buildSegments(text, highlightRanges), [text, highlightRanges]);

    return (
      <span className={cn('relative', className)} data-slot="highlighted-input">
        <div
          aria-hidden="true"
          className={cn('pointer-events-none absolute inset-0 flex items-center whitespace-pre', textClassName)}
          data-testid={overlayTestId}
        >
          {segments.map((seg, i) => (
            <span className={cn('text-transparent', seg.highlighted && highlightClassName)} key={`${i}-${seg.text}`}>
              {seg.text}
            </span>
          ))}
          {ghostText ? <span className="text-muted-foreground/60">{ghostText}</span> : null}
        </div>
        <input
          className={cn('relative w-full bg-transparent outline-none', textClassName)}
          data-testid={testId}
          ref={ref}
          value={value}
          {...props}
        />
      </span>
    );
  }
);

HighlightedInput.displayName = 'HighlightedInput';

export { HighlightedInput };
