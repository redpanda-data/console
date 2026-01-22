import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const ListLayoutContext = React.createContext<{
  orientation?: 'horizontal' | 'vertical';
}>({
  orientation: 'vertical',
});

interface ListLayoutProps extends React.HTMLAttributes<HTMLDivElement>, SharedProps {
  orientation?: 'horizontal' | 'vertical';
}

const ListLayout = React.forwardRef<HTMLDivElement, ListLayoutProps>(
  ({ className, orientation = 'vertical', testId, ...props }, ref) => (
    <ListLayoutContext.Provider value={{ orientation }}>
      <div
        className={cn('flex min-h-screen w-full flex-col gap-4 p-4 sm:gap-6 sm:p-6', className)}
        data-testid={testId}
        ref={ref}
        {...props}
      />
    </ListLayoutContext.Provider>
  )
);
ListLayout.displayName = 'ListLayout';

interface ListLayoutHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const ListLayoutHeader = React.forwardRef<HTMLDivElement, ListLayoutHeaderProps>(
  ({ className, title, description, actions, ...props }, ref) => (
    <div className={cn('flex flex-col gap-2', className)} ref={ref} {...props}>
      <div className="flex items-center gap-2">
        <h1 className="font-semibold text-foreground text-xl sm:text-2xl">{title}</h1>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="text-muted-foreground text-sm sm:text-base">{description}</p> : null}
    </div>
  )
);
ListLayoutHeader.displayName = 'ListLayoutHeader';

interface ListLayoutNavigationProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutNavigation = React.forwardRef<HTMLDivElement, ListLayoutNavigationProps>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('flex gap-1', className)} ref={ref} {...props}>
      {children}
    </div>
  )
);
ListLayoutNavigation.displayName = 'ListLayoutNavigation';

interface ListLayoutFiltersProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  actions?: React.ReactNode;
}

const ListLayoutFilters = React.forwardRef<HTMLDivElement, ListLayoutFiltersProps>(
  ({ className, children, actions, ...props }, ref) => (
    <div
      className={cn('flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between', className)}
      ref={ref}
      {...props}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2 lg:ml-4">{actions}</div> : null}
    </div>
  )
);
ListLayoutFilters.displayName = 'ListLayoutFilters';

interface ListLayoutContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutContent = React.forwardRef<HTMLDivElement, ListLayoutContentProps>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('min-h-0 flex-1 overflow-hidden', className)} ref={ref} {...props}>
      <div className="h-full overflow-auto">{children}</div>
    </div>
  )
);
ListLayoutContent.displayName = 'ListLayoutContent';

interface ListLayoutFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutFooter = React.forwardRef<HTMLDivElement, ListLayoutFooterProps>(
  ({ className, children, ...props }, ref) => (
    <div
      className={cn('!border-border flex items-center justify-between border-t pt-4', className)}
      ref={ref}
      {...props}
    >
      {children}
    </div>
  )
);
ListLayoutFooter.displayName = 'ListLayoutFooter';

interface ListLayoutSearchProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutSearch = React.forwardRef<HTMLDivElement, ListLayoutSearchProps>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('mb-4 flex items-center gap-2', className)} ref={ref} {...props}>
      {children}
    </div>
  )
);
ListLayoutSearch.displayName = 'ListLayoutSearch';

interface ListLayoutSearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const ListLayoutSearchInput = React.forwardRef<HTMLInputElement, ListLayoutSearchInputProps>(
  ({ className, ...props }, ref) => (
    <input
      className={cn(
        '!border-input flex h-8 w-full min-w-[140px] max-w-[300px] rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-[200px] lg:w-[250px]',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
ListLayoutSearchInput.displayName = 'ListLayoutSearchInput';

interface ListLayoutFilterRowProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutFilterRow = React.forwardRef<HTMLDivElement, ListLayoutFilterRowProps>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('mb-4 flex flex-wrap items-center gap-2', className)} ref={ref} {...props}>
      {children}
    </div>
  )
);
ListLayoutFilterRow.displayName = 'ListLayoutFilterRow';

interface ListLayoutActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutActions = React.forwardRef<HTMLDivElement, ListLayoutActionsProps>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('mb-4 flex items-center justify-between', className)} ref={ref} {...props}>
      {children}
    </div>
  )
);
ListLayoutActions.displayName = 'ListLayoutActions';

interface ListLayoutPaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutPagination = React.forwardRef<HTMLDivElement, ListLayoutPaginationProps>(
  ({ className, children, ...props }, ref) => (
    <div
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}
      ref={ref}
      {...props}
    >
      {children}
    </div>
  )
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
