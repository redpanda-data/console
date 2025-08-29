import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn } from '../lib/utils';

const cardVariants = cva(
  'rounded-lg min-w-0 border border-solid bg-white border-base-200 flex flex-col shadow-shadow-elevated dark:bg-base-900 dark:border-base-800',
  {
    variants: {
      size: {
        sm: 'px-12 py-8 gap-4 max-w-sm',
        md: 'px-16 py-12 gap-5 max-w-md',
        lg: 'px-20 py-16 gap-6 max-w-lg',
        xl: 'px-24 py-20 gap-8 max-w-xl',
        full: 'px-16 py-12 gap-5 w-full',
      },
      variant: {
        default: '',
        elevated: 'shadow-lg',
        outlined: 'border-2',
        ghost: 'border-0 shadow-none bg-transparent dark:bg-transparent',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  },
);

interface CardProps extends React.ComponentProps<'div'>, VariantProps<typeof cardVariants> {
  testId?: string;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, size, variant, testId, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="card"
      data-testid={testId}
      className={cn(cardVariants({ size, variant }), className)}
      {...props}
    />
  );
});

Card.displayName = 'Card';

const cardHeaderVariants = cva(
  '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
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
  },
);

interface CardHeaderProps extends React.ComponentProps<'div'>, VariantProps<typeof cardHeaderVariants> {
  testId?: string;
}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, spacing, padding, testId, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="card-header"
        data-testid={testId}
        className={cn(cardHeaderVariants({ spacing, padding }), className)}
        {...props}
      />
    );
  },
);

CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & { testId?: string }>(
  ({ className, testId, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="card-title"
        data-testid={testId}
        className={cn('leading-none font-semibold', className)}
        {...props}
      />
    );
  },
);

CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & { testId?: string }>(
  ({ className, testId, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="card-description"
        data-testid={testId}
        className={cn('text-muted-foreground text-sm', className)}
        {...props}
      />
    );
  },
);

CardDescription.displayName = 'CardDescription';

const CardAction = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'> & { testId?: string }>(
  ({ className, testId, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="card-action"
        data-testid={testId}
        className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
        {...props}
      />
    );
  },
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

interface CardContentProps extends React.ComponentProps<'div'>, VariantProps<typeof cardContentVariants> {
  testId?: string;
}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, padding, space, testId, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="card-content"
        data-testid={testId}
        className={cn(cardContentVariants({ padding, space }), className)}
        {...props}
      />
    );
  },
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

interface CardFooterProps extends React.ComponentProps<'div'>, VariantProps<typeof cardFooterVariants> {
  testId?: string;
}

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, direction, justify, gap, padding, testId, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="card-footer"
        data-testid={testId}
        className={cn(cardFooterVariants({ direction, justify, gap, padding }), className)}
        {...props}
      />
    );
  },
);

CardFooter.displayName = 'CardFooter';

// Form-specific layout helpers
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

interface CardFormProps extends React.ComponentProps<'div'>, VariantProps<typeof cardFormVariants> {
  testId?: string;
}

const CardForm = React.forwardRef<HTMLDivElement, CardFormProps>(({ className, gap, testId, ...props }, ref) => {
  return <div ref={ref} data-testid={testId} className={cn(cardFormVariants({ gap }), className)} {...props} />;
});

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

interface CardFieldProps extends React.ComponentProps<'div'>, VariantProps<typeof cardFieldVariants> {
  testId?: string;
}

const CardField = React.forwardRef<HTMLDivElement, CardFieldProps>(({ className, spacing, testId, ...props }, ref) => {
  return <div ref={ref} data-testid={testId} className={cn(cardFieldVariants({ spacing }), className)} {...props} />;
});

CardField.displayName = 'CardField';

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent, CardForm, CardField };
