'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { useRender } from '@base-ui/react/use-render';
import React from 'react';

import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';

type PopoverAnchorContextType = {
  anchorRef: React.RefObject<Element | null>;
  setHasAnchor: (hasAnchor: boolean) => void;
  hasAnchor: boolean;
};

const PopoverAnchorContext = React.createContext<PopoverAnchorContextType | undefined>(undefined);

type Side = 'top' | 'bottom' | 'left' | 'right';
type Align = 'start' | 'center' | 'end';

type PopoverProps = PopoverPrimitive.Root.Props & SharedProps;

function Popover({ children, testId, ...props }: PopoverProps) {
  const anchorRef = React.useRef<Element | null>(null);
  const [hasAnchor, setHasAnchor] = React.useState(false);

  const anchorCtx = React.useMemo<PopoverAnchorContextType>(
    () => ({ anchorRef, setHasAnchor, hasAnchor }),
    [hasAnchor]
  );

  return (
    <PopoverAnchorContext.Provider value={anchorCtx}>
      <PopoverPrimitive.Root data-slot="popover" data-testid={testId} {...props}>
        {children}
      </PopoverPrimitive.Root>
    </PopoverAnchorContext.Provider>
  );
}

type PopoverTriggerProps = PopoverPrimitive.Trigger.Props & SharedProps;

function PopoverTrigger({ className, testId, ...props }: PopoverTriggerProps) {
  return (
    <PopoverPrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="popover-trigger"
      data-testid={testId}
      {...props}
    />
  );
}

type PopoverContentProps = PopoverPrimitive.Popup.Props &
  SharedProps &
  Pick<PortalContentProps, 'container'> & {
    side?: Side;
    align?: Align;
    sideOffset?: number;
    alignOffset?: number;
    /** `fixed` (default) keeps the popup on-screen on open so scrolling content can't jump the page. */
    positionMethod?: 'absolute' | 'fixed';
    /** Keep the popup within its collision boundary when the anchor scrolls out of view. */
    sticky?: boolean;
    /** Space to maintain from the edge of the collision boundary. */
    collisionPadding?: PopoverPrimitive.Positioner.Props['collisionPadding'];
    /** Element/rect the popup is confined to (defaults to the clipping ancestors). */
    collisionBoundary?: PopoverPrimitive.Positioner.Props['collisionBoundary'];
    /** How the popup avoids collisions; set sides to `'none'` to make it track the anchor and clip instead of repositioning. */
    collisionAvoidance?: PopoverPrimitive.Positioner.Props['collisionAvoidance'];
  };

function PopoverContent({
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  alignOffset,
  children,
  testId,
  container,
  positionMethod = 'fixed',
  sticky,
  collisionPadding,
  collisionBoundary,
  collisionAvoidance,
  ...props
}: PopoverContentProps) {
  const portalContainer = usePortalContainer();
  const anchorCtx = React.useContext(PopoverAnchorContext);

  return (
    <PopoverPrimitive.Portal container={container ?? portalContainer} data-slot="popover-portal">
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        {...(anchorCtx?.hasAnchor && anchorCtx.anchorRef.current ? { anchor: anchorCtx.anchorRef } : {})}
        className="z-50"
        collisionAvoidance={collisionAvoidance}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        positionMethod={positionMethod}
        side={side}
        sideOffset={sideOffset}
        sticky={sticky}
      >
        <PopoverPrimitive.Popup
          className={cn(
            '!border-input w-72 origin-(--transform-origin) rounded-lg border bg-popover p-4 text-popover-foreground shadow-md outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none',
            className
          )}
          data-slot="popover-content"
          data-testid={testId}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

type PopoverHeaderProps = React.ComponentProps<'div'> & SharedProps;

function PopoverHeader({ className, testId, ...props }: PopoverHeaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-1.5', className)}
      data-slot="popover-header"
      data-testid={testId}
      {...props}
    />
  );
}

type PopoverTitleProps = PopoverPrimitive.Title.Props & SharedProps;

function PopoverTitle({ className, testId, ...props }: PopoverTitleProps) {
  return (
    <PopoverPrimitive.Title
      className={cn('text-heading-xs', className)}
      data-slot="popover-title"
      data-testid={testId}
      {...props}
    />
  );
}

type PopoverDescriptionProps = PopoverPrimitive.Description.Props & SharedProps;

function PopoverDescription({ className, testId, ...props }: PopoverDescriptionProps) {
  return (
    <PopoverPrimitive.Description
      className={cn('text-body text-muted-foreground', className)}
      data-slot="popover-description"
      data-testid={testId}
      {...props}
    />
  );
}

type PopoverAnchorProps = useRender.ComponentProps<'div'> & SharedProps;

function PopoverAnchor({ render, testId, ...props }: PopoverAnchorProps) {
  const ctx = React.useContext(PopoverAnchorContext);

  const setRef = React.useCallback(
    (node: Element | null) => {
      if (ctx) {
        ctx.anchorRef.current = node;
        ctx.setHasAnchor(Boolean(node));
      }
    },
    [ctx]
  );

  const dataProps = { 'data-slot': 'popover-anchor', 'data-testid': testId } as React.HTMLAttributes<HTMLDivElement>;

  return useRender({
    render: render ?? <div />,
    ref: setRef as React.Ref<HTMLDivElement>,
    props: mergeProps<'div'>(dataProps, props),
  });
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  PopoverAnchor,
  type PopoverProps,
  type PopoverTriggerProps,
  type PopoverContentProps,
  type PopoverHeaderProps,
  type PopoverTitleProps,
  type PopoverDescriptionProps,
  type PopoverAnchorProps,
};
