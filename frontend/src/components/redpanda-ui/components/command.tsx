'use client';

import * as CommandPrimitive from '@ui-sdk/react/command';
import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronRight, SearchIcon } from 'lucide-react';
import React from 'react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';
import { Popover, PopoverAnchor, PopoverContent } from './popover';
import { cn, type FixedPositionContentProps, type SharedProps } from '../lib/utils';

const commandVariants = cva(
  'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
  {
    variants: {
      variant: {
        elevated: 'border !border-input shadow-md',
        minimal: '',
        dialog: '',
      },
      size: {
        sm: 'max-w-sm min-w-[300px]',
        md: 'max-w-lg min-w-[400px] md:min-w-[450px]',
        lg: 'max-w-2xl min-w-[500px]',
        full: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'elevated',
      // Width-less by default so embedded popovers size to their container (like stock shadcn).
      size: 'full',
    },
  }
);

interface CommandProps
  extends Omit<React.ComponentProps<typeof CommandPrimitive.Command>, 'filter' | 'children'>,
    VariantProps<typeof commandVariants>,
    SharedProps {
  children?: React.ReactNode;
  filter?: (value: string, search: string, keywords?: string[]) => number;
  shouldFilter?: boolean;
}

const CommandQueryContext = React.createContext<{
  setQuery: (query: string) => void;
  inputChange: React.RefObject<((query: string) => void) | undefined>;
} | null>(null);
function Command({
  className,
  variant,
  size,
  testId,
  filter,
  shouldFilter = true,
  query,
  defaultQuery = '',
  onQueryChange,
  ...props
}: CommandProps) {
  const [inputQuery, setQuery] = React.useState(defaultQuery);
  const inputChange = React.useRef<((query: string) => void) | undefined>(undefined);
  return (
    <CommandQueryContext.Provider value={React.useMemo(() => ({ setQuery, inputChange }), [])}>
      <CommandPrimitive.Command
        {...props}
        className={cn(commandVariants({ variant, size }), className)}
        data-testid={testId}
        filter={shouldFilter ? (filter ? (item, search) => filter(item.value, search, item.keywords) : 'fuzzy') : false}
        onQueryChange={(next, details) => {
          onQueryChange?.(next, details);
          if (!details.canceled) {
            setQuery(next);
            inputChange.current?.(next);
          }
        }}
        query={query ?? inputQuery}
      />
    </CommandQueryContext.Provider>
  );
}

/** The dialog's own sizing of Command's parts: taller input and rows than an inline `Command`. */
const COMMAND_DIALOG_CHROME =
  '**:data-[slot=command-input-wrapper]:h-12 [&_[data-slot=command-group-label]]:px-2 [&_[data-slot=command-group-label]]:font-medium [&_[data-slot=command-group-label]]:text-subtle [&_[data-slot=command-group]:not([hidden])_~[data-slot=command-group]]:pt-0 [&_[data-slot=command-group]]:px-2 [&_[data-slot=command-input-wrapper]_svg]:h-5 [&_[data-slot=command-input-wrapper]_svg]:w-5 [&_[data-slot=command-input]]:h-12 [&_[data-slot=command-item]]:px-2 [&_[data-slot=command-item]]:py-3 [&_[data-slot=command-item]_svg]:h-5 [&_[data-slot=command-item]_svg]:w-5';

function CommandDialog({
  title = 'Command Palette',
  description = 'Search for a command to run...',
  children,
  showOverlay = true,
  // shadcn defaults this to false; we keep true to preserve existing rendering.
  showCloseButton = true,
  container,
  className,
  commandProps,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, 'children'> &
  Pick<FixedPositionContentProps, 'showOverlay' | 'container'> & {
    title?: string;
    description?: string;
    className?: string;
    showCloseButton?: boolean;
    children?: React.ReactNode;
    /** Passed to the inner `Command` (`filter`, `loop`, `shouldFilter`…). `className` merges with the dialog's. */
    commandProps?: Omit<React.ComponentProps<typeof Command>, 'children'>;
  }) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn('overflow-hidden p-0', container && 'absolute', className)}
        container={container}
        showCloseButton={showCloseButton}
        showOverlay={showOverlay}
      >
        <Command
          size="md"
          variant="dialog"
          {...commandProps}
          className={cn(COMMAND_DIALOG_CHROME, commandProps?.className)}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

type CommandInputProps = React.ComponentProps<typeof CommandPrimitive.CommandInput> &
  SharedProps & { onValueChange?: (value: string) => void };
function CommandInput({ className, testId, value, onValueChange, ...props }: CommandInputProps) {
  const context = React.useContext(CommandQueryContext);
  const setQuery = context?.setQuery;
  const inputChange = context?.inputChange;
  React.useLayoutEffect(() => {
    if (value !== undefined) {
      setQuery?.(String(value));
    }
  }, [setQuery, value]);
  React.useLayoutEffect(() => {
    if (inputChange) {
      inputChange.current = onValueChange;
    }
    return () => {
      if (inputChange) {
        inputChange.current = undefined;
      }
    };
  }, [inputChange, onValueChange]);
  return (
    <div className="flex h-9 items-center gap-2 border-b border-input px-3" data-slot="command-input-wrapper">
      <SearchIcon aria-hidden="true" className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.CommandInput
        aria-label={props['aria-label'] ?? props.placeholder ?? 'Search commands'}
        className={cn(
          'h-full w-full bg-transparent text-body outline-none placeholder:text-placeholder disabled:opacity-50',
          className
        )}
        data-testid={testId}
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.CommandList>) {
  return (
    <CommandPrimitive.CommandList
      className={cn('max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto', className)}
      data-slot="command-list"
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  testId,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.CommandEmpty> & SharedProps) {
  return (
    <CommandPrimitive.CommandEmpty
      className={cn('py-6 text-center text-body', className)}
      data-slot="command-empty"
      data-testid={testId}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  heading,
  children,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof CommandPrimitive.CommandGroup>, 'children'> &
  SharedProps & { heading?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <CommandPrimitive.CommandGroup
      className={cn('overflow-hidden p-1 text-foreground', className)}
      data-testid={testId}
      {...props}
    >
      {heading ? (
        <CommandPrimitive.CommandGroupLabel className="px-2 py-1.5 text-body-sm font-medium text-subtle">
          {heading}
        </CommandPrimitive.CommandGroupLabel>
      ) : null}
      {children}
    </CommandPrimitive.CommandGroup>
  );
}

function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.CommandSeparator>) {
  return (
    <CommandPrimitive.CommandSeparator
      className={cn('-mx-1 h-px bg-border', className)}
      data-slot="command-separator"
      {...props}
    />
  );
}

type CommandItemProps = Omit<React.ComponentProps<typeof CommandPrimitive.CommandItem>, 'onSelect' | 'children'> &
  SharedProps & { children?: React.ReactNode; onSelect?: (value: string) => unknown };
function CommandItem({ className, testId, children, value, onSelect, ...props }: CommandItemProps) {
  const generatedId = React.useId();
  const itemValue = value ?? (typeof children === 'string' ? children : generatedId);
  return (
    <CommandPrimitive.CommandItem
      className={cn(
        'relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-body outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        className
      )}
      data-testid={testId}
      onSelect={() => onSelect?.(itemValue)}
      value={itemValue}
      {...props}
    >
      {children}
    </CommandPrimitive.CommandItem>
  );
}

function CommandShortcut({ className, children, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('ml-auto text-body-sm tracking-widest text-subtle', className)}
      data-slot="command-shortcut"
      {...props}
    >
      {children}
    </span>
  );
}

interface CommandSubContextType {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const CommandSubContext = React.createContext<CommandSubContextType | undefined>(undefined);

interface CommandSubProps {
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function CommandSub({ open, onOpenChange, children }: CommandSubProps) {
  return (
    <CommandSubContext.Provider value={React.useMemo(() => ({ open, onOpenChange }), [open, onOpenChange])}>
      <Popover onOpenChange={onOpenChange} open={open}>
        {children}
      </Popover>
    </CommandSubContext.Provider>
  );
}

interface CommandSubTriggerProps extends CommandItemProps {
  inset?: boolean;
}

function CommandSubTrigger({ className, children, inset, ...props }: CommandSubTriggerProps) {
  const ctx = React.useContext(CommandSubContext);

  return (
    <PopoverAnchor
      render={
        <CommandItem
          className={cn(
            "relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-body outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
            inset && 'pl-8',
            className
          )}
          data-slot="command-sub-trigger"
          onSelect={() => ctx?.onOpenChange(true)}
          {...props}
        >
          {children}
          <ChevronRight className="ml-auto size-4" />
        </CommandItem>
      }
    />
  );
}

interface CommandSubContentProps {
  children: React.ReactNode;
  className?: string;
}

function CommandSubContent({ className, children }: CommandSubContentProps) {
  return (
    <PopoverContent align="start" className={cn('w-fit p-0', className)} side="right" sideOffset={4}>
      {children}
    </PopoverContent>
  );
}

interface SimpleCommandProps extends SharedProps {
  className?: string;
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
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
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
                  <span className="text-body">{item.label}</span>
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
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  CommandSub,
  CommandSubContent,
  CommandSubTrigger,
  commandVariants,
  SimpleCommand,
};
