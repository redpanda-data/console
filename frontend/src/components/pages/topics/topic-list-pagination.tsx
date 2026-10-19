// Copyright 2026 Redpanda Data, Inc.

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { Topic } from 'state/rest-interfaces';

import { Button } from '../../redpanda-ui/components/button';
import { ButtonGroup } from '../../redpanda-ui/components/button-group';
import type { DataTableRenderInstance } from '../../redpanda-ui/components/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../redpanda-ui/components/select';

const PAGE_SIZES = [10, 20, 25, 30, 40, 50];

export function TopicListPagination({ table }: { table: DataTableRenderInstance<Topic> }) {
  return (
    <table.Subscribe selector={(state) => state.pagination}>
      {(pagination) => (
        <nav aria-label="Topic pagination" className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3 px-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-body">Rows per page</span>
            <Select onValueChange={(value) => table.setPageSize(Number(value))} value={`${pagination.pageSize}`}>
              <SelectTrigger aria-label="Rows per page" className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top">
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-label tabular-nums">
              Page{' '}
              {table.getPageCount() === 0 ? 0 : Math.max(1, Math.min(pagination.pageIndex + 1, table.getPageCount()))}{' '}
              of {table.getPageCount()}
            </span>
            <ButtonGroup aria-label="Pagination">
              {[
                {
                  label: 'Go to first page',
                  Icon: ChevronsLeft,
                  disabled: !table.getCanPreviousPage(),
                  go: () => table.setPageIndex(0),
                },
                {
                  label: 'Go to previous page',
                  Icon: ChevronLeft,
                  disabled: !table.getCanPreviousPage(),
                  go: () => table.previousPage(),
                },
                {
                  label: 'Go to next page',
                  Icon: ChevronRight,
                  disabled: !table.getCanNextPage(),
                  go: () => table.nextPage(),
                },
                {
                  label: 'Go to last page',
                  Icon: ChevronsRight,
                  disabled: !table.getCanLastPage(),
                  go: () => table.setPageIndex(table.getPageCount() - 1),
                },
              ].map(({ label, Icon, disabled, go }) => (
                <Button
                  aria-label={label}
                  className="size-8"
                  disabled={disabled}
                  key={label}
                  onClick={go}
                  size="icon"
                  variant="outline"
                >
                  <Icon aria-hidden="true" />
                </Button>
              ))}
            </ButtonGroup>
          </div>
        </nav>
      )}
    </table.Subscribe>
  );
}
