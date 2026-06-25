'use client';

import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import type React from 'react';

import { useGroup } from './group';
import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';

// Pin Base UI's generic `Value` to `string`, casting at the boundary for a string-typed `onValueChange`.
type SelectRootProps = Omit<React.ComponentProps<typeof SelectPrimitive.Root>, 'onValueChange'> &
  SharedProps & {
    onValueChange?: (value: string, eventDetails: SelectPrimitive.Root.ChangeEventDetails) => void;
  };

function Select({ testId, onValueChange, ...props }: SelectRootProps) {
  return (
    <SelectPrimitive.Root
      data-slot="select"
      data-testid={testId}
      onValueChange={onValueChange ? (value, eventDetails) => onValueChange(value as string, eventDetails) : undefined}
      {...props}
    />
  );
}

function SelectGroup({ testId, ...props }: SelectPrimitive.Group.Props & SharedProps) {
  return <SelectPrimitive.Group data-slot="select-group" data-testid={testId} {...props} />;
}

type SelectValueProps = Omit<SelectPrimitive.Value.Props, 'children'> & {
  placeholder?: React.ReactNode;
  children?: React.ReactNode | ((value: unknown) => React.ReactNode);
};

// Base UI resolves an item's label only after the popup mounts, flashing the raw value (e.g. `1`
// instead of `Any`) for controlled enum-backed selects. Pass a render-prop child or `items` map to
// close the gap — see the `select-enum-label` demo.
function SelectValue({ placeholder, children, ...props }: SelectValueProps) {
  // Fall back to placeholder when the render-prop returns null/undefined (Base UI ignores `placeholder` once `children` is set).
  if (typeof children === 'function') {
    const renderValue = children;
    return (
      <SelectPrimitive.Value data-slot="select-value" placeholder={placeholder} {...props}>
        {(value: unknown) => {
          const result = renderValue(value);
          if ((result === null || result === undefined) && placeholder !== undefined) {
            return placeholder;
          }
          return result;
        }}
      </SelectPrimitive.Value>
    );
  }
  if (children !== undefined) {
    return (
      <SelectPrimitive.Value data-slot="select-value" placeholder={placeholder} {...props}>
        {children as SelectPrimitive.Value.Props['children']}
      </SelectPrimitive.Value>
    );
  }
  return <SelectPrimitive.Value data-slot="select-value" placeholder={placeholder} {...props} />;
}

type SelectTriggerProps = SelectPrimitive.Trigger.Props &
  SharedProps & {
    size?: 'sm' | 'default' | 'lg';
  };

function SelectTrigger({ className, size = 'default', children, testId, ...props }: SelectTriggerProps) {
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
}

type SelectContentProps = SelectPrimitive.Popup.Props &
  SharedProps &
  Pick<PortalContentProps, 'container'> &
  Pick<SelectPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset' | 'alignItemWithTrigger'>;

function SelectContent({
  className,
  children,
  testId,
  container,
  side = 'bottom',
  align,
  sideOffset = 4,
  alignOffset,
  alignItemWithTrigger,
  ...props
}: SelectContentProps) {
  const portalContainer = usePortalContainer();
  return (
    <SelectPrimitive.Portal container={container ?? portalContainer}>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        alignOffset={alignOffset}
        className="z-50 max-h-[var(--available-height)]"
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className={cn(
            'data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[align-trigger=true]:animate-none data-[closed]:animate-out data-[open]:animate-in',
            !alignItemWithTrigger &&
              'data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
            className
          )}
          data-align-trigger={alignItemWithTrigger}
          data-slot="select-content"
          data-testid={testId}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List
            className={cn(
              'max-h-(--available-height) w-full overflow-y-auto overflow-x-hidden p-1',
              !alignItemWithTrigger && 'min-w-[var(--anchor-width)] scroll-my-1'
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

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      className={cn('px-2 py-1.5 text-muted-foreground text-xs', className)}
      data-slot="select-label"
      {...props}
    />
  );
}

function SelectItem({ className, children, testId, ...props }: SelectPrimitive.Item.Props & SharedProps) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden *:last:flex *:last:items-center *:last:gap-2 data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-slot="select-item"
      data-testid={testId}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      data-slot="select-separator"
      {...props}
    />
  );
}

function SelectScrollUpButton({ className, ...props }: SelectPrimitive.ScrollUpArrow.Props) {
  return (
    <SelectPrimitive.ScrollUpArrow
      className={cn('flex cursor-pointer items-center justify-center py-1', className)}
      data-slot="select-scroll-up-button"
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({ className, ...props }: SelectPrimitive.ScrollDownArrow.Props) {
  return (
    <SelectPrimitive.ScrollDownArrow
      className={cn('flex cursor-pointer items-center justify-center py-1', className)}
      data-slot="select-scroll-down-button"
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  type SelectContentProps,
  SelectGroup,
  SelectItem,
  SelectLabel,
  type SelectRootProps,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  type SelectTriggerProps,
  SelectValue,
  type SelectValueProps,
};
