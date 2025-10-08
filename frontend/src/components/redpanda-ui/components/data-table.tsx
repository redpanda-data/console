'use client';

import type { Column, ColumnDef, Row, Table } from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Circle,
  CircleOff,
  EyeOff,
  HelpCircle,
  MoreHorizontal,
  Settings2,
  Timer,
  X,
} from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import React from 'react';
import { z } from 'zod';

import { Badge } from './badge';
import { Button } from './button';
import { Checkbox } from './checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './command';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Separator } from './separator';
import { cn } from '../lib/utils';

// Schema
export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  label: z.string(),
  priority: z.string(),
});

export type Task = z.infer<typeof taskSchema>;

// Data
export const labels = [
  {
    value: 'bug',
    label: 'Bug',
  },
  {
    value: 'feature',
    label: 'Feature',
  },
  {
    value: 'documentation',
    label: 'Documentation',
  },
];

export const statuses = [
  {
    value: 'backlog',
    label: 'Backlog',
    icon: HelpCircle,
  },
  {
    value: 'todo',
    label: 'Todo',
    icon: Circle,
  },
  {
    value: 'in progress',
    label: 'In Progress',
    icon: Timer,
  },
  {
    value: 'done',
    label: 'Done',
    icon: CheckCircle,
  },
  {
    value: 'canceled',
    label: 'Canceled',
    icon: CircleOff,
  },
];

export const priorities = [
  {
    label: 'Low',
    value: 'low',
    icon: ArrowDown,
  },
  {
    label: 'Medium',
    value: 'medium',
    icon: ArrowRight,
  },
  {
    label: 'High',
    value: 'high',
    icon: ArrowUp,
  },
];

export const dataTableMockData: Task[] = [
  {
    id: 'TASK-8782',
    title: "You can't compress the program without quantifying the open-source SSD pixel!",
    status: 'in progress',
    label: 'documentation',
    priority: 'medium',
  },
  {
    id: 'TASK-7878',
    title: 'Try to calculate the EXE feed, maybe it will index the multi-byte pixel!',
    status: 'backlog',
    label: 'documentation',
    priority: 'medium',
  },
  {
    id: 'TASK-7839',
    title: 'We need to bypass the neural TCP card!',
    status: 'todo',
    label: 'bug',
    priority: 'high',
  },
  {
    id: 'TASK-5562',
    title: 'The SAS interface is down, bypass the open-source pixel so we can back up the PNG bandwidth!',
    status: 'backlog',
    label: 'feature',
    priority: 'medium',
  },
  {
    id: 'TASK-8686',
    title: "I'll parse the wireless SSL protocol, that should driver the API panel!",
    status: 'canceled',
    label: 'feature',
    priority: 'medium',
  },
  {
    id: 'TASK-1280',
    title: 'Use the digital TLS panel, then you can transmit the haptic system!',
    status: 'done',
    label: 'bug',
    priority: 'high',
  },
  {
    id: 'TASK-7262',
    title: 'The UTF8 application is down, parse the neural bandwidth so we can back up the PNG firewall!',
    status: 'done',
    label: 'feature',
    priority: 'high',
  },
  {
    id: 'TASK-1138',
    title: "Generating the driver won't do anything, we need to quantify the 1080p SMTP bandwidth!",
    status: 'in progress',
    label: 'feature',
    priority: 'medium',
  },
  {
    id: 'TASK-7184',
    title: 'We need to program the back-end THX pixel!',
    status: 'todo',
    label: 'feature',
    priority: 'low',
  },
  {
    id: 'TASK-5160',
    title: "Calculating the bus won't do anything, we need to navigate the back-end JSON protocol!",
    status: 'in progress',
    label: 'documentation',
    priority: 'high',
  },
];

