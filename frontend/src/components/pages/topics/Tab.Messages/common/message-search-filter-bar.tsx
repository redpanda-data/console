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

import { CloseIcon, SettingsIcon } from 'components/icons';
import { cn } from 'components/redpanda-ui/lib/utils';
import type { FC } from 'react';

import type { FilterEntry } from '../../../../../state/ui';

type MessageSearchFilterBarProps = {
  filters: FilterEntry[];
  onEdit: (filter: FilterEntry) => void;
  onToggle: (filterId: string) => void;
  onRemove: (filterId: string) => void;
};

export const MessageSearchFilterBar: FC<MessageSearchFilterBarProps> = ({ filters, onEdit, onToggle, onRemove }) => {
  return (
    <div className="col-span-full flex justify-between" data-testid="message-filter-bar">
      <div className="inline-flex flex-wrap items-center gap-2">
        {/* Existing Tags List  */}
        {filters?.map((e) => (
          <div
            className={cn(
              'inline-flex select-none items-center rounded-md border bg-card text-sm shadow-sm',
              !e.isActive && 'bg-muted text-muted-foreground'
            )}
            data-testid={`message-filter-tag-${e.id}`}
            key={e.id}
          >
            <button
              aria-label="Edit filter"
              className="flex items-center px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
              data-testid={`message-filter-edit-${e.id}`}
              onClick={() => {
                onEdit(e);
              }}
              type="button"
            >
              <SettingsIcon size={14} />
            </button>
            <button
              className={cn('border-x px-2 py-1 transition-colors hover:bg-accent', !e.isActive && 'line-through')}
              data-testid={`message-filter-toggle-${e.id}`}
              onClick={() => onToggle(e.id)}
              type="button"
            >
              {e.name || e.code || 'New Filter'}
            </button>
            <button
              aria-label="Remove filter"
              className="flex items-center px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
              data-testid={`message-filter-remove-${e.id}`}
              onClick={() => onRemove(e.id)}
              type="button"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
