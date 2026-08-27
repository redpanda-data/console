// Copyright 2026 Redpanda Data, Inc.

'use client';

import { type Column, type RowData, Subscribe } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from 'lucide-react';
import type React from 'react';

import { Button } from '../button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import { cn, type SharedProps } from '../../lib/utils';

import type { DataTableFeatures } from './data-table-features';

interface DataTableColumnHeaderProps<TData extends RowData, TValue>
  extends React.HTMLAttributes<HTMLDivElement>,
    SharedProps {
  column: Column<DataTableFeatures, TData, TValue>;
  title: string;
}

export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
  className,
  testId,
  ...props
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <div className={cn(className)} data-testid={testId} {...props}>
        {title}
      </div>
    );
  }

  function renderHeader(sorted: false | 'asc' | 'desc') {
    return (
      <div className={cn('flex items-center gap-2', className)} data-testid={testId} {...props}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button className="-ml-3 h-8 data-[popup-open]:bg-accent" size="sm" variant="ghost">
                <span>{title}</span>
                {sorted === 'desc' && <ArrowDown />}
                {sorted === 'asc' && <ArrowUp />}
                {!sorted && <ChevronsUpDown />}
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
              <ArrowUp />
              Asc
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
              <ArrowDown />
              Desc
            </DropdownMenuItem>
            {column.getCanHide() && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                  <EyeOff />
                  Hide
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <Subscribe
      selector={(sorting) => {
        const columnSort = sorting.find((sort) => sort.id === column.id);
        if (!columnSort) {
          return false;
        }
        return columnSort.desc ? 'desc' : 'asc';
      }}
      source={column.table.atoms.sorting}
    >
      {renderHeader}
    </Subscribe>
  );
}
