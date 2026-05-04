'use client';

import { Menu as DropdownMenuPrimitive } from '@base-ui/react/menu';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import React from 'react';

import { MotionHighlight, MotionHighlightItem } from './motion-highlight';
import { usePortalContainer } from '../lib/use-portal-container';
import {
  asChildTrigger,
  narrowCallback,
  narrowOpenChange,
  renderWithDataState,
  useMirroredOpen,
} from '../lib/base-ui-compat';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';

type DropdownMenuContextType = {
  isOpen: boolean;
  highlightTransition: Transition;
  animateOnHover: boolean;
};

const DropdownMenuContext = React.createContext<DropdownMenuContextType | undefined>(undefined);

const useDropdownMenu = (): DropdownMenuContextType => {
  const context = React.useContext(DropdownMenuContext);
  if (!context) {
    throw new Error('useDropdownMenu must be used within a DropdownMenu');
  }
  return context;
};

type DropdownMenuProps = Omit<React.ComponentProps<typeof DropdownMenuPrimitive.Root>, 'onOpenChange' | 'children'> &
  SharedProps & {
    transition?: Transition;
    animateOnHover?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
  };

function DropdownMenu({
  children,
  transition = { type: 'spring', stiffness: 350, damping: 35 },
  animateOnHover = true,
  testId,
  onOpenChange,
  ...props
}: DropdownMenuProps) {
  const { isOpen, handleOpenChange } = useMirroredOpen(props?.open, props?.defaultOpen, onOpenChange);

  return (
    <DropdownMenuContext.Provider value={{ isOpen, highlightTransition: transition, animateOnHover }}>
      <DropdownMenuPrimitive.Root
        data-slot="dropdown-menu"
        data-testid={testId}
        {...props}
        onOpenChange={narrowOpenChange(handleOpenChange)}
      >
        {children}
      </DropdownMenuPrimitive.Root>
    </DropdownMenuContext.Provider>
  );
}

type DropdownMenuTriggerProps = React.ComponentProps<typeof DropdownMenuPrimitive.Trigger> & {
  asChild?: boolean;
};

function DropdownMenuTrigger({ className, ...props }: DropdownMenuTriggerProps) {
  return (
    <DropdownMenuPrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="dropdown-menu-trigger"
      {...asChildTrigger(props)}
    />
  );
}

type DropdownMenuGroupProps = React.ComponentProps<typeof DropdownMenuPrimitive.Group>;

const DropdownMenuGroupContext = React.createContext(false);

function DropdownMenuGroup(props: DropdownMenuGroupProps) {
  return (
    <DropdownMenuGroupContext.Provider value={true}>
      <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
    </DropdownMenuGroupContext.Provider>
  );
}

type DropdownMenuPortalProps = React.ComponentProps<typeof DropdownMenuPrimitive.Portal>;

function DropdownMenuPortal(props: DropdownMenuPortalProps) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

type DropdownMenuSubProps = Omit<React.ComponentProps<typeof DropdownMenuPrimitive.SubmenuRoot>, 'onOpenChange'> & {
  onOpenChange?: (open: boolean) => void;
};

function DropdownMenuSub({ onOpenChange, ...props }: DropdownMenuSubProps) {
  return (
    <DropdownMenuPrimitive.SubmenuRoot
      data-slot="dropdown-menu-sub"
      {...props}
      onOpenChange={narrowOpenChange(onOpenChange)}
    />
  );
}

type DropdownMenuRadioGroupProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>,
  'onValueChange'
> & {
  onValueChange?: (value: string) => void;
};

function DropdownMenuRadioGroup({ onValueChange, ...props }: DropdownMenuRadioGroupProps) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
      onValueChange={narrowCallback(onValueChange)}
    />
  );
}

type DropdownMenuSubTriggerProps = React.ComponentProps<typeof DropdownMenuPrimitive.SubmenuTrigger> & {
  inset?: boolean;
  asChild?: boolean;
};

function DropdownMenuSubTrigger({ className, children, inset, disabled, ...props }: DropdownMenuSubTriggerProps) {
  return (
    <MotionHighlightItem disabled={disabled}>
      <DropdownMenuPrimitive.SubmenuTrigger
        {...props}
        disabled={disabled}
        render={
          <motion.div
            className={cn(
              "relative z-[1] flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_[data-chevron]]:transition-transform [&_[data-chevron]]:duration-150 [&_[data-chevron]]:ease-in-out data-[state=open]:[&_[data-chevron]]:rotate-90 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
              inset && 'pl-8',
              className
            )}
            data-disabled={disabled}
            data-inset={inset}
            data-slot="dropdown-menu-sub-trigger"
            whileTap={{ scale: 0.95 }}
          />
        }
      >
        {children}
        <ChevronRight className="ml-auto" data-chevron />
      </DropdownMenuPrimitive.SubmenuTrigger>
    </MotionHighlightItem>
  );
}

