'use client';

import { Menu as DropdownMenuPrimitive } from '@base-ui/react/menu';
import { Check, ChevronRight, Circle, SearchIcon, X } from 'lucide-react';
import React from 'react';

import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';

/**
 * Whether the nearest filterable menu has a query. Base UI hides the groups and items that stop
 * matching, but a separator or a group-less label belongs to no item, so those read this instead.
 */
const DropdownMenuFilteringContext = React.createContext(false);

/**
 * A provider's query state, waiting for the root or submenu it wraps to claim it; `null` once
 * claimed, so a submenu without a provider of its own never inherits its parent's query.
 */
const DropdownMenuUnclaimedFilterContext = React.createContext<boolean | null>(null);

function DropdownMenuFilterScope({ children }: { children: React.ReactNode }) {
  const filtering = React.useContext(DropdownMenuUnclaimedFilterContext) ?? false;
  return (
    <DropdownMenuUnclaimedFilterContext.Provider value={null}>
      <DropdownMenuFilteringContext.Provider value={filtering}>{children}</DropdownMenuFilteringContext.Provider>
    </DropdownMenuUnclaimedFilterContext.Provider>
  );
}

/**
 * Items tint in CSS off `data-[highlighted]`, as Context Menu's and Select's do. Base UI sets it
 * for the pointer and for arrow keys alike (`highlightItemOnHover`, default on), so one hook
 * covers both — where `focus:` covers neither, since a menu item never becomes
 * `document.activeElement`. Clicking closes the menu, which is the pressed feedback.
 */
type DropdownMenuProps = React.ComponentProps<typeof DropdownMenuPrimitive.Root> & SharedProps;

function DropdownMenu({
  children,
  testId,
  onOpenChange,
  // Non-modal by default so the open menu doesn't lock page scroll.
  modal = false,
  ...props
}: DropdownMenuProps) {
  return (
    <DropdownMenuFilterScope>
      <DropdownMenuPrimitive.Root
        data-slot="dropdown-menu"
        data-testid={testId}
        modal={modal}
        {...props}
        onOpenChange={onOpenChange}
      >
        {children}
      </DropdownMenuPrimitive.Root>
    </DropdownMenuFilterScope>
  );
}

type DropdownMenuFilterProviderProps = React.ComponentProps<typeof DropdownMenuPrimitive.FilterProvider>;

/**
 * Makes the `DropdownMenu` or `DropdownMenuSub` it wraps filterable: add a `DropdownMenuInput` to
 * the content and put the items in a `DropdownMenuList`. Wrap each filterable submenu in its own
 * provider. Keeps the input in the arrow-key loop unless `autoHighlight` is enabled. A Base UI preview API.
 */
function DropdownMenuFilterProvider({
  value,
  defaultValue = '',
  onValueChange,
  autoHighlight = false,
  ...props
}: DropdownMenuFilterProviderProps) {
  // Mirrors the query Base UI keeps. Every change reaches `onValueChange`, the reset on close included
  // (reason `popup-close`), and like Base UI the mirror skips changes the consumer cancels.
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const query = value ?? uncontrolledValue;

  return (
    <DropdownMenuUnclaimedFilterContext.Provider value={query.trim() !== ''}>
      <DropdownMenuPrimitive.FilterProvider
        autoHighlight={autoHighlight}
        defaultValue={defaultValue}
        onValueChange={(nextValue, eventDetails) => {
          onValueChange?.(nextValue, eventDetails);
          if (!eventDetails.isCanceled) {
            setUncontrolledValue(nextValue);
          }
        }}
        value={value}
        {...props}
      />
    </DropdownMenuUnclaimedFilterContext.Provider>
  );
}

type DropdownMenuTriggerProps = React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>;

