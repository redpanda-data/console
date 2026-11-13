/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { ElementTooltip } from 'components/misc/element-tooltip';
import { Button as ConsoleButton } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import { SortableHandle, SortableItem, SortableList } from 'components/redpanda-ui/components/sortable';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ChevronDownIcon, GripVerticalIcon, Settings2Icon } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { COLUMN_LABELS } from '../constants';
import type { MessageColumnConfig } from '../types';

/** Columns that expose extra configuration (decoder / display format / preview fields). */
const CONFIGURABLE = new Set(['timestamp', 'key', 'value']);

export type ColumnListProps = {
  columns: MessageColumnConfig[];
  onColumnsChange: (columns: MessageColumnConfig[]) => void;
  /** Per-column config content, rendered inside the expander of configurable columns. */
  renderConfig: (columnId: MessageColumnConfig['id']) => ReactNode;
  /** Short summary shown next to the config toggle (e.g. current format/decoder). */
  configSummary: (columnId: MessageColumnConfig['id']) => string;
};

export const ColumnList = ({ columns, onColumnsChange, renderConfig, configSummary }: ColumnListProps) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggleVisible = (id: MessageColumnConfig['id']) => {
    onColumnsChange(columns.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));
  };

  return (
    <SortableList
      aria-label="Message columns"
      onValueChange={(order) => onColumnsChange(order.flatMap((id) => columns.filter((column) => column.id === id)))}
      value={columns.map((column) => column.id)}
    >
      {(order) => (
        <div className="flex flex-col gap-1.5">
          {order
            .flatMap((id) => columns.filter((column) => column.id === id))
            .map((column) => (
              <SortableItem
                className={cn(
                  'rounded-md border bg-card',
                  'data-grabbed:shadow-md data-grabbed:ring-1 data-grabbed:ring-primary/40'
                )}
                key={column.id}
                value={column.id}
              >
                <div className="flex items-center gap-2 px-1.5 py-1.5">
                  <ElementTooltip content="Drag to reorder">
                    <SortableHandle
                      aria-label={`Reorder ${COLUMN_LABELS[column.id]}`}
                      className="cursor-grab text-muted-foreground/60"
                      value={column.id}
                    >
                      <GripVerticalIcon className="size-4" />
                      <span className="sr-only">Drag to reorder</span>
                    </SortableHandle>
                  </ElementTooltip>
                  <Checkbox
                    aria-labelledby={`column-label-${column.id}`}
                    checked={column.visible}
                    onCheckedChange={() => toggleVisible(column.id)}
                    testId={`column-toggle-${column.id}`}
                  />
                  <span className="flex-1 text-body" id={`column-label-${column.id}`}>
                    {COLUMN_LABELS[column.id]}
                  </span>
                  {CONFIGURABLE.has(column.id) && (
                    <ConsoleButton
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-1.5 py-1 text-body-sm text-muted-foreground hover:bg-muted',
                        expanded === column.id && 'bg-muted text-foreground'
                      )}
                      data-testid={`column-config-${column.id}`}
                      onClick={() => setExpanded((prev) => (prev === column.id ? null : column.id))}
                      type="button"
                      variant="unstyled"
                    >
                      <Settings2Icon className="size-3.5" />
                      <span className="max-w-36 overflow-hidden text-ellipsis whitespace-nowrap">
                        {configSummary(column.id)}
                      </span>
                      <span className={cn('block transition-transform', expanded === column.id && 'rotate-180')}>
                        <ChevronDownIcon className="size-3" />
                      </span>
                    </ConsoleButton>
                  )}
                </div>
                {expanded === column.id && <div className="border-t px-3 py-3">{renderConfig(column.id)}</div>}
              </SortableItem>
            ))}
        </div>
      )}
    </SortableList>
  );
};