type DropdownMenuSubContentProps = React.ComponentProps<typeof DropdownMenuPrimitive.Popup>;

function DropdownMenuSubContent({ className, ...props }: DropdownMenuSubContentProps) {
  return (
    // `data-[anchor-hidden]:hidden` avoids a (0, 0) flicker when the parent
    // menu unmounts mid-exit-animation.
    <DropdownMenuPrimitive.Positioner className="z-50 data-[anchor-hidden]:hidden">
      <DropdownMenuPrimitive.Popup
        className={cn(
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 min-w-[8rem] origin-(--transform-origin) overflow-hidden rounded-md border bg-popover fill-mode-forwards p-1 text-popover-foreground shadow-lg data-[state=closed]:animate-out data-[state=open]:animate-in',
          className
        )}
        data-slot="dropdown-menu-sub-content"
        render={renderWithDataState('div')}
        {...props}
      />
    </DropdownMenuPrimitive.Positioner>
  );
}

type DropdownMenuContentProps = React.ComponentProps<typeof DropdownMenuPrimitive.Popup> &
  HTMLMotionProps<'div'> &
  Pick<PortalContentProps, 'container' | 'onOpenAutoFocus'> & {
    transition?: Transition;
    sideOffset?: number;
    align?: 'start' | 'center' | 'end';
    alignOffset?: number;
    side?: 'top' | 'right' | 'bottom' | 'left';
    /**
     * Keep the portal subtree mounted across close cycles. Set this when a
     * descendant `<Dialog>` / `<AlertDialog>` needs to outlive menu close;
     * trades the close animation for subtree survival. Avoid on long lists —
     * prefer the sibling-dialog pattern there. See the
     * `dropdown-menu-nested-dialog` demo. @default false
     */
    keepMounted?: boolean;
  };

function DropdownMenuContent({
  className,
  children,
  sideOffset = 4,
  align,
  alignOffset,
  side,
  transition = { duration: 0.2 },
  container,
  onOpenAutoFocus: _onOpenAutoFocus,
  keepMounted = false,
  ...props
}: DropdownMenuContentProps) {
  const { isOpen, highlightTransition, animateOnHover } = useDropdownMenu();
  const portalContainer = usePortalContainer();

  const popup = (
    <DropdownMenuPrimitive.Positioner
      align={align}
      alignOffset={alignOffset}
      className="z-50 data-[anchor-hidden]:hidden"
      side={side}
      sideOffset={sideOffset}
    >
      <DropdownMenuPrimitive.Popup data-slot="dropdown-menu-popup" render={renderWithDataState('div')}>
        <motion.div
          animate={
            keepMounted
              ? undefined
              : {
                  opacity: 1,
                  scale: 1,
                }
          }
          className={cn(
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=open]:animate-in',
            className
          )}
          data-slot="dropdown-menu-content"
          exit={
            keepMounted
              ? undefined
              : {
                  opacity: 0,
                  scale: 0.95,
                }
          }
          initial={
            keepMounted
              ? undefined
              : {
                  opacity: 0,
                  scale: 0.95,
                }
          }
          key="dropdown-menu-content"
          style={{ willChange: 'opacity, transform' }}
          transition={keepMounted ? undefined : transition}
          {...props}
        >
          <MotionHighlight
            className="rounded-sm"
            controlledItems
            enabled={animateOnHover}
            hover
            transition={highlightTransition}
          >
            {children}
          </MotionHighlight>
        </motion.div>
      </DropdownMenuPrimitive.Popup>
    </DropdownMenuPrimitive.Positioner>
  );

  // No `<AnimatePresence>` here on purpose — wrapping it would reintroduce the
  // unmount-on-close that `keepMounted` exists to avoid.
  if (keepMounted) {
    return (
      <DropdownMenuPrimitive.Portal
        container={container ?? portalContainer}
        data-slot="dropdown-menu-portal"
        keepMounted
      >
        {popup}
      </DropdownMenuPrimitive.Portal>
    );
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <DropdownMenuPrimitive.Portal
          container={container ?? portalContainer}
          data-slot="dropdown-menu-portal"
          keepMounted
        >
          {popup}
        </DropdownMenuPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

type DropdownMenuItemProps = React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
  asChild?: boolean;
  /** Radix-compat: fired when the item is selected (click or Enter key). */
  onSelect?: (event: Event) => void;
};

