'use client';

import { PreviewCard as HoverCardPrimitive } from '@base-ui/react/preview-card';

import { cn, type SharedProps } from '../lib/utils';

type HoverCardProps = HoverCardPrimitive.Root.Props & SharedProps;

function HoverCard({ children, testId, ...props }: HoverCardProps) {
  return (
    <HoverCardPrimitive.Root data-slot="hover-card" data-testid={testId} {...props}>
      {children}
    </HoverCardPrimitive.Root>
  );
}

type HoverCardTriggerProps = HoverCardPrimitive.Trigger.Props & SharedProps;

function HoverCardTrigger({ testId, ...props }: HoverCardTriggerProps) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" data-testid={testId} {...props} />;
}

type HoverCardContentProps = HoverCardPrimitive.Popup.Props &
  SharedProps &
  Pick<HoverCardPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> & {
    /** Container element for inline rendering (no portal to body) */
    container?: HTMLElement;
  };

function HoverCardContent({
  className,
  align = 'center',
  side = 'bottom',
  sideOffset = 4,
  alignOffset = 4,
  children,
  testId,
  container,
  ...props
}: HoverCardContentProps) {
  return (
    <HoverCardPrimitive.Portal container={container} data-slot="hover-card-portal">
      <HoverCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
        side={side}
        sideOffset={sideOffset}
      >
        <HoverCardPrimitive.Popup
          className={cn(
            'w-64 origin-(--transform-origin) rounded-lg border bg-popover p-4 text-popover-foreground shadow-md outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none',
            className
          )}
          data-slot="hover-card-content"
          data-testid={testId}
          {...props}
        >
          {children}
        </HoverCardPrimitive.Popup>
      </HoverCardPrimitive.Positioner>
    </HoverCardPrimitive.Portal>
  );
}

export {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  type HoverCardProps,
  type HoverCardTriggerProps,
  type HoverCardContentProps,
};
