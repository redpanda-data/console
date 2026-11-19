import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import type React from 'react';

import { cn, type DataAttributes, type SharedProps } from '../lib/utils';

function Breadcrumb({ testId, ...props }: React.ComponentProps<'nav'> & SharedProps) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" data-testid={testId} {...props} />;
}

function BreadcrumbList({ className, testId, ...props }: React.ComponentProps<'ol'> & SharedProps) {
  return (
    <ol
      className={cn('flex flex-wrap items-center gap-1.5 text-body wrap-break-word text-subtle sm:gap-2.5', className)}
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

function BreadcrumbLink({ className, render, testId, ...props }: useRender.ComponentProps<'a'> & SharedProps) {
  const elementProps = {
    className: cn(
      'inline-flex cursor-pointer items-center gap-1.5 link-standalone transition-colors hover:text-foreground motion-reduce:transition-none',
      className
    ),
    'data-testid': testId,
  } satisfies React.ComponentProps<'a'> & DataAttributes;

  return useRender({
    defaultTagName: 'a',
    props: mergeProps<'a'>(elementProps, props),
    render,
    state: { slot: 'breadcrumb-link' },
  });
}

function BreadcrumbPage({ className, testId, ...props }: React.ComponentProps<'span'> & SharedProps) {
  return (
    <span
      aria-current="page"
      className={cn('inline-flex items-center gap-1.5 font-normal text-foreground', className)}
      data-slot="breadcrumb-page"
      data-testid={testId}
      {...props}
    />
  );
}

function BreadcrumbSeparator({ children, className, testId, ...props }: React.ComponentProps<'li'> & SharedProps) {
  return (
    <li
      aria-hidden="true"
      className={cn('rtl:rotate-180 [&>svg]:size-3.5', className)}
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
        'flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 motion-reduce:transition-none',
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
  BreadcrumbEllipsis,
  BreadcrumbHeader,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
};
