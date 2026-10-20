'use client';

import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type FixedPositionContentProps, type SharedProps } from '../lib/utils';

/** The viewport edge the drawer is attached to. */
type DrawerDirection = 'top' | 'right' | 'bottom' | 'left';

/** `direction` names the edge the drawer sits on; Base UI's `swipeDirection` names the swipe that dismisses it. */
const SWIPE_DIRECTION = {
  top: 'up',
  right: 'right',
  bottom: 'down',
  left: 'left',
} as const satisfies Record<DrawerDirection, DrawerPrimitive.Root.Props['swipeDirection']>;

/**
 * Close reasons cancelled only when `dismissible={false}`; a dismissible drawer closes on all of them.
 * An explicit `DrawerClose` or trigger press still closes. `focus-out` is Base UI closing a non-modal
 * drawer when keyboard focus tabs out of it; a pointer press elsewhere never sends it.
 */
const DISMISS_REASONS: ReadonlySet<DrawerPrimitive.Root.ChangeEventReason> = new Set([
  'close-watcher',
  'escape-key',
  'focus-out',
  'outside-press',
  'swipe',
]);

type DrawerModal = NonNullable<DrawerPrimitive.Root.Props['modal']>;

/** What `DrawerContent` needs from the root: which edge to style, and whether to render an overlay. */
const DrawerDirectionContext = React.createContext<DrawerDirection>('bottom');
const DrawerModalContext = React.createContext<DrawerModal>(true);
/** The root's `container`, which `DrawerContent` and `DrawerPortal` portal into unless given their own. */
const DrawerContainerContext = React.createContext<HTMLElement | null | undefined>(undefined);

type DrawerProps = Omit<DrawerPrimitive.Root.Props, 'swipeDirection'> &
  SharedProps & {
    /**
     * The edge the drawer slides in from. It also sets the swipe that dismisses it: a bottom drawer
     * is swiped down, a top drawer up, and a side drawer toward its own edge.
     * @default 'bottom'
     */
    direction?: DrawerDirection;
    /**
     * When false, Escape, outside presses, focus leaving the drawer and swipes no longer close it.
     * `DrawerClose`, the trigger and a controlled `open` still do.
     * @default true
     */
    dismissible?: boolean;
    /** Where the drawer portals to, as on vaul's root. A `container` on `DrawerContent` wins. */
    container?: HTMLElement | null;
    /** @deprecated vaul's name for `snapPoint`. */
    activeSnapPoint?: DrawerPrimitive.Root.SnapPoint | null;
    /** @deprecated vaul's name for `onSnapPointChange`. */
    setActiveSnapPoint?: (snapPoint: DrawerPrimitive.Root.SnapPoint | null) => void;
    /** @deprecated vaul's name for `snapToSequentialPoints`. */
    snapToSequentialPoint?: boolean;
  };

function Drawer({
  testId,
  container,
  direction = 'bottom',
  modal = true,
  dismissible = true,
  disablePointerDismissal,
  onOpenChange,
  activeSnapPoint,
  snapPoint = activeSnapPoint,
  setActiveSnapPoint,
  onSnapPointChange,
  snapToSequentialPoint,
  snapToSequentialPoints = snapToSequentialPoint,
  ...props
}: DrawerProps) {
  function handleOpenChange(open: boolean, eventDetails: DrawerPrimitive.Root.ChangeEventDetails) {
    if (!(open || dismissible) && DISMISS_REASONS.has(eventDetails.reason)) {
      eventDetails.cancel();
      return;
    }
    onOpenChange?.(open, eventDetails);
  }

  function handleSnapPointChange(
    nextSnapPoint: DrawerPrimitive.Root.SnapPoint | null,
    eventDetails: DrawerPrimitive.Root.SnapPointChangeEventDetails
  ) {
    onSnapPointChange?.(nextSnapPoint, eventDetails);
    setActiveSnapPoint?.(nextSnapPoint);
  }

  return (
    <DrawerDirectionContext.Provider value={direction}>
      <DrawerContainerContext.Provider value={container}>
        <DrawerModalContext.Provider value={modal}>
          <DrawerPrimitive.Root
            data-slot="drawer"
            data-testid={testId}
            // A non-modal drawer stays open when the page behind it is clicked, as it did on vaul.
            disablePointerDismissal={disablePointerDismissal ?? (modal === false || !dismissible)}
            modal={modal}
            onOpenChange={handleOpenChange}
            onSnapPointChange={handleSnapPointChange}
            snapPoint={snapPoint}
            snapToSequentialPoints={snapToSequentialPoints}
            swipeDirection={SWIPE_DIRECTION[direction]}
            {...props}
          />
        </DrawerModalContext.Provider>
      </DrawerContainerContext.Provider>
    </DrawerDirectionContext.Provider>
  );
}

