import * as Command from '@ui-sdk/react/command';
import type React from 'react';

import { cn, type SharedProps } from '../lib/utils';

// The owning autocomplete controls the active value and keeps focus in its input.
// SDK Command owns option actions, including agent run(), without a second search input.
function Listbox({
  className,
  testId,
  id,
  children,
  value,
  ...props
}: Omit<React.ComponentProps<typeof Command.Command>, 'children'> & SharedProps & { children?: React.ReactNode }) {
  return (
    <Command.Command value={value} filter={false} {...props}>
      <Command.CommandList
        render={(listProps) => <div {...listProps} id={id ?? listProps.id} />}
        className={cn('max-h-[340px] w-[380px] overflow-auto rounded-lg border bg-popover p-1.5 shadow-lg', className)}
        data-testid={testId}
      >
        {children}
      </Command.CommandList>
    </Command.Command>
  );
}
function ListboxGroupLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="presentation"
      className={cn(
        'px-2.5 pt-1.5 pb-1 font-semibold text-caption text-muted-foreground uppercase tracking-wider',
        className
      )}
      {...props}
    />
  );
}
type ListboxOptionProps = Omit<React.ComponentProps<typeof Command.CommandItem>, 'children'> & {
  active?: boolean;
  children?: React.ReactNode;
};
function ListboxOption({ className, active, id, ...props }: ListboxOptionProps) {
  return (
    <Command.CommandItem
      className={cn(
        'flex w-full cursor-pointer items-baseline gap-2 rounded-md px-1.5 py-1 text-left',
        active ? 'bg-accent' : 'hover:bg-accent/60',
        className
      )}
      render={(itemProps) => <div {...itemProps} id={id ?? itemProps.id} />}
      data-active={active}
      {...props}
    />
  );
}
export { Listbox, ListboxGroupLabel, ListboxOption };
