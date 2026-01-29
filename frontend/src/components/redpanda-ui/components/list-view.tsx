/**
 * ListView Component
 *
 * A controlled design system component for displaying items in a horizontal list layout.
 * Features three slots with different overflow/priority handling:
 * - Start: Primary content (title, description, metadata)
 * - Intermediary: Secondary content (badges, tags), hidden on small screens
 * - End: Single action (switch, button, icon button)
 *
 * ## Action Guidelines
 * Each ListView item should have AT MOST one interactive action:
 * - Place the action in the End slot (e.g., Switch, Button, IconButton)
 * - OR make the entire ListView item pressable (use `interactive` variant)
 * - Never nest multiple buttons/inputs within a single ListView item
 *
 * String children are automatically wrapped in appropriate Typography components.
 * Use ListViewGroup to group multiple ListView items together with shared borders.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { Heading, Text } from './typography';
import { cn, type SharedProps } from '../lib/utils';

const listViewVariants = cva(
  [
    // Grid layout: [start (shrinkable)] [intermediary] [end (right-aligned in remaining space)]
    'grid grid-cols-[minmax(40%,2fr)_2fr_1fr] items-center',
    // Visual styling matching Card component
    'bg-background',
    // Transition for hover states
    'transition-colors',
  ],
  {
    variants: {
      size: {
        sm: 'gap-3 px-4 py-3',
        md: 'gap-4 px-5 py-4',
        lg: 'gap-6 px-6 py-5',
      },
      variant: {
        standard: '',
        elevated: 'rounded-lg shadow-elevated',
        outlined: '!border-border rounded-lg border',
        ghost: '!border-0 bg-transparent shadow-none',
        // Grouped variant for use within ListViewGroup - dividers between items
        grouped: '[&:not(:first-child)]:border-border [&:not(:first-child)]:border-t',
      },
      interactive: {
        true: 'hover:bg-surface-subtle',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'grouped',
      interactive: false,
    },
  }
);

const listViewStartVariants = cva(
  [
    // Grid column 1: takes available space, allows truncation
    'col-start-1 flex min-w-0 flex-col',
  ],
  {
    variants: {
      gap: {
        none: '',
        sm: 'gap-0.5',
        md: 'gap-1',
        lg: 'gap-1.5',
      },
    },
    defaultVariants: {
      gap: 'sm',
    },
  }
);

const listViewIntermediaryVariants = cva(
  [
    // Grid column 2: auto width, left-aligned, hidden on small screens
    'col-start-2 hidden items-center lg:flex',
  ],
  {
    variants: {
      gap: {
        none: '',
        sm: 'gap-1',
        md: 'gap-2',
        lg: 'gap-3',
      },
    },
    defaultVariants: {
      gap: 'sm',
    },
  }
);

const listViewEndVariants = cva(
  [
    // Grid column 3: auto width, right-aligned
    'col-start-3 flex items-center justify-self-end',
  ],
  {
    variants: {
      gap: {
        none: '',
        sm: 'gap-2',
        md: 'gap-3',
        lg: 'gap-4',
      },
    },
    defaultVariants: {
      gap: 'sm',
    },
  }
);

const listViewGroupVariants = cva(
  [
    // Container for grouped ListView items
    'flex flex-col',
  ],
  {
    variants: {
      variant: {
        standard: '',
        outlined: '!border-border overflow-hidden rounded-lg border',
        elevated: 'overflow-hidden rounded-lg shadow-elevated',
        ghost: '',
      },
    },
    defaultVariants: {
      variant: 'outlined',
    },
  }
);

// ListViewGroup component - container for grouped ListView items
export interface ListViewGroupProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof listViewGroupVariants>,
    SharedProps {}

const ListViewGroup = React.forwardRef<HTMLDivElement, ListViewGroupProps>(
  ({ className, variant, testId, ...props }, ref) => (
    <div
      className={cn(listViewGroupVariants({ variant }), className)}
      data-slot="list-view-group"
      data-testid={testId}
      ref={ref}
      {...props}
    />
  )
);
ListViewGroup.displayName = 'ListViewGroup';

// ListView root component
export interface ListViewProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof listViewVariants>,
    SharedProps {}

const ListView = React.forwardRef<HTMLDivElement, ListViewProps>(
  ({ className, size, variant, interactive, testId, onClick, ...props }, ref) => {
    const isInteractive = interactive ?? onClick !== undefined;

    const handleKeyDown = onClick
      ? (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        }
      : undefined;

    return (
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: role="button" is added when onClick is present
      // biome-ignore lint/a11y/noStaticElementInteractions: role="button" is added when onClick is present
      <div
        className={cn(
          listViewVariants({ size, variant, interactive: isInteractive }),
          isInteractive && 'cursor-pointer',
          className
        )}
        data-slot="list-view"
        data-testid={testId}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        ref={ref}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        {...props}
      />
    );
  }
);
ListView.displayName = 'ListView';

// Start slot - primary content, left-aligned
// Supports title/description slots with automatic string wrapping
export interface ListViewStartProps
  extends Omit<React.ComponentProps<'div'>, 'title'>,
    VariantProps<typeof listViewStartVariants>,
    SharedProps {
  /** Title content - strings wrapped in Heading, shown in first row */
  title?: React.ReactNode;
  /** Description content - strings wrapped in muted Text, shown in second row */
  description?: React.ReactNode;
}

