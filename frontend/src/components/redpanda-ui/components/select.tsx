'use client';

import * as SelectPrimitive from '@ui-sdk/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import type React from 'react';

import { commitAgentChange } from '../lib/commit-agent-change';
import { groupItemClasses, useGroup } from './group';
import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type SharedProps } from '../lib/utils';

type SelectRootProps = Omit<
  Extract<React.ComponentProps<typeof SelectPrimitive.Select<string, false>>, { multiple?: false }>,
  'onValueChange' | 'items'
> & {
  onValueChange?: (
    value: string,
    details: Parameters<
      NonNullable<React.ComponentProps<typeof SelectPrimitive.Select<string, false>>['onValueChange']>
    >[1]
  ) => void;
} & { items?: SelectPrimitive.ListData | Record<string, string> } & SharedProps;
function Select({ testId: _testId, items, onValueChange, value, defaultValue, ...props }: SelectRootProps) {
  return (
    <SelectPrimitive.Select<string, false>
      {...props}
      value={value === '' ? null : value}
      defaultValue={defaultValue === '' ? null : defaultValue}
      items={items && !Array.isArray(items) ? Object.entries(items).map(([value, label]) => ({ value, label })) : items}
      onValueChange={(value, details) => {
        if (value === null) {
          details.cancel();
        } else {
          commitAgentChange(onValueChange, value, details);
        }
      }}
    />
  );
}
function SelectGroup({ testId, ...props }: React.ComponentProps<typeof SelectPrimitive.SelectGroup> & SharedProps) {
  return <SelectPrimitive.SelectGroup data-testid={testId} {...props} />;
}
type SelectValueProps = Omit<React.ComponentProps<typeof SelectPrimitive.SelectValue>, 'children'> & {
  children?: React.ReactNode | ((value: unknown) => React.ReactNode);
};
function SelectValue({ placeholder, children, ...props }: SelectValueProps) {
  return (
    <SelectPrimitive.SelectValue placeholder={placeholder} {...props}>
      {typeof children === 'function' ? (state) => children(state.value) ?? placeholder : children}
    </SelectPrimitive.SelectValue>
  );
}

type SelectTriggerProps = Omit<React.ComponentProps<typeof SelectPrimitive.SelectTrigger>, 'children'> & {
  children?: React.ReactNode;
} & SharedProps & {
    size?: 'sm' | 'default' | 'lg';
  };

function SelectTrigger({ className, size = 'default', children, testId, ...props }: SelectTriggerProps) {
  const { position: groupPosition, attached } = useGroup();

  const positionClasses = groupItemClasses(attached, groupPosition);

  return (
    <SelectPrimitive.SelectTrigger
      // No pressed step: UI SDK opens the listbox on mousedown and the portal takes the
      // pointer, so the trigger stops matching `:active` at the moment it would paint — and
      // `data-popup-open` cannot carry it either, since `hover:not-disabled:` is one selector
      // heavier and outranks it while the pointer is still on the trigger. The listbox
      // appearing is the feedback, as it is for Navigation Menu and Menubar.
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-2 border !border-input bg-input-fill px-3 py-2 text-body whitespace-nowrap shadow-xs transition-[color,background-color,border-color,box-shadow] outline-none hover:not-disabled:!border-input-hover hover:not-disabled:bg-input-fill-hover focus-visible:!border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:!border-destructive aria-invalid:ring-invalid data-[placeholder]:text-placeholder data-[size=default]:h-9 data-[size=lg]:h-10 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-subtle",
        positionClasses,
        className
      )}
      data-size={size}
      data-slot="select-trigger"
      data-testid={testId}
      {...props}
    >
      {children}
      <span aria-hidden="true">
        <ChevronDownIcon className="size-4 opacity-50" />
      </span>
    </SelectPrimitive.SelectTrigger>
  );
}

type SelectContentProps = React.ComponentProps<typeof SelectPrimitive.SelectContent> & SharedProps;
function SelectContent({
  className,
  children,
  testId,
  container,
  side = 'bottom',
  sideOffset = 4,
  ...props
}: SelectContentProps) {
  const portalContainer = usePortalContainer();
  return (
    <SelectPrimitive.SelectContent
      className={cn(
        'z-50 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none',
        className
      )}
      container={container ?? portalContainer}
      data-testid={testId}
      side={side}
      sideOffset={sideOffset}
      {...props}
    >
      {children}
    </SelectPrimitive.SelectContent>
  );
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.SelectGroupLabel>) {
  return (
    <SelectPrimitive.SelectGroupLabel
      className={cn('px-2 py-1.5 text-body-sm text-subtle', className)}
      data-slot="select-label"
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof SelectPrimitive.SelectItem<string>>, 'children'> & {
  children?: React.ReactNode;
} & SharedProps) {
  return (
    <SelectPrimitive.SelectItem
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-body outline-hidden select-none *:last:flex *:last:items-center *:last:gap-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-subtle",
        className
      )}
      data-slot="select-item"
      data-testid={testId}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.SelectItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.SelectItemIndicator>
      </span>
      <SelectPrimitive.SelectItemText>{() => children}</SelectPrimitive.SelectItemText>
    </SelectPrimitive.SelectItem>
  );
}

function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.SelectSeparator>) {
  return (
    <SelectPrimitive.SelectSeparator
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      data-slot="select-separator"
      {...props}
    />
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
  SelectSeparator,
  SelectTrigger,
  type SelectTriggerProps,
  SelectValue,
  type SelectValueProps,
};
