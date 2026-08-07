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

import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
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

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) {
      return;
    }
    const next = [...columns];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    onColumnsChange(next);
  };

  const toggleVisible = (id: MessageColumnConfig['id']) => {
    onColumnsChange(columns.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="message-columns">
        {(dropProvided) => (
          <div className="flex flex-col gap-1.5" ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
            {columns.map((column, index) => (
              <Draggable draggableId={column.id} index={index} key={column.id}>
                {(dragProvided, snapshot) => (
                  <div
                    className={cn(
                      'rounded-md border bg-card',
                      snapshot.isDragging && 'shadow-md ring-1 ring-primary/40'
                    )}
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                  >
                    <div className="flex items-center gap-2 px-1.5 py-1.5">
                      <span
                        className="cursor-grab text-muted-foreground/60"
                        {...dragProvided.dragHandleProps}
                        title="Drag to reorder"
                      >
                        <GripVerticalIcon className="size-4" />
                      </span>
                      <Checkbox
                        checked={column.visible}
                        onCheckedChange={() => toggleVisible(column.id)}
                        testId={`column-toggle-${column.id}`}
                      />
                      <span className="flex-1 text-[13.5px]">{COLUMN_LABELS[column.id]}</span>
                      {CONFIGURABLE.has(column.id) && (
                        <button
                          className={cn(
                            'flex items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground text-xs hover:bg-muted',
                            expanded === column.id && 'bg-muted text-foreground'
                          )}
                          data-testid={`column-config-${column.id}`}
                          onClick={() => setExpanded((prev) => (prev === column.id ? null : column.id))}
                          type="button"
                        >
                          <Settings2Icon className="size-3.5" />
                          <span className="max-w-36 overflow-hidden text-ellipsis whitespace-nowrap">
                            {configSummary(column.id)}
                          </span>
                          <ChevronDownIcon
                            className={cn('size-3 transition-transform', expanded === column.id && 'rotate-180')}
                          />
                        </button>
                      )}
                    </div>
                    {expanded === column.id && <div className="border-t px-3 py-3">{renderConfig(column.id)}</div>}
                  </div>
                )}
              </Draggable>
            ))}
            {dropProvided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};
