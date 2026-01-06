'use client';

import { Check, ChevronRight, Circle } from 'lucide-react';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import React from 'react';

import { MotionHighlight, MotionHighlightItem } from './motion-highlight';
import { cn, type SharedProps } from '../lib/utils';

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

type DropdownMenuProps = React.ComponentProps<typeof DropdownMenuPrimitive.Root> &
  SharedProps & {
    transition?: Transition;
    animateOnHover?: boolean;
  };

function DropdownMenu({
  children,
  transition = { type: 'spring', stiffness: 350, damping: 35 },
  animateOnHover = true,
  testId,
  ...props
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(props?.open ?? props?.defaultOpen ?? false);

  React.useEffect(() => {
    if (props?.open !== undefined) {
      setIsOpen(props.open);
    }
  }, [props?.open]);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      props.onOpenChange?.(open);
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: part of dropdown menu behavior
    [props]
  );

  return (
    <DropdownMenuContext.Provider value={{ isOpen, highlightTransition: transition, animateOnHover }}>
      <DropdownMenuPrimitive.Root
        data-slot="dropdown-menu"
        data-testid={testId}
        {...props}
        onOpenChange={handleOpenChange}
      >
        {children}
      </DropdownMenuPrimitive.Root>
    </DropdownMenuContext.Provider>
  );
}

type DropdownMenuTriggerProps = React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>;

function DropdownMenuTrigger(props: DropdownMenuTriggerProps) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

type DropdownMenuGroupProps = React.ComponentProps<typeof DropdownMenuPrimitive.Group>;

function DropdownMenuGroup(props: DropdownMenuGroupProps) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

type DropdownMenuPortalProps = React.ComponentProps<typeof DropdownMenuPrimitive.Portal>;

function DropdownMenuPortal(props: DropdownMenuPortalProps) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

type DropdownMenuSubProps = React.ComponentProps<typeof DropdownMenuPrimitive.Sub>;

function DropdownMenuSub(props: DropdownMenuSubProps) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

type DropdownMenuRadioGroupProps = React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>;

function DropdownMenuRadioGroup(props: DropdownMenuRadioGroupProps) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

type DropdownMenuSubTriggerProps = React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean;
};

function DropdownMenuSubTrigger({ className, children, inset, disabled, ...props }: DropdownMenuSubTriggerProps) {
  return (
    <MotionHighlightItem disabled={disabled}>
      <DropdownMenuPrimitive.SubTrigger {...props} asChild disabled={disabled}>
        <motion.div
          className={cn(
            "relative z-[1] flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:text-accent-foreground data-[state=open]:text-accent-foreground [&:not([data-highlight])]:focus:bg-accent [&:not([data-highlight])]:data-[state=open]:bg-accent [&_[data-chevron]]:transition-transform [&_[data-chevron]]:duration-150 [&_[data-chevron]]:ease-in-out data-[state=open]:[&_[data-chevron]]:rotate-90 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
            inset && 'pl-8',
            className
          )}
          data-disabled={disabled}
          data-inset={inset}
          data-slot="dropdown-menu-sub-trigger"
          whileTap={{ scale: 0.95 }}
        >
          {children}
          <ChevronRight className="ml-auto" data-chevron />
        </motion.div>
      </DropdownMenuPrimitive.SubTrigger>
    </MotionHighlightItem>
  );
}

type DropdownMenuSubContentProps = React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>;

function DropdownMenuSubContent({ className, ...props }: DropdownMenuSubContentProps) {
  return (
    <DropdownMenuPrimitive.SubContent
      className={cn(
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-[--radix-dropdown-menu-content-transform-origin] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=closed]:animate-out data-[state=open]:animate-in',
        className
      )}
      data-slot="dropdown-menu-sub-content"
      {...props}
    />
  );
}

type DropdownMenuContentProps = React.ComponentProps<typeof DropdownMenuPrimitive.Content> &
  HTMLMotionProps<'div'> & {
    transition?: Transition;
    container?: Element;
  };

