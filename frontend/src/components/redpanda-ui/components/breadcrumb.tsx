import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { Slot as SlotPrimitive } from 'radix-ui';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

function Breadcrumb({ testId, ...props }: React.ComponentProps<'nav'> & SharedProps) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" data-testid={testId} {...props} />;
}

function BreadcrumbList({ className, testId, ...props }: React.ComponentProps<'ol'> & SharedProps) {
  return (
    <ol
      className={cn(
        'flex flex-wrap items-center gap-1.5 break-words text-muted-foreground text-sm sm:gap-2.5',
        className
      )}
      data-slot="breadcrumb-list"
      data-testid={testId}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, testId, ...props }: React.ComponentProps<'li'> & SharedProps) {
  return (
    <li
      className={cn('inline-flex items-center gap-1.5', className)}
      data-slot="breadcrumb-item"
      data-testid={testId}
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
      className={cn('transition-colors hover:text-foreground', className)}
      data-slot="breadcrumb-link"
      data-testid={testId}
      {...props}
    />
  );
}

function BreadcrumbPage({ className, testId, ...props }: React.ComponentProps<'span'> & SharedProps) {
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: it is a link
    // biome-ignore lint/a11y/useSemanticElements: part of breadcrumb implementation
    <span
      aria-current="page"
      aria-disabled="true"
      className={cn('font-normal text-foreground', className)}
      data-slot="breadcrumb-page"
      data-testid={testId}
      role="link"
      {...props}
    />
  );
}

function BreadcrumbSeparator({ children, className, testId, ...props }: React.ComponentProps<'li'> & SharedProps) {
  return (
    <li
      aria-hidden="true"
      className={cn('[&>svg]:size-3.5', className)}
      data-slot="breadcrumb-separator"
      data-testid={testId}
      role="presentation"
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}

function BreadcrumbEllipsis({ className, testId, ...props }: React.ComponentProps<'span'> & SharedProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-9 items-center justify-center', className)}
      data-slot="breadcrumb-ellipsis"
      data-testid={testId}
      role="presentation"
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More</span>
    </span>
  );
}

function BreadcrumbHeader({ className, testId, ...props }: React.ComponentProps<'header'> & SharedProps) {
  return (
    <header
      className={cn(
        'flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12',
        className
      )}
      data-slot="breadcrumb-header"
      data-testid={testId}
      {...props}
    />
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
  BreadcrumbHeader,
};
