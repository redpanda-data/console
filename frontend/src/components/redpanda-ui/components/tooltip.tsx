'use client';

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import React from 'react';

import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';

type Side = 'top' | 'bottom' | 'left' | 'right';
type Align = 'start' | 'center' | 'end';

type TooltipProviderProps = React.ComponentProps<typeof TooltipPrimitive.Provider> & {
  delayDuration?: number;
  skipDelayDuration?: number;
};

function TooltipProvider({ delayDuration, skipDelayDuration, ...props }: TooltipProviderProps) {
  return (
    <TooltipPrimitive.Provider
      closeDelay={0}
      data-slot="tooltip-provider"
      delay={delayDuration ?? 150}
      timeout={skipDelayDuration ?? 0}
      {...props}
    />
  );
}

type TooltipProps = React.ComponentProps<typeof TooltipPrimitive.Root> &
  SharedProps & {
    delayDuration?: number;
  };

function Tooltip({ testId, delayDuration, ...props }: TooltipProps) {
  return (
    <TooltipContext.Provider value={delayDuration}>
      <TooltipPrimitive.Root data-slot="tooltip" data-testid={testId} {...props} />
    </TooltipContext.Provider>
  );
}

// Carries the root's `delayDuration` to the trigger for per-root delays.
const TooltipContext = React.createContext<number | undefined>(undefined);

type TooltipTriggerProps = React.ComponentProps<typeof TooltipPrimitive.Trigger> & SharedProps;

function TooltipTrigger({ testId, ...props }: TooltipTriggerProps) {
  // Base UI resolves delay as `trigger ?? provider ?? default`; an explicit `delay` prop still wins (spread last).
  const delayDuration = React.useContext(TooltipContext);
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" data-testid={testId} delay={delayDuration} {...props} />;
}

type TooltipContentProps = React.ComponentProps<typeof TooltipPrimitive.Popup> &
  SharedProps &
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

  return (
    <TooltipPrimitive.Portal container={container ?? portalContainer}>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className="z-50 data-anchor-hidden:pointer-events-none data-anchor-hidden:opacity-0"
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          className={cn(
            'relative w-fit max-w-xs origin-(--transform-origin) text-balance rounded-md bg-primary px-3 py-1.5 text-inverse text-sm shadow-md transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none',
            className
          )}
          data-slot="tooltip-content"
          data-testid={testId}
          {...props}
        >
          {children}

          {arrow ? (
            <TooltipPrimitive.Arrow
              className="z-50 size-2.5 rotate-45 rounded-[2px] bg-primary fill-primary data-[side=bottom]:top-0 data-[side=left]:right-0 data-[side=top]:bottom-0 data-[side=right]:left-0 data-[side=left]:translate-x-1/2 data-[side=right]:-translate-x-1/2 data-[side=bottom]:-translate-y-1/2 data-[side=top]:translate-y-1/2"
              data-slot="tooltip-content-arrow"
            />
          ) : null}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  type TooltipProps,
  type TooltipTriggerProps,
  type TooltipContentProps,
  type TooltipProviderProps,
};
