'use client';

import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react';
import type React from 'react';
import { Button } from './button';
import { buttonVariants } from './button/variants';
import { cn, type SharedProps } from '../lib/utils';

function Pagination({ className, testId, ...props }: React.ComponentProps<'nav'> & SharedProps) {
  return (
    <nav
      aria-label="pagination"
      className={cn('mx-auto flex w-full min-w-0 justify-center', className)}
      data-slot="pagination"
      data-testid={testId}
      {...props}
    />
  );
}

function PaginationContent({ className, testId, ...props }: React.ComponentProps<'ul'> & SharedProps) {
  return (
    <ul
      className={cn('flex min-w-0 flex-wrap items-center justify-center gap-1', className)}
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
  isActive?: boolean | undefined;
  testId?: string | undefined;
} & Pick<React.ComponentProps<typeof Button>, 'size'> &
  React.ComponentProps<'a'>;

function PaginationLink({ className, isActive, size = 'icon', testId, ...props }: PaginationLinkProps) {
  return (
    <a
      aria-current={isActive === true ? 'page' : undefined}
      className={cn(
        buttonVariants({
          variant: isActive === true ? 'outline' : 'ghost',
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
}: React.ComponentProps<typeof PaginationLink> & { text?: string | undefined }) {
  return (
    <PaginationLink aria-label="Go to previous page" className={className} size="md" {...props}>
      <ChevronLeftIcon />
      <span className="hidden text-body sm:block">{text}</span>
    </PaginationLink>
  );
}

function PaginationNext({
  className,
  text = 'Next',
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string | undefined }) {
  return (
    <PaginationLink aria-label="Go to next page" className={className} size="md" {...props}>
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

interface SimplePaginationProps {
  className?: string | undefined;
  currentPage: number;
  maxVisiblePages?: number | undefined;
  onPageChange?: ((page: number) => void) | undefined;
  showEllipsis?: boolean | undefined;
  testId?: string | undefined;
  totalPages: number;
}

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
    if (onPageChange !== undefined && page !== currentPage && page >= 1 && page <= totalPages) {
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
          <Button
            aria-label="Go to previous page"
            disabled={isFirstPage || onPageChange === undefined}
            onClick={() => {
              handlePageClick(currentPage - 1);
            }}
            size="md"
            type="button"
            variant="ghost"
          >
            <ChevronLeftIcon />
            <span className="hidden sm:block">Previous</span>
          </Button>
        </PaginationItem>

        {pages.map((page) => (
          <PaginationItem key={typeof page === 'string' ? page : `page-${page}`}>
            {typeof page === 'string' ? (
              <PaginationEllipsis />
            ) : (
              <Button
                aria-current={page === currentPage ? 'page' : undefined}
                aria-label={`Go to page ${page}`}
                disabled={onPageChange === undefined}
                onClick={() => {
                  handlePageClick(page);
                }}
                size="icon"
                type="button"
                variant={page === currentPage ? 'outline' : 'ghost'}
              >
                {page}
              </Button>
            )}
          </PaginationItem>
        ))}

        <PaginationItem>
          <Button
            aria-label="Go to next page"
            disabled={isLastPage || onPageChange === undefined}
            onClick={() => {
              handlePageClick(currentPage + 1);
            }}
            size="md"
            type="button"
            variant="ghost"
          >
            <span className="hidden sm:block">Next</span>
            <ChevronRightIcon />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  SimplePagination,
};