type DrawerTriggerProps = DrawerPrimitive.Trigger.Props;

function DrawerTrigger({ className, ...props }: DrawerTriggerProps) {
  return <DrawerPrimitive.Trigger className={cn('cursor-pointer', className)} data-slot="drawer-trigger" {...props} />;
}

type DrawerPortalProps = DrawerPrimitive.Portal.Props;

function DrawerPortal({ container, ...props }: DrawerPortalProps) {
  const rootContainer = React.useContext(DrawerContainerContext);
  return <DrawerPrimitive.Portal container={container ?? rootContainer} data-slot="drawer-portal" {...props} />;
}

type DrawerCloseProps = DrawerPrimitive.Close.Props;

function DrawerClose({ className, ...props }: DrawerCloseProps) {
  return <DrawerPrimitive.Close className={cn('cursor-pointer', className)} data-slot="drawer-close" {...props} />;
}

/**
 * vaul's 500ms open curve. A close takes up to 400ms, shortened by Base UI after a fast swipe.
 * allow: motion-design — a full-viewport-edge slide; the iOS sheet convention vaul matched.
 */
const DRAWER_TIMING =
  'duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] data-[ending-style]:duration-[calc(var(--drawer-swipe-strength,1)*400ms)]';

type DrawerOverlayProps = DrawerPrimitive.Backdrop.Props;

function DrawerOverlay({ className, ...props }: DrawerOverlayProps) {
  return (
    <DrawerPrimitive.Backdrop
      className={cn(
        'fixed inset-0 z-50 bg-modal-overlay-strong transition-opacity motion-reduce:transition-none',
        DRAWER_TIMING,
        // Fades out as the drawer is swiped away, tracking the finger with no transition lag.
        'opacity-[calc(1-var(--drawer-swipe-progress,0))] data-[swiping]:duration-0',
        'data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
        className
      )}
      data-slot="drawer-overlay"
      {...props}
    />
  );
}

/**
 * Positions are direct variants rather than data-attribute selectors, so a width or inset in
 * `className` replaces the default instead of losing to it on specificity.
 *
 * Base UI writes the drag offset to `--drawer-swipe-movement-*` (and the snap point offset to
 * `--drawer-snap-point-offset`); the resting `transform` adds them up, and the starting and ending
 * styles push the panel past its edge. `after:` extends the background beyond that edge, so a drag
 * the wrong way (damped, but not zero) does not open a gap.
 */
const drawerContentVariants = cva(
  [
    'group/drawer-content pointer-events-auto fixed flex h-auto flex-col bg-background outline-none',
    'transition-transform data-[swiping]:select-none motion-reduce:transition-none',
    DRAWER_TIMING,
    "after:pointer-events-none after:absolute after:bg-inherit after:content-['']",
  ],
  {
    variants: {
      direction: {
        top: [
          'inset-x-0 top-0 mb-24 max-h-[80vh] rounded-b-lg border-b',
          '[transform:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))]',
          'data-[ending-style]:[transform:translateY(-100%)] data-[starting-style]:[transform:translateY(-100%)]',
          'after:inset-x-0 after:bottom-full after:h-full',
        ],
        bottom: [
          'inset-x-0 bottom-0 mt-24 max-h-[80vh] rounded-t-lg border-t',
          '[transform:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))]',
          'data-[ending-style]:[transform:translateY(100%)] data-[starting-style]:[transform:translateY(100%)]',
          'after:inset-x-0 after:top-full after:h-full',
        ],
        right: [
          'inset-y-0 right-0 border-l',
          '[transform:translateX(var(--drawer-swipe-movement-x,0px))]',
          'data-[ending-style]:[transform:translateX(100%)] data-[starting-style]:[transform:translateX(100%)]',
          'after:inset-y-0 after:left-full after:w-full',
        ],
        left: [
          'inset-y-0 left-0 border-r',
          '[transform:translateX(var(--drawer-swipe-movement-x,0px))]',
          'data-[ending-style]:[transform:translateX(-100%)] data-[starting-style]:[transform:translateX(-100%)]',
          'after:inset-y-0 after:right-full after:w-full',
        ],
      },
      /**
       * Width of a `left`/`right` drawer. A `top`/`bottom` drawer spans the viewport, so the size
       * classes are compound variants that only apply to the sides.
       */
      size: {
        md: '',
        half: '',
      },
    },
    compoundVariants: [
      { direction: ['left', 'right'], size: 'md', class: 'w-3/4 sm:max-w-sm' },
      { direction: ['left', 'right'], size: 'half', class: 'max-sm:w-full sm:w-1/2' },
    ],
    defaultVariants: {
      direction: 'bottom',
      size: 'md',
    },
  }
);

