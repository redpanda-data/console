'use client';

import * as TooltipPrimitive from '@ui-sdk/react/tooltip';
import React from 'react';

import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';

type Side = 'top' | 'bottom' | 'left' | 'right';
type Align = 'start' | 'center' | 'end';

type TooltipProviderProps = { children?: React.ReactNode; delayDuration?: number };
const TooltipDelayContext = React.createContext(150);
function TooltipProvider({ delayDuration = 150, children }: TooltipProviderProps) {
  return <TooltipDelayContext.Provider value={delayDuration}>{children}</TooltipDelayContext.Provider>;
}
type TooltipProps = React.ComponentProps<typeof TooltipPrimitive.Tooltip> & SharedProps & { delayDuration?: number };
const TooltipOpenContext = React.createContext(false);
function Tooltip({
  testId: _testId,
  delayDuration,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  ...props
}: TooltipProps) {
  const delay = React.useContext(TooltipDelayContext);
  const [localOpen, setOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? localOpen;
  return (
    <TooltipOpenContext.Provider value={open}>
      <TooltipPrimitive.Tooltip
        delay={delayDuration ?? delay}
        closeDelay={0}
        open={open}
        onOpenChange={(next, details) => {
          onOpenChange?.(next, details);
          if (!details.canceled) setOpen(next);
        }}
        {...props}
      />
    </TooltipOpenContext.Provider>
  );
}
type TooltipTriggerProps = React.ComponentProps<typeof TooltipPrimitive.TooltipTrigger> & SharedProps;
function TooltipTrigger({ testId, ...props }: TooltipTriggerProps) {
  return <TooltipPrimitive.TooltipTrigger data-testid={testId} {...props} />;
}

type TooltipContentProps = Omit<React.ComponentProps<typeof TooltipPrimitive.TooltipContent>, 'children'> & {
  children?: React.ReactNode;
} & SharedProps &
  Pick<PortalContentProps, 'container'> & {
    arrow?: boolean;
    side?: Side;
    align?: Align;
    sideOffset?: number;
    alignOffset?: number;
  };

function TooltipContent({
  className,
  side = 'top',
  align = 'center',
  sideOffset = 4,
  alignOffset,
  arrow = true,
  children,
  testId,
  container,
  ...props
}: TooltipContentProps) {
  const portalContainer = usePortalContainer();
  const open = React.useContext(TooltipOpenContext);
  if (!open) return null;

  return (
    <TooltipPrimitive.TooltipContent
      container={container ?? portalContainer}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      className={cn(
        'relative w-fit max-w-xs origin-(--transform-origin) text-balance rounded-md bg-primary px-3 py-1.5 text-body text-primary-foreground shadow-md transition-[opacity,transform] data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none',
        className
      )}
      data-slot="tooltip-content"
      data-testid={testId}
      {...props}
    >
      {children}

      {arrow ? (
        <TooltipPrimitive.TooltipArrow
          className="z-50 size-2.5 rotate-45 rounded-[2px] bg-primary fill-primary data-[side=bottom]:top-0 data-[side=left]:right-0 data-[side=top]:bottom-0 data-[side=right]:left-0 data-[side=left]:translate-x-1/2 data-[side=right]:-translate-x-1/2 data-[side=bottom]:-translate-y-1/2 data-[side=top]:translate-y-1/2"
          data-slot="tooltip-content-arrow"
        />
      ) : null}
    </TooltipPrimitive.TooltipContent>
  );
}

export {
  Tooltip,
  TooltipContent,
  type TooltipContentProps,
  type TooltipProps,
  TooltipProvider,
  type TooltipProviderProps,
  TooltipTrigger,
  type TooltipTriggerProps,
};
