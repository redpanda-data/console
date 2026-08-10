import { XIcon } from 'lucide-react';
import type React from 'react';
import type { MouseEventHandler } from 'react';

import { cn, type SharedProps } from '../lib/utils';

export type ChipProps = React.ComponentProps<'span'> &
  SharedProps & {
    /** Clicking the label triggers this — e.g. unwrap the chip back into editable text. Label renders as plain text when omitted. */
    onEdit?: () => void;
    /** Shows a small ✕ button that triggers this. Omit for a non-removable chip. */
    onRemove?: () => void;
    /** Tooltip for the ✕ button. */
    removeLabel?: string;
  };

/**
 * A small bordered pill for a single removable/editable value — a committed filter, a selected
 * tag, anything that reads as "one item you chose, and can undo." Domain-agnostic: the caller
 * supplies the label content and decides what editing or removing actually means.
 */
function Chip({ className, children, title, onEdit, onRemove, removeLabel = 'Remove', testId, ...props }: ChipProps) {
  // Chips commonly sit inside a clickable row/container (e.g. a filter bar that focuses its
  // input on container click) — without stopping propagation, clicking edit/remove also
  // triggers whatever the ancestor's own click handler does.
  const handleEdit: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onEdit?.();
  };
  const handleRemove: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onRemove?.();
  };

  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md border border-border/60 py-0.5 pr-0.5 pl-1.5 text-foreground/90',
        className
      )}
      data-slot="chip"
      data-testid={testId}
      {...props}
    >
      {onEdit ? (
        <button
          aria-label={title}
          className="cursor-pointer rounded-sm px-0.5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onClick={handleEdit}
          title={title}
          type="button"
        >
          {children}
        </button>
      ) : (
        <span className="px-0.5" title={title}>
          {children}
        </span>
      )}
      {onRemove ? (
        <button
          aria-label={removeLabel}
          className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
          onClick={handleRemove}
          title={removeLabel}
          type="button"
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

Chip.displayName = 'Chip';

export { Chip };
