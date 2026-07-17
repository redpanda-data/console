import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react';
import React from 'react';

import { type Button, buttonVariants } from './button';
import { cn, type SharedProps } from '../lib/utils';

function Pagination({ className, testId, ...props }: React.ComponentProps<'nav'> & SharedProps) {
  return (
    <nav
      aria-label="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      data-slot="pagination"
      data-testid={testId}
      {...props}
    />
  );
}

function PaginationContent({ className, testId, ...props }: React.ComponentProps<'ul'> & SharedProps) {
  return (
    <ul
      className={cn('flex flex-row items-center gap-1', className)}
      data-slot="pagination-content"
      data-testid={testId}
      {...props}
    />
  );
}

function PaginationItem({ testId, ...props }: React.ComponentProps<'li'> & SharedProps) {
  return <li data-slot="pagination-item" data-testid={testId} {...props} />;
}

type PaginationLinkProps = {
  isActive?: boolean;
  testId?: string;
} & Pick<React.ComponentProps<typeof Button>, 'size'> &
  React.ComponentProps<'a'>;

function PaginationLink({ className, isActive, size = 'icon', testId, ...props }: PaginationLinkProps) {
  return (
    <a
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        buttonVariants({
          variant: isActive ? 'outline' : 'ghost',
          size,
        }),
        className
      )}
      data-active={isActive}
      data-slot="pagination-link"
      data-testid={testId}
      {...props}
    />
  );
}

function PaginationPrevious({
  className,
  text = 'Previous',
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      className={cn('gap-1 px-2.5 sm:pl-2.5', className)}
      size="md"
      {...props}
    >
      <ChevronLeftIcon />
      <span className="hidden text-body sm:block">{text}</span>
    </PaginationLink>
  );
}

function PaginationNext({
  className,
  text = 'Next',
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      className={cn('gap-1 px-2.5 sm:pr-2.5', className)}
      size="md"
      {...props}
    >
      <span className="hidden text-body sm:block">{text}</span>
      <ChevronRightIcon />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, testId, ...props }: React.ComponentProps<'span'> & SharedProps) {
  return (
    <span
      aria-hidden
      className={cn('flex size-9 items-center justify-center', className)}
      data-slot="pagination-ellipsis"
      data-testid={testId}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  );
}

type SimplePaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
  showEllipsis?: boolean;
  maxVisiblePages?: number;
  className?: string;
  testId?: string;
};

function SimplePagination({
  currentPage,
  totalPages,
  onPageChange,
  showEllipsis = true,
  maxVisiblePages = 5,
  className,
  testId,
}: SimplePaginationProps) {
  const generatePages = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const halfVisible = Math.floor(maxVisiblePages / 2);

    let startPage = Math.max(1, currentPage - halfVisible);
    let endPage = Math.min(totalPages, currentPage + halfVisible);

    // Adjust if we're near the beginning or end
    if (endPage - startPage + 1 < maxVisiblePages) {
      if (startPage === 1) {
        endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
      } else {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
      }
    }

    if (showEllipsis && startPage > 1) {
      pages.push(1);
      if (startPage > 2) {
        pages.push('ellipsis-start');
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (showEllipsis && endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push('ellipsis-end');
      }
      pages.push(totalPages);
    }

    return pages;
  };

  const handlePageClick = (page: number) => {
    if (onPageChange && page !== currentPage && page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  };

  const pages = generatePages();
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  return (
    <Pagination className={className} testId={testId}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={isFirstPage || undefined}
            className={isFirstPage ? 'pointer-events-none opacity-50' : undefined}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handlePageClick(currentPage - 1);
            }}
            tabIndex={isFirstPage ? -1 : undefined}
          />
        </PaginationItem>

        {pages.map((page, index) => (
          <PaginationItem key={typeof page === 'string' ? `ellipsis-${index}` : `page-${page}`}>
            {typeof page === 'string' ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href="#"
                isActive={page === currentPage}
                onClick={(e) => {
                  e.preventDefault();
                  handlePageClick(page);
                }}
              >
                {page}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}

        <PaginationItem>
          <PaginationNext
            aria-disabled={isLastPage || undefined}
            className={isLastPage ? 'pointer-events-none opacity-50' : undefined}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handlePageClick(currentPage + 1);
            }}
            tabIndex={isLastPage ? -1 : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
  SimplePagination,
};
