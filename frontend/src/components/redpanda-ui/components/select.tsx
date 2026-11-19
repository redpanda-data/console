'use client';

import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import type React from 'react';
import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';

// Preserve the string-valued public contract; Base UI represents an empty selection as null.
type SelectRootProps = Omit<SelectPrimitive.Root.Props<string>, 'onValueChange'> &
  SharedProps & {
    onValueChange?: ((value: string, eventDetails: SelectPrimitive.Root.ChangeEventDetails) => void) | undefined;
  };

function Select({ testId, onValueChange, ...props }: SelectRootProps) {
  return (
    <SelectPrimitive.Root
      data-slot="select"
      data-testid={testId}
      onValueChange={
        onValueChange === undefined
          ? undefined
          : (value, eventDetails) => {
              onValueChange(value ?? '', eventDetails);
            }
      }
      {...props}
    />
  );
}

function SelectGroup({ testId, ...props }: SelectPrimitive.Group.Props & SharedProps) {
  return <SelectPrimitive.Group data-slot="select-group" data-testid={testId} {...props} />;
}

type SelectValueProps = Omit<SelectPrimitive.Value.Props, 'children'> & {
  placeholder?: React.ReactNode | undefined;
  children?: React.ReactNode | ((value: unknown) => React.ReactNode) | undefined;
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
        {children}
      </SelectPrimitive.Value>
    );
  }
  return <SelectPrimitive.Value data-slot="select-value" placeholder={placeholder} {...props} />;
}

type SelectTriggerProps = SelectPrimitive.Trigger.Props &
  SharedProps & {
    size?: 'sm' | 'default' | 'lg' | undefined;
  };

function SelectTrigger({ className, size = 'default', children, testId, ...props }: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      // No pressed step: Base UI opens the listbox on mousedown and the portal takes the
      // pointer, so the trigger stops matching `:active` at the moment it would paint — and
      // `data-popup-open` cannot carry it either, since `hover:not-disabled:` is one selector
      // heavier and outranks it while the pointer is still on the trigger. The listbox
      // appearing is the feedback, as it is for Navigation Menu and Menubar.
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 border !border-input bg-input-fill px-3 py-2 text-body whitespace-nowrap shadow-xs transition-[color,background-color,border-color,box-shadow] outline-none hover:not-disabled:!border-input-hover hover:not-disabled:bg-input-fill-hover focus-visible:!border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:!border-destructive aria-invalid:ring-invalid data-[placeholder]:text-placeholder data-[size=default]:h-9 data-[size=lg]:h-10 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-subtle",
        'rounded-md',
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
        className="z-50 max-h-(--available-height)"
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className={cn(
            'data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[closed]:animate-out data-[open]:animate-in relative z-50 max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[align-trigger=true]:animate-none',
            alignItemWithTrigger !== true &&
              'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
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
              'max-h-(--available-height) w-full overflow-x-hidden overflow-y-auto p-1',
              alignItemWithTrigger !== true && 'min-w-(--anchor-width) scroll-my-1'
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
      className={cn('px-2 py-1.5 text-body-sm text-subtle', className)}
      data-slot="select-label"
      {...props}
    />
  );
}

function SelectItem({ className, children, testId, ...props }: SelectPrimitive.Item.Props & SharedProps) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-body outline-hidden select-none *:last:flex *:last:items-center *:last:gap-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-subtle",
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
      className={cn(
        'flex cursor-pointer items-center justify-center py-1 transition-colors hover:bg-accent motion-reduce:transition-none',
        className
      )}
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
      className={cn(
        'flex cursor-pointer items-center justify-center py-1 transition-colors hover:bg-accent motion-reduce:transition-none',
        className
      )}
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
