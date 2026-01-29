/**
 * ListCard Component
 *
 * A reusable card component designed for displaying items in a list/grid of cards.
 * Provides slot-based composition with proper truncation handling.
 * Wraps string children in appropriate Typography components.
 *
 * ## Slots
 * - ListCardHeader: Title row with start/end slots
 * - ListCardMeta: Secondary info below header
 * - ListCardBody: Main content area
 * - ListCardDescription: Truncated description text
 * - ListCardFooter: Bottom section with start/end slots for actions
 *
 * ## Action Guidelines
 * Each ListCard should have AT MOST one interactive action:
 * - Place the action in ListCardFooter's start or end slot (e.g., Switch, Button)
 * - OR make the entire card pressable (wrap in a link/button)
 * - Never nest multiple buttons/inputs within a single ListCard
 *
 * Composes underlying Card components from the design system.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { Card, CardContent, CardFooter, CardHeader, type CardSize, type CardVariant } from './card';
import { Heading, Text } from './typography';
import { cn, type SharedProps, wrapStringChild } from '../lib/utils';

// ListCard root - thin wrapper around Card with list-appropriate defaults
export interface ListCardProps extends React.ComponentProps<'div'>, SharedProps {
  size?: CardSize;
  variant?: CardVariant;
  children: React.ReactNode;
}

const ListCard = React.forwardRef<HTMLDivElement, ListCardProps>(
  ({ className, size = 'sm', variant = 'outlined', children, testId, onClick, ...props }, ref) => {
    const isClickable = onClick !== undefined;

    return (
      <Card
        className={cn('h-full', isClickable && 'cursor-pointer transition-colors hover:bg-surface-subtle', className)}
        onClick={onClick}
        ref={ref}
        size={size}
        testId={testId}
        variant={variant}
        {...props}
      >
        {children}
      </Card>
    );
  }
);
ListCard.displayName = 'ListCard';

// ListCardHeader - horizontal layout with start/end slots and title
const listCardHeaderVariants = cva('flex min-w-0 items-center gap-2', {
  variants: {
    spacing: {
      tight: 'pb-1',
      normal: 'pb-2',
      loose: 'pb-3',
    },
  },
  defaultVariants: {
    spacing: 'normal',
  },
});

export interface ListCardHeaderProps
  extends Omit<React.ComponentProps<'div'>, 'children'>,
    VariantProps<typeof listCardHeaderVariants>,
    SharedProps {
  /** Content at the start of the header (e.g., icon, badge) */
  start?: React.ReactNode;
  /** Content at the end of the header (e.g., context info, badge) */
  end?: React.ReactNode;
  /** Title content - strings are wrapped in Heading */
  children?: React.ReactNode;
}

const ListCardHeader = React.forwardRef<HTMLDivElement, ListCardHeaderProps>(
  ({ className, spacing, start, end, children, testId, ...props }, ref) => (
    <CardHeader
      className={cn(listCardHeaderVariants({ spacing }), className)}
      data-slot="list-card-header"
      ref={ref}
      testId={testId}
      {...props}
    >
      {start}
      <div className="min-w-0 flex-1 truncate">
        {wrapStringChild(children, ({ children: c, className: cls }) => (
          <Heading as="h3" className={cn('truncate', cls)} level={4}>
            {c}
          </Heading>
        ))}
      </div>
      {end !== undefined && <div className="shrink-0">{end}</div>}
    </CardHeader>
  )
);
ListCardHeader.displayName = 'ListCardHeader';

// ListCardMeta - secondary info row below header
const listCardMetaVariants = cva('flex min-w-0 items-center gap-2', {
  variants: {
    spacing: {
      tight: 'mt-0.5',
      normal: 'mt-1',
      loose: 'mt-1.5',
    },
  },
  defaultVariants: {
    spacing: 'normal',
  },
});

export interface ListCardMetaProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof listCardMetaVariants>,
    SharedProps {
  children: React.ReactNode;
}

