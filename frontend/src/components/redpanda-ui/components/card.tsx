import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn, type SharedProps } from '../lib/utils';
import { cardVariants } from './card/variants';

// Maps a card title level (1–4) to its heading utility class (literals so Tailwind can scan them).
const CARD_HEADING_CLASS = {
  1: 'text-heading-xl',
  2: 'text-heading-lg',
  3: 'text-heading-md',
  4: 'text-heading-sm',
} as const;

export type CardVariant = VariantProps<typeof cardVariants>['variant'];
export type CardSize = VariantProps<typeof cardVariants>['size'];

export type CardProps = SharedProps &
  React.ComponentProps<'div'> & {
    size?: CardSize | undefined;
    variant?: CardVariant | undefined;
    /** Edge-to-edge media or rows; inset individual parts with their padding prop. */
    padding?: VariantProps<typeof cardVariants>['padding'] | undefined;
  };

const Card = ({
  className,
  size = 'full',
  variant = 'default',
  padding,
  testId,
  ref,
  ...props
}: CardProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div
    className={cn(cardVariants({ size, variant, padding }), className)}
    data-padding={padding}
    data-size={size}
    data-slot="card"
    data-testid={testId}
    data-variant={variant}
    ref={ref}
    {...props}
  />
);

Card.displayName = 'Card';

const cardHeaderVariants = cva(
  '@container/card-header grid auto-rows-min items-start has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-6',
  {
    variants: {
      separator: {
        false: '',
        true: 'border-b border-border pb-6 [[data-slot=card][data-size=sm]>&]:pb-4',
      },
      spacing: {
        tight: 'gap-1',
        normal: 'gap-1.5',
        loose: 'gap-2',
      },
      padding: {
        none: '',
        sm: 'px-3 [[data-slot=card][data-padding=none]>&]:pt-3',
        md: 'px-6 [[data-slot=card][data-padding=none]>&]:pt-6',
        lg: 'px-8 [[data-slot=card][data-padding=none]>&]:pt-8',
      },
    },
    defaultVariants: {
      separator: false,
      spacing: 'normal',
      padding: 'none',
    },
  }
);

interface CardHeaderProps extends React.ComponentProps<'div'>, VariantProps<typeof cardHeaderVariants>, SharedProps {}

const CardHeader = ({
  className,
  spacing,
  padding,
  separator,
  testId,
  ref,
  ...props
}: CardHeaderProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div
    className={cn(cardHeaderVariants({ spacing, padding, separator }), className)}
    data-separator={separator === true ? true : undefined}
    data-slot="card-header"
    data-testid={testId}
    ref={ref}
    {...props}
  />
);

CardHeader.displayName = 'CardHeader';

const CardTitle = ({
  className,
  level = 4,
  testId,
  children,
  ref,
  ...props
}: React.ComponentProps<'div'> &
  SharedProps & { level?: 1 | 2 | 3 | 4 | undefined } & { ref?: React.Ref<HTMLHeadingElement> | undefined }) => {
  // A string child is the heading itself, so `className` lands on the element the type style is on:
  // `text-heading-*` declares size, weight, leading and family, and nothing outside can reach past those.
  if (hasSlotContent(children) && typeof children === 'string') {
    const HeadingTag = `h${level}` as const;
    return (
      <HeadingTag
        className={cn(CARD_HEADING_CLASS[level], className)}
        data-slot="card-title"
        data-testid={testId}
        ref={ref}
        {...props}
      >
        {children}
      </HeadingTag>
    );
  }

  // Any other node keeps the wrapper — a heading holds phrasing content only.
  return (
    <div className={className} data-slot="card-title" data-testid={testId} ref={ref} {...props}>
      {children}
    </div>
  );
};

CardTitle.displayName = 'CardTitle';

const CardDescription = ({
  className,
  testId,
  children,
  ref,
  ...props
}: React.ComponentProps<'div'> & SharedProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  // No inner element: a copy of `text-body` one level down would outrank the call site's own size.
  <div
    className={cn('text-body text-subtle', className)}
    data-slot="card-description"
    data-testid={testId}
    ref={ref}
    {...props}
  >
    {children}
  </div>
);

CardDescription.displayName = 'CardDescription';

const CardAction = ({
  className,
  testId,
  ref,
  ...props
}: React.ComponentProps<'div'> & SharedProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div
    className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
    data-slot="card-action"
    data-testid={testId}
    ref={ref}
    {...props}
  />
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

const CardContent = ({
  className,
  padding,
  space,
  testId,
  ref,
  ...props
}: CardContentProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div
    className={cn(cardContentVariants({ padding, space }), className)}
    data-slot="card-content"
    data-testid={testId}
    ref={ref}
    {...props}
  />
);

CardContent.displayName = 'CardContent';

const cardFooterVariants = cva('flex items-center [.border-t]:pt-6', {
  variants: {
    separator: {
      false: '',
      true: 'border-t border-border pt-6 [[data-slot=card][data-size=sm]>&]:pt-4',
    },
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
      sm: 'px-3 [[data-slot=card][data-padding=none]>&]:pb-3',
      md: 'px-6 [[data-slot=card][data-padding=none]>&]:pb-6',
      lg: 'px-8 [[data-slot=card][data-padding=none]>&]:pb-8',
    },
  },
  defaultVariants: {
    separator: false,
    direction: 'row',
    justify: 'between',
    gap: 'sm',
    padding: 'none',
  },
});

interface CardFooterProps extends React.ComponentProps<'div'>, VariantProps<typeof cardFooterVariants>, SharedProps {}

const CardFooter = ({
  className,
  direction,
  justify,
  gap,
  padding,
  separator,
  testId,
  ref,
  ...props
}: CardFooterProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div
    className={cn(cardFooterVariants({ direction, justify, gap, padding, separator }), className)}
    data-separator={separator === true ? true : undefined}
    data-slot="card-footer"
    data-testid={testId}
    ref={ref}
    {...props}
  />
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

const CardForm = ({
  className,
  gap,
  testId,
  ref,
  ...props
}: CardFormProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div className={cn(cardFormVariants({ gap }), className)} data-testid={testId} ref={ref} {...props} />
);

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

const CardField = ({
  className,
  spacing,
  testId,
  ref,
  ...props
}: CardFieldProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div className={cn(cardFieldVariants({ spacing }), className)} data-testid={testId} ref={ref} {...props} />
);

CardField.displayName = 'CardField';

export { Card, CardAction, CardContent, CardDescription, CardField, CardFooter, CardForm, CardHeader, CardTitle };
