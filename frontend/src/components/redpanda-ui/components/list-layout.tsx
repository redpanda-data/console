import React from 'react';
import { Input, type InputProps } from './input';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn, type SharedProps } from '../lib/utils';

const ListLayoutContext = React.createContext<{
  orientation?: 'horizontal' | 'vertical';
}>({
  orientation: 'vertical',
});

interface ListLayoutProps extends React.HTMLAttributes<HTMLDivElement>, SharedProps {
  orientation?: 'horizontal' | 'vertical' | undefined;
}

const ListLayout = ({
  className,
  orientation = 'vertical',
  testId,
  ref,
  ...props
}: ListLayoutProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <ListLayoutContext.Provider value={{ orientation }}>
    <div
      className={cn('flex min-h-screen w-full flex-col gap-4 sm:gap-6', className)}
      data-testid={testId}
      ref={ref}
      {...props}
    />
  </ListLayoutContext.Provider>
);
ListLayout.displayName = 'ListLayout';

interface ListLayoutHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  actions?: React.ReactNode | undefined;
  description?: string | undefined;
  title: string;
}

const ListLayoutHeader = ({
  className,
  title,
  description,
  actions,
  ref,
  ...props
}: ListLayoutHeaderProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div className={cn('flex flex-col gap-2', className)} ref={ref} {...props}>
    <div className="flex items-center gap-2">
      <h1 className="text-heading-lg text-foreground sm:text-heading-xl">{title}</h1>
      {hasSlotContent(actions) ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
    {description !== undefined && description !== '' ? (
      <p className="text-body text-subtle sm:text-body-lg">{description}</p>
    ) : null}
  </div>
);
ListLayoutHeader.displayName = 'ListLayoutHeader';

interface ListLayoutNavigationProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutNavigation = ({
  className,
  children,
  ref,
  ...props
}: ListLayoutNavigationProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div className={cn('flex gap-1', className)} ref={ref} {...props}>
    {children}
  </div>
);
ListLayoutNavigation.displayName = 'ListLayoutNavigation';

interface ListLayoutFiltersProps extends React.HTMLAttributes<HTMLDivElement> {
  actions?: React.ReactNode | undefined;
  children: React.ReactNode;
}

const ListLayoutFilters = ({
  className,
  children,
  actions,
  ref,
  ...props
}: ListLayoutFiltersProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div
    className={cn('flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between', className)}
    ref={ref}
    {...props}
  >
    <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
    {hasSlotContent(actions) ? <div className="flex shrink-0 items-center gap-2 lg:ml-4">{actions}</div> : null}
  </div>
);
ListLayoutFilters.displayName = 'ListLayoutFilters';

interface ListLayoutContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutContent = ({
  className,
  children,
  ref,
  ...props
}: ListLayoutContentProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div className={cn('min-h-0 flex-1 overflow-hidden', className)} ref={ref} {...props}>
    <div className="h-full overflow-auto">{children}</div>
  </div>
);
ListLayoutContent.displayName = 'ListLayoutContent';

interface ListLayoutFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutFooter = ({
  className,
  children,
  ref,
  ...props
}: ListLayoutFooterProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div className={cn('flex items-center justify-between border-t !border-border pt-4', className)} ref={ref} {...props}>
    {children}
  </div>
);
ListLayoutFooter.displayName = 'ListLayoutFooter';

interface ListLayoutSearchProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutSearch = ({
  className,
  children,
  ref,
  ...props
}: ListLayoutSearchProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div className={cn('mb-4 flex items-center gap-2', className)} ref={ref} {...props}>
    {children}
  </div>
);
ListLayoutSearch.displayName = 'ListLayoutSearch';

interface ListLayoutSearchInputProps extends InputProps {}

const ListLayoutSearchInput = ({
  className,
  ref,
  ...props
}: ListLayoutSearchInputProps & { ref?: React.Ref<HTMLInputElement> | undefined }) => (
  <Input
    className={cn('w-full max-w-[300px] min-w-[140px] sm:w-[200px] lg:w-[250px]', className)}
    ref={ref}
    size="sm"
    {...props}
  />
);
ListLayoutSearchInput.displayName = 'ListLayoutSearchInput';

interface ListLayoutFilterRowProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutFilterRow = ({
  className,
  children,
  ref,
  ...props
}: ListLayoutFilterRowProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div className={cn('mb-4 flex flex-wrap items-center gap-2', className)} ref={ref} {...props}>
    {children}
  </div>
);
ListLayoutFilterRow.displayName = 'ListLayoutFilterRow';

interface ListLayoutActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutActions = ({
  className,
  children,
  ref,
  ...props
}: ListLayoutActionsProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div className={cn('mb-4 flex items-center justify-between', className)} ref={ref} {...props}>
    {children}
  </div>
);
ListLayoutActions.displayName = 'ListLayoutActions';

interface ListLayoutPaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ListLayoutPagination = ({
  className,
  children,
  ref,
  ...props
}: ListLayoutPaginationProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => (
  <div
    className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}
    ref={ref}
    {...props}
  >
    {children}
  </div>
);
ListLayoutPagination.displayName = 'ListLayoutPagination';

export {
  ListLayout,
  ListLayoutActions,
  ListLayoutContent,
  ListLayoutFilterRow,
  ListLayoutFilters,
  ListLayoutFooter,
  ListLayoutHeader,
  ListLayoutNavigation,
  ListLayoutPagination,
  ListLayoutSearch,
  ListLayoutSearchInput,
};
