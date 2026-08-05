'use client';

import type { Table } from '@tanstack/react-table';
import { Settings2 } from 'lucide-react';

import { Button } from '../button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import type { SharedProps } from '../../lib/utils';

export function DataTableViewOptions<TData>({ table, testId }: { table: Table<TData> } & SharedProps) {
  return (
    <div data-testid={testId}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button className="ml-auto h-8" size="sm" variant="outline">
              <Settings2 />
              View
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-[150px] max-w-[300px]">
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {table
            .getAllColumns()
            .filter((column) => typeof column.accessorFn !== 'undefined' && column.getCanHide())
            .map((column) => {
              // Loose cast, not a ColumnMeta augmentation: that would weak-type the interface and
              // reject consumers who stash their own meta keys.
              const label = (column.columnDef.meta as { label?: string } | undefined)?.label;
              return (
                <DropdownMenuCheckboxItem
                  checked={column.getIsVisible()}
                  className={label ? undefined : 'capitalize'}
                  key={column.id}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {label ?? column.id}
                </DropdownMenuCheckboxItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
