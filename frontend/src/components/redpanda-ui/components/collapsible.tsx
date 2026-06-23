'use client';

import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

import { cn, type SharedProps } from '../lib/utils';

type CollapsibleProps = CollapsiblePrimitive.Root.Props & SharedProps;

function Collapsible({ testId, ...props }: CollapsibleProps) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" data-testid={testId} {...props} />;
}

type CollapsibleTriggerProps = CollapsiblePrimitive.Trigger.Props;

function CollapsibleTrigger({ className, ...props }: CollapsibleTriggerProps) {
  return (
    <CollapsiblePrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="collapsible-trigger"
      {...props}
    />
  );
}

type CollapsibleContentProps = CollapsiblePrimitive.Panel.Props & SharedProps;

function CollapsibleContent({ testId, ...props }: CollapsibleContentProps) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" data-testid={testId} {...props} />;
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  type CollapsibleProps,
  type CollapsibleTriggerProps,
  type CollapsibleContentProps,
};
