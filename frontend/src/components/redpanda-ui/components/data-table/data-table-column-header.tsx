'use client';

import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from 'lucide-react';

import { Button } from '../button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import { cn, type SharedProps } from '../../lib/utils';

interface DataTableColumnHeaderProps<TData, TValue> extends SharedProps {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
  testId,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <div className={cn(className)} data-testid={testId}>
        {title}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)} data-testid={testId}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button className="-ml-3 h-8 data-[popup-open]:bg-accent" size="sm" variant="secondary-ghost">
              <span>{title}</span>
              {column.getIsSorted() === 'desc' && <ArrowDown />}
              {column.getIsSorted() === 'asc' && <ArrowUp />}
              {!column.getIsSorted() && <ChevronsUpDown />}
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
