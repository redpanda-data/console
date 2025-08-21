import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { Slot as SlotPrimitive } from 'radix-ui';
import React from 'react';

import { cn } from '../lib/utils';

function Breadcrumb({ testId, ...props }: React.ComponentProps<'nav'> & { testId?: string }) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" data-testid={testId} {...props} />;
}

function BreadcrumbList({ className, testId, ...props }: React.ComponentProps<'ol'> & { testId?: string }) {
  return (
    <ol
      data-slot="breadcrumb-list"
      data-testid={testId}
      className={cn(
        'text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5',
        className,
      )}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, testId, ...props }: React.ComponentProps<'li'> & { testId?: string }) {
  return (
    <li
      data-slot="breadcrumb-item"
      data-testid={testId}
      className={cn('inline-flex items-center gap-1.5', className)}
      {...props}
    />
  );
}

function BreadcrumbLink({
  asChild,
  className,
  testId,
  ...props
}: React.ComponentProps<'a'> & {
  asChild?: boolean;
  testId?: string;
}) {
  const Comp = asChild ? SlotPrimitive.Slot : 'a';

  return (
    <Comp
      data-slot="breadcrumb-link"
      data-testid={testId}
      className={cn('hover:text-foreground transition-colors', className)}
      {...props}
    />
  );
}

function BreadcrumbPage({ className, testId, ...props }: React.ComponentProps<'span'> & { testId?: string }) {
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: it is a link
    <span
      data-slot="breadcrumb-page"
      data-testid={testId}
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn('text-foreground font-normal', className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({
  children,
  className,
  testId,
  ...props
}: React.ComponentProps<'li'> & { testId?: string }) {
  return (
    <li
      data-slot="breadcrumb-separator"
      data-testid={testId}
      role="presentation"
      aria-hidden="true"
      className={cn('[&>svg]:size-3.5', className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}

function BreadcrumbEllipsis({ className, testId, ...props }: React.ComponentProps<'span'> & { testId?: string }) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      data-testid={testId}
      role="presentation"
      aria-hidden="true"
      className={cn('flex size-9 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More</span>
    </span>
  );
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
