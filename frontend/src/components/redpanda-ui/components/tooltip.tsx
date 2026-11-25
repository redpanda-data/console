'use client';

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import React from 'react';
import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type PortalContentProps, type SharedProps } from '../lib/utils';
import { TooltipHoverGroup } from './tooltip/hover-group';

type Side = 'top' | 'bottom' | 'left' | 'right';
type Align = 'start' | 'center' | 'end';

type TooltipProviderProps = React.ComponentProps<typeof TooltipPrimitive.Provider> & {
  delayDuration?: number | undefined;
  skipDelayDuration?: number | undefined;
  /** Start an independent hover group, even inside another TooltipProvider. Explicit timing props also isolate. */
  isolated?: boolean | undefined;
};

interface TooltipProviderContextValue {
  closeDelay: number | undefined;
  delay: number | undefined;
  depth: number;
  group: TooltipHoverGroup;
  scope: string;
  timeout: number;
  warm: boolean;
}

const TooltipProviderContext = React.createContext<TooltipProviderContextValue | null>(null);

/**
 * Distinguishes independent hover groups from timing-free wrappers.
 * @internal
 */
function useTooltipProviderDepth() {
  return React.useContext(TooltipProviderContext)?.depth ?? 0;
}

function TooltipProvider({ delayDuration, skipDelayDuration, isolated = false, ...props }: TooltipProviderProps) {
  const parent = React.useContext(TooltipProviderContext);
  const [ownGroup] = React.useState(() => new TooltipHoverGroup());
  const scope = React.useId();
  React.useLayoutEffect(() => {
    ownGroup.activate();
    return () => {
      ownGroup.dispose();
    };
  }, [ownGroup]);
  const hasTimingOverrides =
    delayDuration !== undefined ||
    skipDelayDuration !== undefined ||
    props.delay !== undefined ||
    props.timeout !== undefined ||
    props.closeDelay !== undefined;
  const timing = { delay: delayDuration ?? 150, timeout: skipDelayDuration ?? 0, closeDelay: 0, ...props };
  const ownTimeout = timing.timeout ?? 400;
  React.useEffect(() => {
    ownGroup.configure(ownTimeout);
  }, [ownGroup, ownTimeout]);
  const context =
    parent !== null && !isolated && !hasTimingOverrides
      ? parent
      : {
          depth: (parent?.depth ?? 0) + 1,
          group: ownGroup,
          delay: timing.delay,
          closeDelay: timing.closeDelay,
          timeout: timing.timeout ?? 400,
          warm: false,
          scope,
        };
  const warm = React.useSyncExternalStore(context.group.subscribe, context.group.getSnapshot, () => false);
  // A scope switch must clear native retained warmth, not replace its provider tree.
  // Restore the configured timeout after Base UI has reconciled the zero-timeout scope.
  const [nativeGroup, setNativeGroup] = React.useState(context.group);
  const changingGroup = nativeGroup !== context.group;
  React.useLayoutEffect(() => {
    if (changingGroup) {
      setNativeGroup(context.group);
    }
  }, [changingGroup, context.group]);

  return (
    <TooltipProviderContext.Provider value={{ ...context, warm, scope }}>
      <TooltipPrimitive.Provider
        closeDelay={context.closeDelay}
        data-slot="tooltip-provider"
        delay={warm ? 0 : context.delay}
        timeout={changingGroup ? 0 : context.timeout}
      >
        {props.children}
      </TooltipPrimitive.Provider>
    </TooltipProviderContext.Provider>
  );
}

type TooltipProps = React.ComponentProps<typeof TooltipPrimitive.Root> &
  SharedProps & {
    delayDuration?: number | undefined;
  };

function Tooltip({ testId, delayDuration, onOpenChange, ...props }: TooltipProps) {
  const provider = React.useContext(TooltipProviderContext);
  const [observedOpen, setObservedOpen] = React.useState(props.defaultOpen ?? false);
  const open = props.open ?? observedOpen;
  const id = React.useId();
  const group = provider?.group;
  const scope = provider?.scope;
  const fallbackActions = React.useRef<TooltipPrimitive.Root.Actions | null>(null);
  const actions = props.actionsRef ?? fallbackActions;

  function handleOpenChange(nextOpen: boolean, details: TooltipPrimitive.Root.ChangeEventDetails) {
    onOpenChange?.(nextOpen, details);
    if (!details.isCanceled) {
      setObservedOpen(nextOpen);
    }
  }
  const closeFromGroup = React.useEffectEvent(() => {
    actions.current?.close();
  });
  React.useLayoutEffect(() => {
    if (group === undefined || scope === undefined || !open || props.disabled === true) {
      return;
    }
    group.open({ id, scope, close: closeFromGroup });
    return () => {
      group.close(id);
    };
  }, [group, id, open, props.disabled, scope]);

  return (
    <TooltipContext.Provider value={delayDuration}>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        data-testid={testId}
        {...props}
        actionsRef={actions}
        onOpenChange={handleOpenChange}
      />
    </TooltipContext.Provider>
  );
}

// Carries the root's `delayDuration` to the trigger for per-root delays.
const TooltipContext = React.createContext<number | undefined>(undefined);

type TooltipTriggerProps = React.ComponentProps<typeof TooltipPrimitive.Trigger> & SharedProps;

function TooltipTrigger({ testId, ...props }: TooltipTriggerProps) {
  // Base UI resolves delay as `trigger ?? provider ?? default`; an explicit `delay` prop still wins (spread last).
  const delayDuration = React.useContext(TooltipContext);
  const provider = React.useContext(TooltipProviderContext);
  const warm = provider?.warm ?? false;
  const triggerProps = { delay: delayDuration, ...props };
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      data-testid={testId}
      {...triggerProps}
      delay={warm ? 0 : triggerProps.delay}
    />
  );
}

type TooltipContentProps = React.ComponentProps<typeof TooltipPrimitive.Popup> &
  SharedProps &
  Pick<PortalContentProps, 'container'> & {
    arrow?: boolean | undefined;
    side?: Side | undefined;
    align?: Align | undefined;
    sideOffset?: number | undefined;
    alignOffset?: number | undefined;
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
            'relative w-fit max-w-xs origin-(--transform-origin) rounded-md bg-primary px-3 py-1.5 text-body text-balance text-primary-foreground shadow-md transition-[opacity,transform] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none',
            className
          )}
          data-slot="tooltip-content"
          data-testid={testId}
          {...props}
        >
          {children}

          {arrow ? (
            <TooltipPrimitive.Arrow
              className="z-50 size-2.5 rotate-45 rounded-[2px] bg-primary fill-primary data-[side=bottom]:top-0 data-[side=bottom]:-translate-y-1/2 data-[side=left]:right-0 data-[side=left]:translate-x-1/2 data-[side=right]:left-0 data-[side=right]:-translate-x-1/2 data-[side=top]:bottom-0 data-[side=top]:translate-y-1/2"
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
  TooltipContent,
  type TooltipContentProps,
  type TooltipProps,
  TooltipProvider,
  type TooltipProviderProps,
  TooltipTrigger,
  type TooltipTriggerProps,
  useTooltipProviderDepth,
};