const ListCardMeta = React.forwardRef<HTMLDivElement, ListCardMetaProps>(
  ({ className, spacing, children, testId, ...props }, ref) => (
    <div
      className={cn(listCardMetaVariants({ spacing }), className)}
      data-slot="list-card-meta"
      data-testid={testId}
      ref={ref}
      {...props}
    >
      {wrapStringChild(children, ({ children: c, className: cls }) => (
        <Text as="span" className={cn('truncate', cls)} variant="labelXSmall">
          {c}
        </Text>
      ))}
    </div>
  )
);
ListCardMeta.displayName = 'ListCardMeta';

// ListCardBody - main content area with optional description
const listCardBodyVariants = cva('min-w-0', {
  variants: {
    spacing: {
      tight: 'space-y-2',
      normal: 'space-y-3',
      loose: 'space-y-4',
    },
  },
  defaultVariants: {
    spacing: 'normal',
  },
});

export interface ListCardBodyProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof listCardBodyVariants>,
    SharedProps {
  children: React.ReactNode;
}

const ListCardBody = React.forwardRef<HTMLDivElement, ListCardBodyProps>(
  ({ className, spacing, children, testId, ...props }, ref) => (
    <CardContent
      className={cn(listCardBodyVariants({ spacing }), className)}
      data-slot="list-card-body"
      ref={ref}
      space="none"
      testId={testId}
      {...props}
    >
      {children}
    </CardContent>
  )
);
ListCardBody.displayName = 'ListCardBody';

// ListCardDescription - truncated description text
export interface ListCardDescriptionProps extends React.ComponentProps<'div'>, SharedProps {
  /** Number of lines to clamp (default: 2) */
  lines?: 1 | 2 | 3;
  children: React.ReactNode;
}

const lineClampClasses = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
};

const ListCardDescription = React.forwardRef<HTMLDivElement, ListCardDescriptionProps>(
  ({ className, lines = 2, children, testId, ...props }, ref) => (
    <div
      className={cn(lineClampClasses[lines], className)}
      data-slot="list-card-description"
      data-testid={testId}
      ref={ref}
      {...props}
    >
      {wrapStringChild(children, ({ children: c, className: cls }) => (
        <Text className={cls} variant="muted">
          {c}
        </Text>
      ))}
    </div>
  )
);
ListCardDescription.displayName = 'ListCardDescription';

// ListCardFooter - bottom section with start/end slots
const listCardFooterVariants = cva('!border-border flex min-w-0 items-center justify-between border-t', {
  variants: {
    spacing: {
      tight: '[.border-t]:pt-2',
      normal: '[.border-t]:pt-3',
      loose: '[.border-t]:pt-4',
    },
  },
  defaultVariants: {
    spacing: 'normal',
  },
});

export interface ListCardFooterProps
  extends Omit<React.ComponentProps<'div'>, 'children'>,
    VariantProps<typeof listCardFooterVariants>,
    SharedProps {
  /** Content at the start of the footer */
  start?: React.ReactNode;
  /** Content at the end of the footer */
  end?: React.ReactNode;
  /** Children rendered between start and end */
  children?: React.ReactNode;
}

const ListCardFooter = React.forwardRef<HTMLDivElement, ListCardFooterProps>(
  ({ className, spacing, start, end, children, testId, ...props }, ref) => (
    <CardFooter
      className={cn(listCardFooterVariants({ spacing }), className)}
      data-slot="list-card-footer"
      gap="sm"
      justify="between"
      ref={ref}
      testId={testId}
      {...props}
    >
      {start !== undefined && <div className="flex min-w-0 shrink-0 items-center gap-2">{start}</div>}
      {children !== undefined && <div className="min-w-0 flex-1 truncate">{children}</div>}
      {end !== undefined && <div className="shrink-0">{end}</div>}
    </CardFooter>
  )
);
ListCardFooter.displayName = 'ListCardFooter';

export { ListCard, ListCardHeader, ListCardMeta, ListCardBody, ListCardDescription, ListCardFooter };
