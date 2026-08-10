import { XIcon } from 'lucide-react';
import type React from 'react';

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
        <button className="cursor-pointer rounded-sm px-0.5 hover:text-foreground" onClick={onEdit} title={title} type="button">
          {children}
        </button>
      ) : (
        <span className="px-0.5" title={title}>
          {children}
        </span>
      )}
      {onRemove ? (
        <button
          className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={onRemove}
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
