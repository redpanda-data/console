'use client';

// Copyright 2026 Redpanda Data, Inc.

import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';
import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';

interface PopoverAnchorContextType {
  anchor: Element | null;
  setAnchor: (anchor: Element | null) => void;
}

const PopoverAnchorContext = React.createContext<PopoverAnchorContextType | undefined>(undefined);

type Side = 'top' | 'bottom' | 'left' | 'right';
type Align = 'start' | 'center' | 'end';

type PopoverProps = PopoverPrimitive.Root.Props & SharedProps;

function Popover({ children, testId, ...props }: PopoverProps) {
  const [anchor, setAnchor] = React.useState<Element | null>(null);

  const anchorCtx: PopoverAnchorContextType = { anchor, setAnchor };

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

const popoverContentVariants = cva(
  'w-72 origin-(--transform-origin) rounded-lg border !border-input bg-popover text-popover-foreground shadow-md transition-[opacity,transform] outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none',
  {
    variants: { padding: { none: 'p-0', sm: 'p-2', md: 'p-4' } },
    defaultVariants: { padding: 'md' },
  }
);

type PopoverContentProps = PopoverPrimitive.Popup.Props &
  SharedProps &
  Pick<PortalContentProps, 'container'> &
  VariantProps<typeof popoverContentVariants> & {
    side?: Side | undefined;
    align?: Align | undefined;
    sideOffset?: number | undefined;
    alignOffset?: number | undefined;
    /** `fixed` (default) keeps the popup on-screen on open so scrolling content can't jump the page. */
    positionMethod?: 'absolute' | 'fixed' | undefined;
    /** Keep the popup within its collision boundary when the anchor scrolls out of view. */
    sticky?: boolean | undefined;
    /** Space to maintain from the edge of the collision boundary. */
    collisionPadding?: PopoverPrimitive.Positioner.Props['collisionPadding'] | undefined;
    /** Element/rect the popup is confined to (defaults to the clipping ancestors). */
    collisionBoundary?: PopoverPrimitive.Positioner.Props['collisionBoundary'] | undefined;
    /** How the popup avoids collisions; set sides to `'none'` to make it track the anchor and clip instead of repositioning. */
    collisionAvoidance?: PopoverPrimitive.Positioner.Props['collisionAvoidance'] | undefined;
  };

function PopoverContent({
  className,
  align = 'center',
  padding = 'md',
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
        {...(anchorCtx?.anchor === undefined || anchorCtx.anchor === null ? {} : { anchor: anchorCtx.anchor })}
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
          className={cn(popoverContentVariants({ padding }), className)}
          data-padding={padding}
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
      className={cn('text-body text-subtle', className)}
      data-slot="popover-description"
      data-testid={testId}
      {...props}
    />
  );
}

type PopoverAnchorProps = useRender.ComponentProps<'div'> & SharedProps;

function PopoverAnchor({ render, testId, ...props }: PopoverAnchorProps) {
  const setAnchor = React.useContext(PopoverAnchorContext)?.setAnchor;

  const dataProps = { 'data-slot': 'popover-anchor', 'data-testid': testId };

  return useRender({
    render: render ?? <div />,
    ref: setAnchor,
    props: { ...props, ...dataProps },
  });
}

export {
  Popover,
  PopoverAnchor,
  type PopoverAnchorProps,
  PopoverContent,
  type PopoverContentProps,
  PopoverDescription,
  type PopoverDescriptionProps,
  PopoverHeader,
  type PopoverHeaderProps,
  type PopoverProps,
  PopoverTitle,
  type PopoverTitleProps,
  PopoverTrigger,
  type PopoverTriggerProps,
};