// Components
interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
  testId?: string;
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
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="data-[state=open]:bg-accent -ml-3 h-8">
            <span>{title}</span>
            {column.getIsSorted() === 'desc' ? (
              <ArrowDown />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUp />
            ) : (
              <ChevronsUpDown />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUp />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDown />
            Desc
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
            <EyeOff />
            Hide
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>;
  title?: string;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  testId?: string;
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
  testId,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const facets = column?.getFacetedUniqueValues();
  const selectedValues = new Set(column?.getFilterValue() as string[]);

  return (
    <Popover testId={testId}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          {title}
          {selectedValues?.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                {selectedValues.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) => selectedValues.has(option.value))
                    .map((option) => (
                      <Badge variant="secondary" key={option.value} className="rounded-sm px-1 font-normal">
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    className="gap-3"
                    onSelect={() => {
                      if (isSelected) {
                        selectedValues.delete(option.value);
                      } else {
                        selectedValues.add(option.value);
                      }
                      const filterValues = Array.from(selectedValues);
                      column?.setFilterValue(filterValues.length ? filterValues : undefined);
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      className="size-4 shrink-0"
                      onCheckedChange={(checked) => {
                        if (checked) {
                          selectedValues.add(option.value);
                        } else {
                          selectedValues.delete(option.value);
                        }
                        const filterValues = Array.from(selectedValues);
                        column?.setFilterValue(filterValues.length ? filterValues : undefined);
                      }}
                    />
                    <div className="flex items-center gap-2 flex-1">
                      {option.icon && <option.icon className="text-muted-foreground size-4 shrink-0" />}
                      <span className={cn('flex-1', title === 'Region' ? 'font-mono' : '')}>{option.label}</span>
                      {facets?.get(option.value) && (
                        <span className="text-muted-foreground ml-auto flex size-4 items-center justify-center font-mono text-xs shrink-0">
                          {facets.get(option.value)}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column?.setFilterValue(undefined)}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  testId?: string;
}

export function DataTablePagination<TData>({ table, testId }: DataTablePaginationProps<TData>) {
  return (
    <div className="flex items-center justify-end px-2" data-testid={testId}>
      <div className="flex items-center space-x-6 lg:space-x-8">
        {table.getPageCount() > 0 && (
          <div className="flex w-[100px] items-center justify-center text-sm font-medium">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
        )}
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 25, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-8 lg:flex"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({ row }: DataTableRowActionsProps<TData>) {
  const task = taskSchema.parse(row.original);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="data-[state=open]:bg-muted size-8">
          <MoreHorizontal />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuItem>Edit</DropdownMenuItem>
        <DropdownMenuItem>Make a copy</DropdownMenuItem>
        <DropdownMenuItem>Favorite</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Labels</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={task.label}>
              {labels.map((label) => (
                <DropdownMenuRadioItem key={label.value} value={label.value}>
                  {label.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          Delete
          <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  testId?: string;
}

export function DataTableToolbar<TData>({ table, testId }: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between" data-testid={testId}>
      <div className="flex flex-1 items-center gap-2">
        <Input
          placeholder="Filter tasks..."
          value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
          onChange={(event) => table.getColumn('title')?.setFilterValue(event.target.value)}
          className="h-8 w-[150px] lg:w-[250px]"
        />
        {table.getColumn('status') && (
          <DataTableFacetedFilter column={table.getColumn('status')} title="Status" options={statuses} />
        )}
        {table.getColumn('priority') && (
          <DataTableFacetedFilter column={table.getColumn('priority')} title="Priority" options={priorities} />
        )}
        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={() => table.resetColumnFilters()}>
            Reset
            <X />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <DataTableViewOptions table={table} />
        <Button size="sm">Add Task</Button>
      </div>
    </div>
  );
}

export function DataTableViewOptions<TData>({ table, testId }: { table: Table<TData>; testId?: string }) {
  return (
    <div data-testid={testId}>
      <DropdownMenu>
        <DropdownMenuPrimitive.Trigger asChild>
          <Button variant="outline" size="sm" className="ml-auto hidden h-8 lg:flex">
            <Settings2 />
            View
          </Button>
        </DropdownMenuPrimitive.Trigger>
        <DropdownMenuContent align="end" className="w-[150px]">
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {table
            .getAllColumns()
            .filter((column) => typeof column.accessorFn !== 'undefined' && column.getCanHide())
            .map((column) => {
              return (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export const dataTableColumns: ColumnDef<Task>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'id',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Task" />,
    cell: ({ row }) => <div className="w-[80px]">{row.getValue('id')}</div>,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'title',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
    cell: ({ row }) => {
      const label = labels.find((l) => l.value === row.original.label);

      return (
        <div className="flex gap-2">
          {label && <Badge variant="outline">{label.label}</Badge>}
          <span className="max-w-[500px] truncate font-medium">{row.getValue('title')}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const status = statuses.find((s) => s.value === row.getValue('status'));

      if (!status) {
        return null;
      }

      return (
        <div className="flex w-[100px] items-center gap-2">
          {status.icon && <status.icon className="text-muted-foreground size-4" />}
          <span>{status.label}</span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'priority',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Priority" />,
    cell: ({ row }) => {
      const priority = priorities.find((p) => p.value === row.getValue('priority'));

      if (!priority) {
        return null;
      }

      return (
        <div className="flex items-center gap-2">
          {priority.icon && <priority.icon className="text-muted-foreground size-4" />}
          <span>{priority.label}</span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
];