function DropdownMenuTrigger({ className, ...props }: DropdownMenuTriggerProps) {
  return (
    <DropdownMenuPrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="dropdown-menu-trigger"
      {...props}
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

type DropdownMenuSubProps = React.ComponentProps<typeof DropdownMenuPrimitive.SubmenuRoot>;

function DropdownMenuSub(props: DropdownMenuSubProps) {
  return (
    <DropdownMenuFilterScope>
      <DropdownMenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
    </DropdownMenuFilterScope>
  );
}

type DropdownMenuRadioGroupProps = React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>;

function DropdownMenuRadioGroup(props: DropdownMenuRadioGroupProps) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

type DropdownMenuSubTriggerProps = React.ComponentProps<typeof DropdownMenuPrimitive.SubmenuTrigger> & {
  inset?: boolean;
};

function DropdownMenuSubTrigger({ className, children, inset, disabled, ...props }: DropdownMenuSubTriggerProps) {
  return (
    <DropdownMenuPrimitive.SubmenuTrigger
      {...props}
      disabled={disabled}
      render={
        <div
          className={cn(
            "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-body outline-none transition-colors data-[highlighted]:bg-accent data-[popup-open]:bg-accent data-[highlighted]:text-accent-foreground data-[popup-open]:text-accent-foreground motion-reduce:transition-none [&_[data-chevron]]:transition-transform [&_[data-chevron]]:ease-in-out data-[popup-open]:[&_[data-chevron]]:rotate-90 [&_[data-chevron]]:motion-reduce:transition-none [&_svg:not([class*='text-'])]:text-subtle [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
            inset && 'pl-8',
            className
          )}
          data-inset={inset}
          data-slot="dropdown-menu-sub-trigger"
        />
      }
    >
      {children}
      <ChevronRight className="ml-auto" data-chevron />
    </DropdownMenuPrimitive.SubmenuTrigger>
  );
}

type DropdownMenuSubContentProps = React.ComponentProps<typeof DropdownMenuPrimitive.Popup> &
  Pick<React.ComponentProps<typeof DropdownMenuPrimitive.Positioner>, 'align' | 'alignOffset' | 'side' | 'sideOffset'> &
  Pick<PortalContentProps, 'container'>;

function DropdownMenuSubContent({
  className,
  align = 'start',
  alignOffset = -3,
  side = 'right',
  sideOffset = 0,
  container,
  ...props
}: DropdownMenuSubContentProps) {
  const portalContainer = usePortalContainer();
  return (
    <DropdownMenuPrimitive.Portal container={container ?? portalContainer} data-slot="dropdown-menu-portal">
      {/* `data-[anchor-hidden]:hidden` avoids a (0, 0) flicker when the parent
          menu unmounts mid-exit-animation. */}
      <DropdownMenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className="z-50 data-[anchor-hidden]:hidden"
        side={side}
        sideOffset={sideOffset}
      >
        <DropdownMenuPrimitive.Popup
          className={cn(
            'data-[ending-style]:fade-out-0 data-[starting-style]:fade-in-0 data-[ending-style]:zoom-out-95 data-[starting-style]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 min-w-[8rem] origin-(--transform-origin) overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[ending-style]:animate-out data-[starting-style]:animate-in motion-reduce:animate-none',
            className
          )}
          data-slot="dropdown-menu-sub-content"
          {...props}
        />
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPrimitive.Portal>
  );
}

type DropdownMenuContentProps = React.ComponentProps<typeof DropdownMenuPrimitive.Popup> &
  Pick<PortalContentProps, 'container'> & {
    sideOffset?: number;
    align?: 'start' | 'center' | 'end';
    alignOffset?: number;
    side?: 'top' | 'right' | 'bottom' | 'left';
    /**
     * Keep the portal subtree mounted across close cycles. Set this when a
     * descendant `<Dialog>` / `<AlertDialog>` needs to outlive menu close.
     * See the `dropdown-menu-nested-dialog` demo. @default false
     */
    keepMounted?: boolean;
  };

function DropdownMenuContent({
  className,
  children,
  sideOffset = 4,
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  container,
  keepMounted = false,
  ...props
}: DropdownMenuContentProps) {
  const portalContainer = usePortalContainer();

  return (
    <DropdownMenuPrimitive.Portal
      container={container ?? portalContainer}
      data-slot="dropdown-menu-portal"
      keepMounted={keepMounted}
    >
      <DropdownMenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className="z-50 data-[anchor-hidden]:hidden"
        side={side}
        sideOffset={sideOffset}
      >
        {/* Base UI keeps the popup mounted while `data-[ending-style]` is set
            and the CSS transition runs, so the close animation plays without
            motion's `AnimatePresence`. */}
        <DropdownMenuPrimitive.Popup
          className={cn(
            'data-[ending-style]:fade-out-0 data-[starting-style]:fade-in-0 data-[ending-style]:zoom-out-95 data-[starting-style]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[ending-style]:animate-out data-[starting-style]:animate-in motion-reduce:animate-none',
            className
          )}
          data-slot="dropdown-menu-content"
          {...props}
        >
          {children}
        </DropdownMenuPrimitive.Popup>
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPrimitive.Portal>
  );
}

type DropdownMenuInputProps = React.ComponentProps<typeof DropdownMenuPrimitive.Input> & SharedProps;

/**
 * The search field of a filterable menu, with a clear button once it has text. Needs a
 * `DropdownMenuFilterProvider`, and a name via `aria-label`, `aria-labelledby`, or a `<label>`.
 */
function DropdownMenuInput({ className, testId, ...props }: DropdownMenuInputProps) {
  return (
    <div
      className="-mx-1 -mt-1 mb-1 flex h-9 items-center gap-2 border-b pr-1.5 pl-3 has-[[data-slot=dropdown-menu-input][data-highlighted]]:ring-2 has-[[data-slot=dropdown-menu-input][data-highlighted]]:ring-ring has-[[data-slot=dropdown-menu-input][data-highlighted]]:ring-inset"
      data-slot="dropdown-menu-input-wrapper"
    >
      <SearchIcon aria-hidden className="size-4 shrink-0 text-subtle" />
      <DropdownMenuPrimitive.Input
        className={cn(
          'h-full w-full min-w-0 bg-transparent pointer-coarse:text-body-lg text-body outline-hidden selection:bg-selection selection:text-selection-foreground placeholder:text-placeholder',
          className
        )}
        data-slot="dropdown-menu-input"
        data-testid={testId}
        {...props}
      />
      {/* Pointer-only: Base UI hides it from assistive tech and the tab order. */}
      <DropdownMenuPrimitive.Clear
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-subtle transition-colors hover:bg-accent hover:text-accent-foreground motion-reduce:transition-none [&_svg]:size-4"
        data-slot="dropdown-menu-clear"
      >
        <X />
      </DropdownMenuPrimitive.Clear>
    </div>
  );
}

type DropdownMenuListProps = React.ComponentProps<typeof DropdownMenuPrimitive.List>;

/** Holds the items so a `DropdownMenuInput` can share the content, and scrolls them under it. */
function DropdownMenuList({ className, ...props }: DropdownMenuListProps) {
  return (
    <DropdownMenuPrimitive.List
      className={cn('max-h-72 scroll-py-1 overflow-y-auto overflow-x-hidden outline-hidden', className)}
      data-slot="dropdown-menu-list"
      {...props}
    />
  );
}

type DropdownMenuEmptyProps = React.ComponentProps<typeof DropdownMenuPrimitive.Empty> & SharedProps;

/** Shown, and announced, once the query matches no items. Needs a `DropdownMenuFilterProvider`. */
function DropdownMenuEmpty({ className, testId, ...props }: DropdownMenuEmptyProps) {
  return (
    <DropdownMenuPrimitive.Empty
      className={cn('px-2 py-6 text-center text-body text-subtle', className)}
      data-slot="dropdown-menu-empty"
      data-testid={testId}
      {...props}
    />
  );
}

type DropdownMenuItemProps = React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
  /** @deprecated Base UI menu items have no `onSelect`. Use `onClick` (add `closeOnClick={false}` to keep the menu open). */
  onSelect?: never;
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
    <DropdownMenuPrimitive.Item
      {...props}
      disabled={disabled}
      render={
        <div
          className={cn(
            "data-[variant=destructive]:*:[svg]:!text-destructive relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-body outline-none transition-colors data-[variant=destructive]:data-[highlighted]:bg-destructive-wash data-[variant=destructive]:data-[highlighted]:text-destructive data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[variant=destructive]:text-destructive data-[disabled]:opacity-50 motion-reduce:transition-none [&_svg:not([class*='text-'])]:text-subtle [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
            inset && 'pl-8',
            className
          )}
          data-inset={inset}
          data-slot="dropdown-menu-item"
          data-variant={variant}
        />
      }
    >
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

type DropdownMenuCheckboxItemProps = React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
  inset?: boolean;
  /** @deprecated Base UI menu items have no `onSelect`. Use `onClick` (add `closeOnClick={false}` to keep the menu open). */
  onSelect?: never;
};

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  disabled,
  inset,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      {...props}
      checked={checked}
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-body outline-hidden transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50 motion-reduce:transition-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        inset && 'pl-8',
        className
      )}
      data-inset={inset}
      data-slot="dropdown-menu-checkbox-item"
      disabled={disabled}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.CheckboxItemIndicator data-slot="dropdown-menu-checkbox-item-indicator">
          <Check className="size-4" />
        </DropdownMenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

