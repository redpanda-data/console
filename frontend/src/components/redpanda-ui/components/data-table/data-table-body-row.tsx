// Copyright 2026 Redpanda Data, Inc.

'use client';

import type { RowData } from '@tanstack/react-table';
import type React from 'react';
import { TableCell, TableRow } from '../table';
import { cn } from '../../lib/utils';
import type { DataTableInstance, DataTableRow } from './data-table-features';
import { DataTableRecordSelection } from './data-table-selection';
import { isRowActivationClick } from './data-table-utils';
import type { DataTableClassNames } from './data-table-view';

interface DataTableBodyRowProps<TData extends RowData> {
  classNames?: DataTableClassNames | undefined;
  expandRowByClick: boolean;
  getRowAriaLabel?: ((row: DataTableRow<TData>) => string | undefined) | undefined;
  isRowClickable?: ((row: DataTableRow<TData>) => boolean) | undefined;
  onRow?: ((row: DataTableRow<TData>) => void) | undefined;
  row: DataTableRow<TData>;
  rowClassName?: ((row: DataTableRow<TData>) => string | undefined) | undefined;
  selectable?: boolean | undefined;
  subComponent?: ((props: { row: DataTableRow<TData> }) => React.ReactNode) | undefined;
  table: Omit<DataTableInstance<TData>, 'state'>;
}

function DataTableRowContent<TData extends RowData>({
  row,
  table,
  expandRowByClick,
  subComponent,
  onRow,
  isRowClickable,
  getRowAriaLabel,
  rowClassName,
  classNames,
  cells,
  expanded,
  canExpand,
  visibleCellCount,
  selectable = false,
}: DataTableBodyRowProps<TData> & {
  cells: React.ReactNode;
  expanded: boolean;
  canExpand: boolean;
  visibleCellCount: number;
}) {
  const rowIsActivatable = expandRowByClick ? canExpand : Boolean(onRow) && (isRowClickable?.(row) ?? true);
  function activateRow() {
    if (expandRowByClick) {
      row.toggleExpanded();
      return;
    }
    onRow?.(row);
  }

  function handleClick(event: React.MouseEvent<HTMLTableRowElement>) {
    if (isRowActivationClick(event.target, event.currentTarget)) {
      activateRow();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>) {
    const isActivationKey = event.key === 'Enter' || event.key === ' ';
    if (!isActivationKey || event.repeat || event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    activateRow();
  }

  return (
    <>
      <table.Subscribe selector={(selection) => Boolean(selection[row.id])} source={table.atoms.rowSelection}>
        {(selected) => (
          <TableRow
            aria-expanded={expandRowByClick && canExpand ? expanded : undefined}
            aria-label={rowIsActivatable ? getRowAriaLabel?.(row) : undefined}
            className={cn(rowIsActivatable && 'cursor-pointer', classNames?.row, rowClassName?.(row))}
            data-state={selected ? 'selected' : undefined}
            onClick={rowIsActivatable ? handleClick : undefined}
            onKeyDown={rowIsActivatable ? handleKeyDown : undefined}
            tabIndex={rowIsActivatable ? 0 : undefined}
          >
            {selectable && (
              <TableCell className={classNames?.cell}>
                <DataTableRecordSelection row={row} table={table} />
              </TableCell>
            )}
            {cells}
          </TableRow>
        )}
      </table.Subscribe>
      {expanded && subComponent !== undefined ? (
        <TableRow>
          <TableCell colSpan={visibleCellCount} density="none">
            {subComponent({ row })}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

export function DataTableBodyRow<TData extends RowData>(props: DataTableBodyRowProps<TData>) {
  const { table, row, classNames } = props;
  return (
    <table.Subscribe
      selector={() => ({
        cells: row.getVisibleCells(),
        expanded: row.getIsExpanded(),
        canExpand: row.getCanExpand(),
      })}
    >
      {({ cells, expanded, canExpand }) => (
        <DataTableRowContent
          {...props}
          canExpand={canExpand}
          cells={cells.map((cell) => (
            <TableCell className={classNames?.cell} key={cell.id}>
              <table.FlexRender cell={cell} />
            </TableCell>
          ))}
          expanded={expanded}
          visibleCellCount={cells.length + (props.selectable === true ? 1 : 0)}
        />
      )}
    </table.Subscribe>
  );
}