function DropdownMenuContent({
  className,
  children,
  sideOffset = 4,
  transition = { duration: 0.2 },
  container,
  ...props
}: DropdownMenuContentProps) {
  const { isOpen, highlightTransition, animateOnHover } = useDropdownMenu();

  return (
    <AnimatePresence>
      {isOpen ? (
        <DropdownMenuPrimitive.Portal container={container} data-slot="dropdown-menu-portal" forceMount>
          <DropdownMenuPrimitive.Content asChild sideOffset={sideOffset} {...props}>
            <motion.div
              animate={{
                opacity: 1,
                scale: 1,
              }}
              className={cn(
                'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] origin-[--radix-dropdown-menu-content-transform-origin] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=open]:animate-in',
                className
              )}
              data-slot="dropdown-menu-content"
              exit={{
                opacity: 0,
                scale: 0.95,
              }}
              initial={{
                opacity: 0,
                scale: 0.95,
              }}
              key="dropdown-menu-content"
              style={{ willChange: 'opacity, transform' }}
              transition={transition}
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
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

type DropdownMenuItemProps = React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
};

function DropdownMenuItem({
  className,
  children,
  inset,
  disabled,
  variant = 'default',
  ...props
}: DropdownMenuItemProps) {
  return (
    <MotionHighlightItem
      activeClassName={variant === 'default' ? 'bg-accent' : 'bg-destructive/10 dark:bg-destructive/20'}
      disabled={disabled}
    >
      <DropdownMenuPrimitive.Item {...props} asChild disabled={disabled}>
        <motion.div
          className={cn(
            "data-[variant=destructive]:*:[svg]:!text-destructive relative z-[1] flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:text-accent-foreground focus-visible:text-accent-foreground data-[disabled]:pointer-events-none data-[variant=destructive]:text-destructive data-[disabled]:opacity-50 data-[variant=destructive]:focus:text-destructive [&:not([data-highlight])]:focus:bg-accent [&:not([data-highlight])]:data-[variant=destructive]:focus:bg-destructive/10 dark:[&:not([data-highlight])]:data-[variant=destructive]:focus:bg-destructive/20 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
            inset && 'pl-8',
            className
          )}
          data-disabled={disabled}
          data-inset={inset}
          data-slot="dropdown-menu-item"
          data-variant={variant}
          whileTap={{ scale: 0.95 }}
        >
          {children}
        </motion.div>
      </DropdownMenuPrimitive.Item>
    </MotionHighlightItem>
  );
}

type DropdownMenuCheckboxItemProps = React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>;

function DropdownMenuCheckboxItem({ className, children, checked, disabled, ...props }: DropdownMenuCheckboxItemProps) {
  return (
    <MotionHighlightItem disabled={disabled}>
      <DropdownMenuPrimitive.CheckboxItem {...props} asChild checked={checked} disabled={disabled}>
        <motion.div
          className={cn(
            "relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&:not([data-highlight])]:focus:bg-accent [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
            className
          )}
          data-disabled={disabled}
          data-slot="dropdown-menu-checkbox-item"
          whileTap={{ scale: 0.95 }}
        >
          <span className="absolute left-2 flex size-3.5 items-center justify-center">
            <DropdownMenuPrimitive.ItemIndicator data-slot="dropdown-menu-checkbox-item-indicator">
              <Check className="size-4" />
            </DropdownMenuPrimitive.ItemIndicator>
          </span>
          {children}
        </motion.div>
      </DropdownMenuPrimitive.CheckboxItem>
    </MotionHighlightItem>
  );
}

type DropdownMenuRadioItemProps = React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>;

function DropdownMenuRadioItem({ className, children, disabled, ...props }: DropdownMenuRadioItemProps) {
  return (
    <MotionHighlightItem disabled={disabled}>
      <DropdownMenuPrimitive.RadioItem {...props} asChild disabled={disabled}>
        <motion.div
          className={cn(
            "relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&:not([data-highlight])]:focus:bg-accent [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
            className
          )}
          data-disabled={disabled}
          data-slot="dropdown-menu-radio-item"
          whileTap={{ scale: 0.95 }}
        >
          <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
            <DropdownMenuPrimitive.ItemIndicator data-slot="dropdown-menu-radio-item-indicator">
              <Circle className="size-2 fill-current" />
            </DropdownMenuPrimitive.ItemIndicator>
          </span>
          {children}
        </motion.div>
      </DropdownMenuPrimitive.RadioItem>
    </MotionHighlightItem>
  );
}

type DropdownMenuLabelProps = React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
};

function DropdownMenuLabel({ className, inset, ...props }: DropdownMenuLabelProps) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-2 py-1.5 font-semibold text-sm', inset && 'pl-8', className)}
      data-inset={inset}
      data-slot="dropdown-menu-label"
      {...props}
    />
  );
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