function DropdownMenuItem({
  className,
  children,
  inset,
  disabled,
  variant = 'default',
  onSelect,
  onClick,
  ...props
}: DropdownMenuItemProps) {
  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      (onClick as ((e: React.MouseEvent<HTMLDivElement>) => void) | undefined)?.(event);
      if (event?.nativeEvent) {
        onSelect?.(event.nativeEvent);
      }
    },
    [onClick, onSelect]
  );
  return (
    <MotionHighlightItem
      activeClassName={variant === 'default' ? 'bg-accent' : 'bg-destructive/10 dark:bg-destructive/20'}
      disabled={disabled}
    >
      <DropdownMenuPrimitive.Item
        {...props}
        disabled={disabled}
        onClick={handleClick}
        render={
          <motion.div
            className={cn(
              "data-[variant=destructive]:*:[svg]:!text-destructive relative z-[1] flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground focus-visible:text-accent-foreground data-[disabled]:pointer-events-none data-[variant=destructive]:text-destructive data-[disabled]:opacity-50 data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
              inset && 'pl-8',
              className
            )}
            data-disabled={disabled}
            data-inset={inset}
            data-slot="dropdown-menu-item"
            data-variant={variant}
            whileTap={{ scale: 0.95 }}
          />
        }
      >
        {children}
      </DropdownMenuPrimitive.Item>
    </MotionHighlightItem>
  );
}

type DropdownMenuCheckboxItemProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>,
  'onCheckedChange'
> & {
  onCheckedChange?: (checked: boolean) => void;
};

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  disabled,
  onCheckedChange,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <MotionHighlightItem disabled={disabled}>
      <DropdownMenuPrimitive.CheckboxItem
        {...props}
        checked={checked}
        className={cn(
          "relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
          className
        )}
        data-disabled={disabled}
        data-slot="dropdown-menu-checkbox-item"
        disabled={disabled}
        onCheckedChange={narrowCallback(onCheckedChange)}
        render={renderWithDataState('div')}
      >
        <span className="absolute left-2 flex size-3.5 items-center justify-center">
          <DropdownMenuPrimitive.CheckboxItemIndicator data-slot="dropdown-menu-checkbox-item-indicator">
            <Check className="size-4" />
          </DropdownMenuPrimitive.CheckboxItemIndicator>
        </span>
        {children}
      </DropdownMenuPrimitive.CheckboxItem>
    </MotionHighlightItem>
  );
}

type DropdownMenuRadioItemProps = React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>;

function DropdownMenuRadioItem({ className, children, disabled, ...props }: DropdownMenuRadioItemProps) {
  return (
    <MotionHighlightItem disabled={disabled}>
      <DropdownMenuPrimitive.RadioItem
        {...props}
        disabled={disabled}
        render={
          <motion.div
            className={cn(
              "relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
              className
            )}
            data-disabled={disabled}
            data-slot="dropdown-menu-radio-item"
            whileTap={{ scale: 0.95 }}
          />
        }
      >
        <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
          <DropdownMenuPrimitive.RadioItemIndicator data-slot="dropdown-menu-radio-item-indicator">
            <Circle className="size-2 fill-current" />
          </DropdownMenuPrimitive.RadioItemIndicator>
        </span>
        {children}
      </DropdownMenuPrimitive.RadioItem>
    </MotionHighlightItem>
  );
}

type DropdownMenuLabelProps = React.ComponentProps<typeof DropdownMenuPrimitive.GroupLabel> & {
  inset?: boolean;
};

// Base UI's GroupLabel throws without an ancestor Group; auto-wrap if needed.
function DropdownMenuLabel({ className, inset, ...props }: DropdownMenuLabelProps) {
  const insideGroup = React.useContext(DropdownMenuGroupContext);
  const label = (
    <DropdownMenuPrimitive.GroupLabel
      className={cn('px-2 py-1.5 font-semibold text-sm', inset && 'pl-8', className)}
      data-inset={inset}
      data-slot="dropdown-menu-label"
      {...props}
    />
  );
  if (insideGroup) {
    return label;
  }
  return <DropdownMenuPrimitive.Group>{label}</DropdownMenuPrimitive.Group>;
}

type DropdownMenuSeparatorProps = React.ComponentProps<typeof DropdownMenuPrimitive.Separator>;

function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      data-slot="dropdown-menu-separator"
      {...props}
    />
  );
}

type DropdownMenuShortcutProps = React.ComponentProps<'span'>;

function DropdownMenuShortcut({ className, ...props }: DropdownMenuShortcutProps) {
  return (
    <span
      className={cn('ml-auto text-muted-foreground text-xs tracking-widest', className)}
      data-slot="dropdown-menu-shortcut"
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
  type DropdownMenuProps,
  type DropdownMenuTriggerProps,
  type DropdownMenuContentProps,
  type DropdownMenuItemProps,
  type DropdownMenuCheckboxItemProps,
  type DropdownMenuRadioItemProps,
  type DropdownMenuLabelProps,
  type DropdownMenuSeparatorProps,
  type DropdownMenuShortcutProps,
  type DropdownMenuGroupProps,
  type DropdownMenuPortalProps,
  type DropdownMenuSubProps,
  type DropdownMenuSubContentProps,
  type DropdownMenuSubTriggerProps,
  type DropdownMenuRadioGroupProps,
};
