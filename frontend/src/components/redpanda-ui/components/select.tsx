'use client';

import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import React from 'react';

import { useGroup } from './group';
import { usePortalContainer } from '../lib/use-portal-container';
import { narrowOpenChange, renderWithDataState } from '../lib/base-ui-compat';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';

type SelectRootProps = Omit<React.ComponentProps<typeof SelectPrimitive.Root>, 'onOpenChange' | 'onValueChange'> &
  SharedProps & {
    onOpenChange?: (open: boolean) => void;
    onValueChange?: (value: string) => void;
  };

/**
 * Adapts the consumer's Radix-style `(value: string) => void` callback to Base
 * UI's `(value: unknown, details) => void` signature. Base UI types value as
 * `unknown` because `Select.Root` is generic; this wrapper trusts the string
 * narrowing since the registry's Select API fixes the item value type to
 * string (the compat helper `narrowCallback<string, …>` can't cross the
 * `unknown` contravariance gap without a local adapter).
 */
function adaptSelectValueChange(
  handler: ((value: string) => void) | undefined
): ((value: unknown) => void) | undefined {
  if (!handler) {
    return;
  }
  return (value) => {
    handler(value as string);
  };
}

function Select({ testId, onOpenChange, onValueChange, ...props }: SelectRootProps) {
  return (
    <SelectPrimitive.Root
      data-slot="select"
      data-testid={testId}
      onOpenChange={narrowOpenChange(onOpenChange)}
      onValueChange={adaptSelectValueChange(onValueChange)}
      {...props}
    />
  );
}

Select.displayName = 'Select';

function SelectGroup({ testId, ...props }: React.ComponentProps<typeof SelectPrimitive.Group> & SharedProps) {
  return <SelectPrimitive.Group data-slot="select-group" data-testid={testId} {...props} />;
}

SelectGroup.displayName = 'SelectGroup';

type SelectValueProps = Omit<React.ComponentProps<typeof SelectPrimitive.Value>, 'children'> & {
  placeholder?: React.ReactNode;
  children?: React.ReactNode | ((value: unknown) => React.ReactNode);
};

function SelectValue({ placeholder, children, ...props }: SelectValueProps) {
  return (
    <SelectPrimitive.Value data-slot="select-value" {...props}>
      {(value: unknown) => {
        if (typeof children === 'function') {
          return (children as (value: unknown) => React.ReactNode)(value);
        }
        if (children !== undefined) {
          return children;
        }
        const isEmpty = value === undefined || value === null || value === '';
        if (isEmpty) {
          return placeholder ?? null;
        }
        return value as React.ReactNode;
      }}
    </SelectPrimitive.Value>
  );
}

SelectValue.displayName = 'SelectValue';

const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentProps<typeof SelectPrimitive.Trigger> &
    SharedProps & {
      size?: 'sm' | 'default' | 'lg';
    }
>(({ className, size = 'default', children, testId, ...props }, ref) => {
  const { position: groupPosition, attached } = useGroup();

  let positionClasses = 'rounded-md';
  if (attached && groupPosition === 'first') {
    positionClasses = 'rounded-r-none rounded-l-md border-r-0';
  } else if (attached && groupPosition === 'last') {
    positionClasses = 'rounded-r-md rounded-l-none border-l-0';
  } else if (attached && groupPosition === 'middle') {
    positionClasses = 'rounded-none border-r-0 border-l-0';
  }

  return (
    <SelectPrimitive.Trigger
      className={cn(
        "!border-input flex w-full cursor-pointer items-center justify-between gap-2 whitespace-nowrap border bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[size=default]:h-9 data-[size=lg]:h-10 data-[size=sm]:h-8 data-[placeholder]:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:hover:bg-input/50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
        positionClasses,
        className
      )}
      data-size={size}
      data-slot="select-trigger"
      data-testid={testId}
      ref={ref}
      render={renderWithDataState('button')}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <span>
            <ChevronDownIcon className="size-4 opacity-50" />
          </span>
        }
      />
    </SelectPrimitive.Trigger>
  );
});

SelectTrigger.displayName = 'SelectTrigger';

type SelectContentProps = React.ComponentProps<typeof SelectPrimitive.Popup> &
  SharedProps &
  Pick<PortalContentProps, 'container'> & {
    /**
     * @deprecated Retained for API compatibility. Base UI positioning is handled by `SelectPositioner` automatically.
     */
    position?: 'item-aligned' | 'popper';
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
    alignOffset?: number;
  };

const SelectContent = React.forwardRef<React.ComponentRef<typeof SelectPrimitive.Popup>, SelectContentProps>(
  (
    { className, children, position = 'popper', testId, container, side, align, sideOffset = 4, alignOffset, ...props },
    ref
  ) => {
    const portalContainer = usePortalContainer();
    return (
      <SelectPrimitive.Portal container={container ?? portalContainer}>
        <SelectPrimitive.Positioner
          align={align}
          alignOffset={alignOffset}
          className="z-50 max-h-[var(--available-height)]"
          side={side}
          sideOffset={sideOffset}
        >
          <SelectPrimitive.Popup
            className={cn(
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=open]:animate-in',
              position === 'popper' &&
                'data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
              className
            )}
            data-slot="select-content"
            data-testid={testId}
            ref={ref}
            render={renderWithDataState('div')}
            {...props}
          >
            <SelectScrollUpButton />
            <SelectPrimitive.List
              className={cn(
                'max-h-(--available-height) w-full overflow-y-auto overflow-x-hidden p-1',
                position === 'popper' && 'min-w-[var(--anchor-width)] scroll-my-1'
              )}
            >
              {children}
            </SelectPrimitive.List>
            <SelectScrollDownButton />
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    );
  }
);

SelectContent.displayName = 'SelectContent';

const SelectLabel = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.GroupLabel>,
  React.ComponentProps<typeof SelectPrimitive.GroupLabel>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.GroupLabel
    className={cn('px-2 py-1.5 text-muted-foreground text-xs', className)}
    data-slot="select-label"
    ref={ref}
    {...props}
  />
));

SelectLabel.displayName = 'SelectLabel';

const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentProps<typeof SelectPrimitive.Item> & SharedProps
>(({ className, children, testId, ...props }, ref) => (
  <SelectPrimitive.Item
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden *:last:flex *:last:items-center *:last:gap-2 focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
      className
    )}
    data-slot="select-item"
    data-testid={testId}
    ref={ref}
    {...props}
  >
    <span className="absolute right-2 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <CheckIcon className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));

SelectItem.displayName = 'SelectItem';

const SelectSeparator = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Separator>,
  React.ComponentProps<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
    data-slot="select-separator"
    ref={ref}
    {...props}
  />
));

SelectSeparator.displayName = 'SelectSeparator';

const SelectScrollUpButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.ScrollUpArrow>,
  React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpArrow
    className={cn('flex cursor-pointer items-center justify-center py-1', className)}
    data-slot="select-scroll-up-button"
    ref={ref}
    {...props}
  >
    <ChevronUpIcon className="size-4" />
  </SelectPrimitive.ScrollUpArrow>
));

SelectScrollUpButton.displayName = 'SelectScrollUpButton';

const SelectScrollDownButton = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.ScrollDownArrow>,
  React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownArrow
    className={cn('flex cursor-pointer items-center justify-center py-1', className)}
    data-slot="select-scroll-down-button"
    ref={ref}
    {...props}
  >
    <ChevronDownIcon className="size-4" />
  </SelectPrimitive.ScrollDownArrow>
));

SelectScrollDownButton.displayName = 'SelectScrollDownButton';

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