type DropdownMenuRadioItemProps = React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
  inset?: boolean;
  /** @deprecated Base UI menu items have no `onSelect`. Use `onClick` (add `closeOnClick={false}` to keep the menu open). */
  onSelect?: never;
};

function DropdownMenuRadioItem({ className, children, disabled, inset, ...props }: DropdownMenuRadioItemProps) {
  return (
    <DropdownMenuPrimitive.RadioItem
      {...props}
      disabled={disabled}
      render={
        <div
          className={cn(
            "relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-body outline-hidden transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50 motion-reduce:transition-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
            inset && 'pl-8',
            className
          )}
          data-inset={inset}
          data-slot="dropdown-menu-radio-item"
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
  );
}

type DropdownMenuLabelProps = React.ComponentProps<typeof DropdownMenuPrimitive.GroupLabel> & {
  inset?: boolean;
};

// Base UI's GroupLabel throws without an ancestor Group; auto-wrap if needed.
function DropdownMenuLabel({ className, inset, ...props }: DropdownMenuLabelProps) {
  const insideGroup = React.useContext(DropdownMenuGroupContext);
  const filtering = React.useContext(DropdownMenuFilteringContext);
  const label = (
    <DropdownMenuPrimitive.GroupLabel
      className={cn('px-2 py-1.5 font-semibold text-label', inset && 'pl-8', className)}
      data-inset={inset}
      data-slot="dropdown-menu-label"
      {...props}
    />
  );
  if (insideGroup) {
    return label;
  }
  // A group-less label heads no items, so it can't tell whether anything under it still matches.
  if (filtering) {
    return null;
  }
  return <DropdownMenuPrimitive.Group>{label}</DropdownMenuPrimitive.Group>;
}

type DropdownMenuSeparatorProps = React.ComponentProps<typeof DropdownMenuPrimitive.Separator>;

function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps) {
  const filtering = React.useContext(DropdownMenuFilteringContext);
  // Filtered results read as one list; separators between hidden groups would stack up.
  if (filtering) {
    return null;
  }
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
      className={cn('ml-auto text-body-sm text-subtle tracking-widest', className)}
      data-slot="dropdown-menu-shortcut"
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  type DropdownMenuCheckboxItemProps,
  DropdownMenuContent,
  type DropdownMenuContentProps,
  DropdownMenuEmpty,
  type DropdownMenuEmptyProps,
  DropdownMenuFilterProvider,
  type DropdownMenuFilterProviderProps,
  DropdownMenuGroup,
  type DropdownMenuGroupProps,
  DropdownMenuInput,
  type DropdownMenuInputProps,
  DropdownMenuItem,
  type DropdownMenuItemProps,
  DropdownMenuLabel,
  type DropdownMenuLabelProps,
  DropdownMenuList,
  type DropdownMenuListProps,
  DropdownMenuPortal,
  type DropdownMenuPortalProps,
  type DropdownMenuProps,
  DropdownMenuRadioGroup,
  type DropdownMenuRadioGroupProps,
  DropdownMenuRadioItem,
  type DropdownMenuRadioItemProps,
  DropdownMenuSeparator,
  type DropdownMenuSeparatorProps,
  DropdownMenuShortcut,
  type DropdownMenuShortcutProps,
  DropdownMenuSub,
  DropdownMenuSubContent,
  type DropdownMenuSubContentProps,
  type DropdownMenuSubProps,
  DropdownMenuSubTrigger,
  type DropdownMenuSubTriggerProps,
  DropdownMenuTrigger,
  type DropdownMenuTriggerProps,
};
