import type React from 'react';

import { cn, type SharedProps } from '../lib/utils';

/**
 * A purely presentational dropdown listbox shell: a positioned panel, an optional group label, and
 * option rows with an active/hover state. Unlike `Command`, it owns no state of its own — no
 * internal input, filtering, or keyboard navigation — so a caller that already drives its own
 * active-index/keyboard handling (e.g. a custom-controlled autocomplete input) can render into it
 * without fighting a second, conflicting source of truth.
 */
function Listbox({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    <div
      className={cn('max-h-[340px] w-[380px] overflow-auto rounded-lg border bg-popover p-1.5 shadow-lg', className)}
      data-slot="listbox"
      data-testid={testId}
      {...props}
    />
  );
}

function ListboxGroupLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('px-2.5 pt-1.5 pb-1 font-semibold text-caption text-muted-foreground uppercase tracking-wider', className)}
      data-slot="listbox-group-label"
      {...props}
    />
  );
}

type ListboxOptionProps = React.ComponentProps<'button'> & {
  /** Whether this row is the current keyboard/hover-active selection. */
  active?: boolean;
};

function ListboxOption({ className, active, type = 'button', ...props }: ListboxOptionProps) {
  return (
    <button
      className={cn(
        'flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left',
        active ? 'bg-accent' : 'hover:bg-accent/60',
        className
      )}
      data-active={active}
      data-slot="listbox-option"
      type={type}
      {...props}
    />
  );
}

export { Listbox, ListboxGroupLabel, ListboxOption };
