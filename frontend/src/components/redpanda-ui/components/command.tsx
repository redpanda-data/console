import { cva, type VariantProps } from 'class-variance-authority';
import { Command as CommandPrimitive } from 'cmdk';
import { SearchIcon } from 'lucide-react';
import React from 'react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';
import { Text } from './typography';
import { cn, type SharedProps } from '../lib/utils';

const commandVariants = cva(
  'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
  {
    variants: {
      variant: {
        elevated: 'border shadow-md',
        minimal: '',
        dialog: '',
      },
      size: {
        sm: 'min-w-[300px] max-w-sm',
        md: 'min-w-[400px] max-w-lg md:min-w-[450px]',
        lg: 'min-w-[500px] max-w-2xl',
        full: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'elevated',
      size: 'md',
    },
  }
);

interface CommandProps
  extends React.ComponentProps<typeof CommandPrimitive>,
    VariantProps<typeof commandVariants>,
    SharedProps {}

function Command({ className, variant, size, testId, ...props }: CommandProps) {
  return (
    <CommandPrimitive
      className={cn(commandVariants({ variant, size }), className)}
      data-slot="command"
      data-testid={testId}
      {...props}
    />
  );
}

function CommandDialog({
  title = 'Command Palette',
  description = 'Search for a command to run...',
  children,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0">
        <Command
          className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          variant="dialog"
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex h-9 items-center gap-2 border-b px-3" data-slot="command-input-wrapper">
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        className={cn(
          'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden selection:bg-selected selection:text-selected-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        data-slot="command-input"
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn('max-h-[300px] scroll-py-1 overflow-y-auto overflow-x-hidden', className)}
      data-slot="command-list"
      {...props}
    />
  );
}

function CommandEmpty({ ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="py-6 text-center text-sm" data-slot="command-empty" {...props} />;
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs',
        className
      )}
      data-slot="command-group"
      {...props}
    />
  );
}

function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      className={cn('-mx-1 h-px bg-border', className)}
      data-slot="command-separator"
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-slot="command-item"
      {...props}
    />
  );
}

function CommandShortcut({ className, children, ...props }: React.ComponentProps<'span'>) {
  return (
    <Text
      as="span"
      className={cn('ml-auto text-muted-foreground text-xs tracking-widest', className)}
      data-slot="command-shortcut"
      {...props}
    >
      {children}
    </Text>
  );
}

// Simplified interface for backend developers
interface SimpleCommandProps extends SharedProps {
  placeholder?: string;
  emptyMessage?: string;
  groups: Array<{
    heading?: string;
    items: Array<{
      icon?: React.ReactNode;
      label: string;
      shortcut?: string;
      disabled?: boolean;
      onSelect?: () => void;
    }>;
  }>;
  size?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

function SimpleCommand({
  placeholder = 'Type a command or search...',
  emptyMessage = 'No results found.',
  groups,
  size = 'md',
  className,
  testId,
}: SimpleCommandProps) {
  return (
    <Command className={className} size={size} testId={testId}>
      <CommandInput placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        {groups.map((group, groupIndex) => (
          <React.Fragment key={group.heading || `group-${groupIndex}`}>
            {groupIndex > 0 && <CommandSeparator />}
            <CommandGroup heading={group.heading}>
              {group.items.map((item) => (
                <CommandItem disabled={item.disabled} key={item.label} onSelect={item.onSelect}>
                  {item.icon}
                  <Text as="span">{item.label}</Text>
                  {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
    </Command>
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
  SimpleCommand,
  commandVariants,
};
