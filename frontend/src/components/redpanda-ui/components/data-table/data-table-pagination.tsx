// Copyright 2026 Redpanda Data, Inc.

'use client';

import type { RowData } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import { Button } from '../button';
import { ButtonGroup } from '../button-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select';
import type { SharedProps } from '../../lib/utils';

import type { DataTableRenderInstance } from './data-table-features';

interface DataTablePaginationProps<TData extends RowData> extends SharedProps {
  table: DataTableRenderInstance<TData>;
  pageSizeOptions?: number[];
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 25, 30, 40, 50];

export function DataTablePagination<TData extends RowData>({
  table,
  testId,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: DataTablePaginationProps<TData>) {
  return (
    <table.Subscribe
      selector={(state) => ({
        pagination: state.pagination,
        selectedRowCount: table.getFilteredSelectedRowModel().rows.length,
        filteredRowCount: table.getFilteredRowModel().rows.length,
      })}
    >
      {({ pagination, selectedRowCount, filteredRowCount }) => (
        <div className="flex items-center justify-between px-2" data-testid={testId}>
          {table.options.enableRowSelection !== false && (
            <div className="flex-1 text-body text-subtle">
              {selectedRowCount} of {filteredRowCount} row(s) selected.
            </div>
          )}
          {/* ml-auto holds the controls right when the selection count is not rendered. */}
          <div className="ml-auto flex items-center space-x-6 lg:space-x-8">
            <div className="flex items-center space-x-2">
              <div className="font-medium text-body">Rows per page</div>
              <Select
                onValueChange={(value) => {
                  table.setPageSize(Number(value));
                }}
                value={`${pagination.pageSize}`}
              >
                <SelectTrigger aria-label="Rows per page" className="h-8 w-[70px]">
                  <SelectValue placeholder={pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  {pageSizeOptions.map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-[100px] items-center justify-center text-label">
              Page {table.getPageCount() === 0 ? 0 : pagination.pageIndex + 1} of {table.getPageCount()}
            </div>
            <ButtonGroup aria-label="Pagination">
              <Button
                className="size-8"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.setPageIndex(0)}
                size="icon"
                variant="outline"
              >
                <span className="sr-only">Go to first page</span>
                <ChevronsLeft />
              </Button>
              <Button
                className="size-8"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
                size="icon"
                variant="outline"
              >
                <span className="sr-only">Go to previous page</span>
                <ChevronLeft />
              </Button>
              <Button
                className="size-8"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
                size="icon"
                variant="outline"
              >
                <span className="sr-only">Go to next page</span>
                <ChevronRight />
              </Button>
              <Button
                className="size-8"
                disabled={!table.getCanLastPage()}
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                size="icon"
                variant="outline"
              >
                <span className="sr-only">Go to last page</span>
                <ChevronsRight />
              </Button>
            </ButtonGroup>
          </div>
        </div>
      )}
    </table.Subscribe>
  );
}