const ListViewStart = React.forwardRef<HTMLDivElement, ListViewStartProps>(
  ({ className, gap, testId, title, description, children, ...props }, ref) => {
    // If title/description slots are provided, render structured layout
    const hasSlots = title !== undefined || description !== undefined;

    return (
      <div
        className={cn(listViewStartVariants({ gap }), className)}
        data-slot="list-view-start"
        data-testid={testId}
        ref={ref}
        {...props}
      >
        {hasSlots ? (
          <>
            {title !== undefined && (
              <div className="flex min-w-0 items-center gap-2">
                {typeof title === 'string' ? (
                  <Heading as="h3" className="truncate" level={4}>
                    {title}
                  </Heading>
                ) : (
                  title
                )}
              </div>
            )}
            {description !== undefined && (
              <div className="min-w-0 truncate">
                {typeof description === 'string' ? (
                  <Text className="truncate" variant="muted">
                    {description}
                  </Text>
                ) : (
                  description
                )}
              </div>
            )}
          </>
        ) : (
          children
        )}
      </div>
    );
  }
);
ListViewStart.displayName = 'ListViewStart';

// Intermediary slot - secondary content, left-aligned, hidden on mobile
export interface ListViewIntermediaryProps
  extends Omit<React.ComponentProps<'div'>, 'children'>,
    VariantProps<typeof listViewIntermediaryVariants>,
    SharedProps {
  children?: React.ReactNode;
}

const ListViewIntermediary = React.forwardRef<HTMLDivElement, ListViewIntermediaryProps>(
  ({ className, gap, testId, children, ...props }, ref) => (
    <div
      className={cn(listViewIntermediaryVariants({ gap }), className)}
      data-slot="list-view-intermediary"
      data-testid={testId}
      ref={ref}
      {...props}
    >
      {typeof children === 'string' ? (
        <Text className="truncate" variant="muted">
          {children}
        </Text>
      ) : (
        children
      )}
    </div>
  )
);
ListViewIntermediary.displayName = 'ListViewIntermediary';

// End slot - right-aligned, always visible, single action
export interface ListViewEndProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof listViewEndVariants>,
    SharedProps {}

const ListViewEnd = React.forwardRef<HTMLDivElement, ListViewEndProps>(({ className, gap, testId, ...props }, ref) => (
  <div
    className={cn(listViewEndVariants({ gap }), className)}
    data-slot="list-view-end"
    data-testid={testId}
    ref={ref}
    {...props}
  />
));
ListViewEnd.displayName = 'ListViewEnd';

export { ListView, ListViewGroup, ListViewStart, ListViewIntermediary, ListViewEnd };