type DrawerContentProps = DrawerPrimitive.Popup.Props &
  SharedProps &
  Omit<VariantProps<typeof drawerContentVariants>, 'direction'> &
  Pick<FixedPositionContentProps, 'container' | 'showOverlay'>;

function DrawerContent({
  className,
  children,
  testId,
  container,
  showOverlay = true,
  size,
  ...props
}: DrawerContentProps) {
  const direction = React.useContext(DrawerDirectionContext);
  const modal = React.useContext(DrawerModalContext);
  const rootContainer = React.useContext(DrawerContainerContext);
  const explicitContainer = container ?? rootContainer;
  const portalContainer = usePortalContainer();

  return (
    <DrawerPortal container={explicitContainer ?? portalContainer}>
      {/* Like vaul, a non-modal drawer has no overlay: it would block the page it leaves usable. */}
      {showOverlay && modal === true ? <DrawerOverlay /> : null}
      {/* Base UI's swipe and snap point handling lives on the viewport. It lets clicks through to the
          page or overlay; an explicit container gets an `absolute` viewport so the drawer stays in it. */}
      <DrawerPrimitive.Viewport
        className={cn('pointer-events-none inset-0 z-50', explicitContainer ? 'absolute' : 'fixed')}
        data-slot="drawer-viewport"
      >
        <DrawerPrimitive.Popup
          aria-modal={modal === true ? true : undefined}
          className={cn(drawerContentVariants({ direction, size }), className)}
          data-direction={direction}
          data-slot="drawer-content"
          data-testid={testId}
          {...props}
        >
          {/* Outside `DrawerPrimitive.Content`, so a mouse can drag the drawer by its handle. */}
          {direction === 'bottom' ? (
            <div
              aria-hidden
              className="mx-auto mt-4 h-2 w-[100px] shrink-0 rounded-full bg-surface-subtle"
              data-slot="drawer-handle"
            />
          ) : null}
          {/* Lets a mouse select text in the drawer instead of dragging it (touch still swipes).
              `contents` keeps the children laid out by the panel's own flex column, as before. */}
          <DrawerPrimitive.Content className="contents">{children}</DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  );
}

type DrawerHeaderProps = React.ComponentProps<'div'>;

function DrawerHeader({ className, ...props }: DrawerHeaderProps) {
  return <div className={cn('flex flex-col gap-1.5 p-4', className)} data-slot="drawer-header" {...props} />;
}

type DrawerFooterProps = React.ComponentProps<'div'>;

function DrawerFooter({ className, ...props }: DrawerFooterProps) {
  return <div className={cn('mt-auto flex flex-col gap-2 p-4', className)} data-slot="drawer-footer" {...props} />;
}

type DrawerTitleProps = DrawerPrimitive.Title.Props;

function DrawerTitle({ className, ...props }: DrawerTitleProps) {
  return (
    <DrawerPrimitive.Title
      className={cn('text-foreground text-heading-md', className)}
      data-slot="drawer-title"
      {...props}
    />
  );
}

type DrawerDescriptionProps = DrawerPrimitive.Description.Props;

function DrawerDescription({ className, ...props }: DrawerDescriptionProps) {
  return (
    <DrawerPrimitive.Description
      className={cn('text-body text-subtle', className)}
      data-slot="drawer-description"
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerClose,
  type DrawerCloseProps,
  DrawerContent,
  type DrawerContentProps,
  DrawerDescription,
  type DrawerDescriptionProps,
  type DrawerDirection,
  DrawerFooter,
  type DrawerFooterProps,
  DrawerHeader,
  type DrawerHeaderProps,
  DrawerOverlay,
  type DrawerOverlayProps,
  DrawerPortal,
  type DrawerPortalProps,
  type DrawerProps,
  DrawerTitle,
  type DrawerTitleProps,
  DrawerTrigger,
  type DrawerTriggerProps,
};
