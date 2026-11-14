'use client';

// Copyright 2026 Redpanda Data, Inc.

import * as PopoverPrimitive from '@ui-sdk/react/popover';
import { mergeProps, renderElement, type PartProps } from '@ui-sdk/react/primitive';
import React from 'react';

import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type SharedProps } from '../lib/utils';

interface PopoverAnchorContextType {
  anchor: Element | null;
  setAnchor: (anchor: Element | null) => void;
}

const PopoverAnchorContext = React.createContext<PopoverAnchorContextType | undefined>(undefined);

type PopoverProps = React.ComponentProps<typeof PopoverPrimitive.Popover> & SharedProps;

function Popover({ children, testId, ...props }: PopoverProps) {
  const [anchor, setAnchor] = React.useState<Element | null>(null);

  const anchorCtx = React.useMemo<PopoverAnchorContextType>(() => ({ anchor, setAnchor }), [anchor]);

  return (
    <PopoverAnchorContext.Provider value={anchorCtx}>
      <PopoverPrimitive.Popover data-slot="popover" data-testid={testId} {...props}>
        {children}
      </PopoverPrimitive.Popover>
    </PopoverAnchorContext.Provider>
  );
}

type PopoverTriggerProps = React.ComponentProps<typeof PopoverPrimitive.PopoverTrigger> & SharedProps;

function PopoverTrigger({ className, testId, ...props }: PopoverTriggerProps) {
  return (
    <PopoverPrimitive.PopoverTrigger
      className={cn('cursor-pointer', className)}
      data-slot="popover-trigger"
      data-testid={testId}
      {...props}
    />
  );
}

type PopoverContentProps = Omit<React.ComponentProps<typeof PopoverPrimitive.PopoverContent>, 'children'> &
  SharedProps & { children?: React.ReactNode };
function PopoverContent({
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  testId,
  container,
  ...props
}: PopoverContentProps) {
  const portalContainer = usePortalContainer();
  const anchor = React.useContext(PopoverAnchorContext)?.anchor;
  return (
    <PopoverPrimitive.PopoverContent
      align={align}
      side={side}
      sideOffset={sideOffset}
      anchor={anchor ?? undefined}
      container={container ?? portalContainer}
      className={cn(
        'z-50 w-72 origin-(--transform-origin) rounded-lg border border-input bg-popover p-4 text-popover-foreground shadow-md outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none',
        className
      )}
      data-testid={testId}
      {...props}
    />
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

type PopoverTitleProps = React.ComponentProps<typeof PopoverPrimitive.PopoverTitle> & SharedProps;

function PopoverTitle({ className, testId, ...props }: PopoverTitleProps) {
  return (
    <PopoverPrimitive.PopoverTitle
      className={cn('text-heading-xs', className)}
      data-slot="popover-title"
      data-testid={testId}
      {...props}
    />
  );
}

type PopoverDescriptionProps = React.ComponentProps<typeof PopoverPrimitive.PopoverDescription> & SharedProps;

function PopoverDescription({ className, testId, ...props }: PopoverDescriptionProps) {
  return (
    <PopoverPrimitive.PopoverDescription
      className={cn('text-body text-subtle', className)}
      data-slot="popover-description"
      data-testid={testId}
      {...props}
    />
  );
}

type PopoverAnchorProps = PartProps<'div'> & SharedProps;

function PopoverAnchor({ render, testId, ...props }: PopoverAnchorProps) {
  const setAnchor = React.useContext(PopoverAnchorContext)?.setAnchor;

  const setRef = React.useCallback(
    (node: Element | null) => {
      setAnchor?.(node);
    },
    [setAnchor]
  );

  const dataProps = { 'data-slot': 'popover-anchor', 'data-testid': testId } as React.HTMLAttributes<HTMLDivElement>;

  return renderElement('div', mergeProps(dataProps, props, { ref: setRef }), render ?? <div />);
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
