import type { VariantProps } from 'class-variance-authority';

import { cn, type SharedProps } from '../lib/utils';
import { emptyMediaVariants, emptyVariants } from './empty/variants';

export interface EmptyProps extends React.ComponentProps<'div'>, SharedProps {
  /** The component-owned surface; layout classes remain available through className. */
  variant?: NonNullable<VariantProps<typeof emptyVariants>['variant']>;
}

function Empty({ className, testId, variant = 'default', ...props }: EmptyProps) {
  return (
    <div className={cn(emptyVariants({ variant }), className)} data-slot="empty" data-testid={testId} {...props} />
  );
}

function EmptyHeader({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    <div
      className={cn('flex max-w-sm flex-col items-center gap-2 text-center', className)}
      data-slot="empty-header"
      data-testid={testId}
      {...props}
    />
  );
}

function EmptyMedia({
  className,
  testId,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & SharedProps & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      className={cn(emptyMediaVariants({ variant, className }))}
      data-slot="empty-icon"
      data-testid={testId}
      data-variant={variant}
      {...props}
    />
  );
}

function EmptyTitle({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return <div className={cn('text-heading-md', className)} data-slot="empty-title" data-testid={testId} {...props} />;
}

function EmptyDescription({ className, testId, ...props }: React.ComponentProps<'p'> & SharedProps) {
  return (
    <div
      className={cn(
        'text-body leading-relaxed text-subtle [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
        className
      )}
      data-slot="empty-description"
      data-testid={testId}
      {...props}
    />
  );
}

function EmptyContent({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    <div
      className={cn('flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-body text-balance', className)}
      data-slot="empty-content"
      data-testid={testId}
      {...props}
    />
  );
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
