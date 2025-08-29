'use client';

import React from 'react';

import { cn } from '../lib/utils';

const ListLayoutContext = React.createContext<{
  orientation?: 'horizontal' | 'vertical';
}>({
  orientation: 'vertical',
});

interface ListLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

const ListLayout = React.forwardRef<HTMLDivElement, ListLayoutProps>(
  ({ className, orientation = 'vertical', ...props }, ref) => {
    return (
      <ListLayoutContext.Provider value={{ orientation }}>
        <div
          ref={ref}
          className={cn('flex min-h-screen w-full flex-col gap-4 p-4 sm:gap-6 sm:p-6', className)}
          {...props}
        />
      </ListLayoutContext.Provider>
    );
  },
);
ListLayout.displayName = 'ListLayout';

interface ListLayoutHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const ListLayoutHeader = React.forwardRef<HTMLDivElement, ListLayoutHeaderProps>(
  ({ className, title, description, actions, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('flex flex-col gap-2', className)} {...props}>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        {description && <p className="text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
    );
  },
);
ListLayoutHeader.displayName = 'ListLayoutHeader';

interface ListLayoutNavigationProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutNavigation = React.forwardRef<HTMLDivElement, ListLayoutNavigationProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('flex gap-1', className)} {...props}>
        {children}
      </div>
    );
  },
);
ListLayoutNavigation.displayName = 'ListLayoutNavigation';

interface ListLayoutFiltersProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  actions?: React.ReactNode;
}

const ListLayoutFilters = React.forwardRef<HTMLDivElement, ListLayoutFiltersProps>(
  ({ className, children, actions, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between', className)}
        {...props}
      >
        <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
        {actions && <div className="flex shrink-0 items-center gap-2 lg:ml-4">{actions}</div>}
      </div>
    );
  },
);
ListLayoutFilters.displayName = 'ListLayoutFilters';

interface ListLayoutContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutContent = React.forwardRef<HTMLDivElement, ListLayoutContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('min-h-0 flex-1 overflow-hidden', className)} {...props}>
        <div className="h-full overflow-auto">{children}</div>
      </div>
    );
  },
);
ListLayoutContent.displayName = 'ListLayoutContent';

interface ListLayoutFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutFooter = React.forwardRef<HTMLDivElement, ListLayoutFooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex items-center justify-between border-t border-border pt-4', className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
ListLayoutFooter.displayName = 'ListLayoutFooter';

interface ListLayoutSearchProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutSearch = React.forwardRef<HTMLDivElement, ListLayoutSearchProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('flex items-center gap-2 mb-4', className)} {...props}>
        {children}
      </div>
    );
  },
);
ListLayoutSearch.displayName = 'ListLayoutSearch';

interface ListLayoutSearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const ListLayoutSearchInput = React.forwardRef<HTMLInputElement, ListLayoutSearchInputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'h-8 w-full min-w-[140px] max-w-[300px] sm:w-[200px] lg:w-[250px] flex rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
ListLayoutSearchInput.displayName = 'ListLayoutSearchInput';

interface ListLayoutFilterRowProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutFilterRow = React.forwardRef<HTMLDivElement, ListLayoutFilterRowProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('flex flex-wrap items-center gap-2 mb-4', className)} {...props}>
        {children}
      </div>
    );
  },
);
ListLayoutFilterRow.displayName = 'ListLayoutFilterRow';

interface ListLayoutActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutActions = React.forwardRef<HTMLDivElement, ListLayoutActionsProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('flex items-center justify-between mb-4', className)} {...props}>
        {children}
      </div>
    );
  },
);
ListLayoutActions.displayName = 'ListLayoutActions';

interface ListLayoutPaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutPagination = React.forwardRef<HTMLDivElement, ListLayoutPaginationProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
ListLayoutPagination.displayName = 'ListLayoutPagination';

export {
  ListLayout,
  ListLayoutHeader,
  ListLayoutNavigation,
  ListLayoutFilters,
  ListLayoutSearch,
  ListLayoutSearchInput,
  ListLayoutFilterRow,
  ListLayoutActions,
  ListLayoutContent,
  ListLayoutPagination,
  ListLayoutFooter,
};
