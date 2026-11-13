'use client';

import * as Menu from '@ui-sdk/react/menu';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { type ComponentProps, type ReactNode, useId } from 'react';

import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type SharedProps } from '../lib/utils';

type DropdownMenuProps = ComponentProps<typeof Menu.Menu> & SharedProps;
function DropdownMenu({ testId: _testId, modal = false, ...props }: DropdownMenuProps) {
  return <Menu.Menu modal={modal} {...props} />;
}
type DropdownMenuTriggerProps = ComponentProps<typeof Menu.MenuTrigger>;
function DropdownMenuTrigger({ className, ...props }: DropdownMenuTriggerProps) {
  return <Menu.MenuTrigger className={cn('cursor-pointer', className)} {...props} />;
}
type DropdownMenuContentProps = ComponentProps<typeof Menu.MenuContent>;
function DropdownMenuContent({
  className,
  container,
  sideOffset = 4,
  align = 'start',
  ...props
}: DropdownMenuContentProps) {
  const portalContainer = usePortalContainer();
  return (
    <Menu.MenuContent
      align={align}
      className={cn(
        'z-50 max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none',
        className
      )}
      container={container ?? portalContainer}
      sideOffset={sideOffset}
      {...props}
    />
  );
}
const menuItemClassName =
  'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-body outline-none transition-colors data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-destructive:text-destructive data-destructive:data-highlighted:bg-destructive-wash data-destructive:data-highlighted:text-destructive motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';
type DropdownMenuItemProps = ComponentProps<typeof Menu.MenuItem> & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
};
function DropdownMenuItem({ className, inset, variant, ...props }: DropdownMenuItemProps) {
  return (
    <Menu.MenuItem
      className={cn(menuItemClassName, inset && 'pl-8', className)}
      destructive={variant === 'destructive'}
      {...props}
    />
  );
}
type DropdownMenuCheckboxItemProps = Omit<ComponentProps<typeof Menu.MenuCheckboxItem>, 'value' | 'children'> & {
  value?: string;
  children?: ReactNode;
  inset?: boolean;
};
function DropdownMenuCheckboxItem({
  className,
  value,
  children,
  inset: _inset,
  ...props
}: DropdownMenuCheckboxItemProps) {
  const id = useId();
  return (
    <Menu.MenuCheckboxItem className={cn(menuItemClassName, 'pl-8', className)} value={value ?? id} {...props}>
      <Menu.MenuItemIndicator className="absolute left-2 flex size-3.5 items-center justify-center">
        <Check />
      </Menu.MenuItemIndicator>
      {children}
    </Menu.MenuCheckboxItem>
  );
}
type DropdownMenuRadioGroupProps = Omit<ComponentProps<typeof Menu.MenuRadioGroup>, 'name'> & { name?: string };
function DropdownMenuRadioGroup({ name, ...props }: DropdownMenuRadioGroupProps) {
  const id = useId();
  return <Menu.MenuRadioGroup name={name ?? id} {...props} />;
}
type DropdownMenuRadioItemProps = Omit<ComponentProps<typeof Menu.MenuRadioItem>, 'children'> & {
  children?: ReactNode;
  inset?: boolean;
};
function DropdownMenuRadioItem({ className, children, inset: _inset, ...props }: DropdownMenuRadioItemProps) {
  return (
    <Menu.MenuRadioItem className={cn(menuItemClassName, 'pl-8', className)} {...props}>
      <Menu.MenuItemIndicator className="absolute left-2 flex size-3.5 items-center justify-center">
        <Circle className="size-2 fill-current" />
      </Menu.MenuItemIndicator>
      {children}
    </Menu.MenuRadioItem>
  );
}
const DropdownMenuGroup = Menu.MenuGroup;
type DropdownMenuGroupProps = ComponentProps<typeof DropdownMenuGroup>;
type DropdownMenuLabelProps = ComponentProps<typeof Menu.MenuGroupLabel> & { inset?: boolean };
function DropdownMenuLabel({ className, inset, ...props }: DropdownMenuLabelProps) {
  return (
    <Menu.MenuGroupLabel
      className={cn('px-2 py-1.5 text-label font-semibold', inset && 'pl-8', className)}
      {...props}
    />
  );
}
type DropdownMenuSeparatorProps = ComponentProps<typeof Menu.MenuSeparator>;
function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps) {
  return <Menu.MenuSeparator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}
function DropdownMenuShortcut({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn('ml-auto text-body-sm tracking-widest text-subtle', className)} {...props} />;
}
const DropdownMenuSub = Menu.MenuSub;
type DropdownMenuSubProps = ComponentProps<typeof DropdownMenuSub>;
type DropdownMenuSubTriggerProps = Omit<ComponentProps<typeof Menu.MenuSubTrigger>, 'children'> & {
  children?: ReactNode;
  inset?: boolean;
};
function DropdownMenuSubTrigger({ className, children, inset, ...props }: DropdownMenuSubTriggerProps) {
  return (
    <Menu.MenuSubTrigger className={cn(menuItemClassName, inset && 'pl-8', className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </Menu.MenuSubTrigger>
  );
}
const DropdownMenuSubContent = DropdownMenuContent;
type DropdownMenuSubContentProps = DropdownMenuContentProps;

export type {
  DropdownMenuCheckboxItemProps,
  DropdownMenuContentProps,
  DropdownMenuGroupProps,
  DropdownMenuItemProps,
  DropdownMenuLabelProps,
  DropdownMenuProps,
  DropdownMenuRadioGroupProps,
  DropdownMenuRadioItemProps,
  DropdownMenuSeparatorProps,
  DropdownMenuSubContentProps,
  DropdownMenuSubProps,
  DropdownMenuSubTriggerProps,
  DropdownMenuTriggerProps,
};
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
