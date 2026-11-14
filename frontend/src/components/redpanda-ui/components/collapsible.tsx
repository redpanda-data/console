import type React from 'react';
('use client');

import * as CollapsiblePrimitive from '@ui-sdk/react/collapsible';

import { cn, type SharedProps } from '../lib/utils';

type CollapsibleProps = React.ComponentProps<typeof CollapsiblePrimitive.Collapsible> & SharedProps;

function Collapsible({ testId, ...props }: CollapsibleProps) {
  return <CollapsiblePrimitive.Collapsible data-slot="collapsible" data-testid={testId} {...props} />;
}

type CollapsibleTriggerProps = React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>;

function CollapsibleTrigger({ className, ...props }: CollapsibleTriggerProps) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      className={cn('cursor-pointer', className)}
      data-slot="collapsible-trigger"
      {...props}
    />
  );
}

type CollapsibleContentProps = React.ComponentProps<typeof CollapsiblePrimitive.CollapsiblePanel> & SharedProps;

function CollapsibleContent({ testId, ...props }: CollapsibleContentProps) {
  return <CollapsiblePrimitive.CollapsiblePanel data-slot="collapsible-content" data-testid={testId} {...props} />;
}

export {
  Collapsible,
  CollapsibleContent,
  type CollapsibleContentProps,
  type CollapsibleProps,
  CollapsibleTrigger,
  type CollapsibleTriggerProps,
};
