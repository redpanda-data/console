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

import { SettingsIcon } from 'components/icons';
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
      <div className="inline-flex flex-wrap gap-x-2 gap-y-0.5" style={{ width: 'calc(100% - 200px)' }}>
        {/* Existing Tags List  */}
        {filters?.map((e) => (
          <div
            className={e.isActive ? 'filterTag' : 'filterTag filterTagDisabled'}
            data-testid={`message-filter-tag-${e.id}`}
            key={e.id}
            style={{ userSelect: 'none' }}
          >
            <SettingsIcon
              data-testid={`message-filter-edit-${e.id}`}
              onClick={() => {
                onEdit(e);
              }}
              size={14}
            />
            <button
              className="mx-2 inline-flex h-full items-center border-x px-1.5"
              data-testid={`message-filter-toggle-${e.id}`}
              onClick={() => onToggle(e.id)}
              style={{ textDecoration: e.isActive ? '' : 'line-through' }}
              type="button"
            >
              {e.name || e.code || 'New Filter'}
            </button>
            <button
              className="m-0 px-1 opacity-100"
              data-testid={`message-filter-remove-${e.id}`}
              onClick={() => onRemove(e.id)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
