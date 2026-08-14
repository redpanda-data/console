import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

// Maps a card title level (1–4) to its heading utility class (literals so Tailwind can scan them).
const CARD_HEADING_CLASS = {
  1: 'text-heading-xl',
  2: 'text-heading-lg',
  3: 'text-heading-md',
  4: 'text-heading-sm',
} as const;

const cardVariants = cva('flex min-w-0 flex-col rounded-lg border border-border border-solid bg-card', {
  variants: {
    size: {
      sm: 'max-w-sm gap-2 px-6 py-4',
      md: 'max-w-md gap-4 px-8 py-6',
      lg: 'max-w-lg gap-4 px-10 py-8',
      xl: 'max-w-xl gap-6 px-12 py-10',
      full: 'w-full gap-4 px-8 py-6',
    },
    variant: {
      standard: '',
      elevated: 'shadow-elevated',
      outlined: 'border-1',
      ghost: 'border-0 bg-transparent shadow-none dark:bg-transparent',
    },
  },
  defaultVariants: {
    size: 'md',
    variant: 'elevated',
  },
});

export type CardVariant = VariantProps<typeof cardVariants>['variant'];
export type CardSize = VariantProps<typeof cardVariants>['size'];

export type CardProps = SharedProps &
  React.ComponentProps<'div'> & {
    size?: CardSize;
    variant?: CardVariant;
  };

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, size, variant, testId, ...props }, ref) => (
  <div
    className={cn(cardVariants({ size, variant }), className)}
    data-size={size}
    data-slot="card"
    data-testid={testId}
    data-variant={variant}
    ref={ref}
    {...props}
  />
));

Card.displayName = 'Card';

const cardHeaderVariants = cva(
  '@container/card-header grid auto-rows-min items-start has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-6',
  {
    variants: {
      spacing: {
        tight: 'gap-1',
        normal: 'gap-1.5',
        loose: 'gap-2',
      },
      padding: {
        none: '',
        sm: 'px-3',
        md: 'px-6',
        lg: 'px-8',
      },
    },
    defaultVariants: {
      spacing: 'normal',
      padding: 'none',
    },
  }
);

interface CardHeaderProps extends React.ComponentProps<'div'>, VariantProps<typeof cardHeaderVariants>, SharedProps {}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, spacing, padding, testId, ...props }, ref) => (
    <div
      className={cn(cardHeaderVariants({ spacing, padding }), className)}
      data-slot="card-header"
      data-testid={testId}
      ref={ref}
      {...props}
    />
  )
);

CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentProps<'div'> & SharedProps & { level?: 1 | 2 | 3 | 4 }
>(({ className, level = 4, testId, children, ...props }, ref) => {
  let content: React.ReactNode = null;
  if (children) {
    const HeadingTag = `h${level}` as const;
    content =
      typeof children === 'string' ? (
        <HeadingTag className={CARD_HEADING_CLASS[level]}>{children}</HeadingTag>
      ) : (
        children
      );
  }

  return (
    <div className={className} data-slot="card-title" data-testid={testId} ref={ref} {...props}>
      {content}
    </div>
  );
});

CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & SharedProps>(
  ({ className, testId, children, ...props }, ref) => {
    let content: React.ReactNode = null;
    if (children) {
      content = typeof children === 'string' ? <div className="text-body">{children}</div> : children;
    }

    return (
      <div
        className={cn('text-muted-foreground text-sm', className)}
        data-slot="card-description"
        data-testid={testId}
        ref={ref}
        {...props}
      >
        {content}
      </div>
    );
  }
);

CardDescription.displayName = 'CardDescription';

const CardAction = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & SharedProps>(
  ({ className, testId, ...props }, ref) => (
    <div
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      data-slot="card-action"
      data-testid={testId}
      ref={ref}
      {...props}
    />
  )
);

CardAction.displayName = 'CardAction';

const cardContentVariants = cva('', {
  variants: {
    padding: {
      none: '',
      sm: 'px-3',
      md: 'px-6',
      lg: 'px-8',
    },
    space: {
      none: '',
      sm: 'space-y-2',
      md: 'space-y-4',
      lg: 'space-y-6',
    },
  },
  defaultVariants: {
    padding: 'none',
    space: 'md',
  },
});

interface CardContentProps extends React.ComponentProps<'div'>, VariantProps<typeof cardContentVariants>, SharedProps {}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, padding, space, testId, ...props }, ref) => (
    <div
      className={cn(cardContentVariants({ padding, space }), className)}
      data-slot="card-content"
      data-testid={testId}
      ref={ref}
      {...props}
    />
  )
);

CardContent.displayName = 'CardContent';

const cardFooterVariants = cva('flex items-center [.border-t]:pt-6', {
  variants: {
    direction: {
      row: 'flex-row',
      column: 'flex-col',
    },
    justify: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      between: 'justify-between',
      around: 'justify-around',
    },
    gap: {
      none: '',
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
    },
    padding: {
      none: '',
      sm: 'px-3',
      md: 'px-6',
      lg: 'px-8',
    },
  },
  defaultVariants: {
    direction: 'row',
    justify: 'between',
    gap: 'sm',
    padding: 'none',
  },
});

interface CardFooterProps extends React.ComponentProps<'div'>, VariantProps<typeof cardFooterVariants>, SharedProps {}

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, direction, justify, gap, padding, testId, ...props }, ref) => (
    <div
      className={cn(cardFooterVariants({ direction, justify, gap, padding }), className)}
      data-slot="card-footer"
      data-testid={testId}
      ref={ref}
      {...props}
    />
  )
);

CardFooter.displayName = 'CardFooter';

const cardFormVariants = cva('grid w-full items-center', {
  variants: {
    gap: {
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
    },
  },
  defaultVariants: {
    gap: 'md',
  },
});

interface CardFormProps extends React.ComponentProps<'div'>, VariantProps<typeof cardFormVariants>, SharedProps {}

const CardForm = React.forwardRef<HTMLDivElement, CardFormProps>(({ className, gap, testId, ...props }, ref) => (
  <div className={cn(cardFormVariants({ gap }), className)} data-testid={testId} ref={ref} {...props} />
));

CardForm.displayName = 'CardForm';

const cardFieldVariants = cva('flex flex-col', {
  variants: {
    spacing: {
      tight: 'space-y-1',
      normal: 'space-y-1.5',
      loose: 'space-y-2',
    },
  },
  defaultVariants: {
    spacing: 'normal',
  },
});

interface CardFieldProps extends React.ComponentProps<'div'>, VariantProps<typeof cardFieldVariants>, SharedProps {}

const CardField = React.forwardRef<HTMLDivElement, CardFieldProps>(({ className, spacing, testId, ...props }, ref) => (
  <div className={cn(cardFieldVariants({ spacing }), className)} data-testid={testId} ref={ref} {...props} />
));

CardField.displayName = 'CardField';

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent, CardForm, CardField };
