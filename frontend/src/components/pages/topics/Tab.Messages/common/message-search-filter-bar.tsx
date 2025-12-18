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

import { Box, GridItem, Tag, TagCloseButton, TagLabel } from '@redpanda-data/ui';
import type { FC } from 'react';
import { MdOutlineSettings } from 'react-icons/md';

import type { FilterEntry } from '../../../../../state/ui';

type MessageSearchFilterBarProps = {
  filters: FilterEntry[];
  onEdit: (filter: FilterEntry) => void;
  onToggle: (filterId: string) => void;
  onRemove: (filterId: string) => void;
};

export const MessageSearchFilterBar: FC<MessageSearchFilterBarProps> = ({ filters, onEdit, onToggle, onRemove }) => {
  return (
    <GridItem data-testid="message-filter-bar" display="flex" gridColumn="-1/1" justifyContent="space-between">
      <Box columnGap="8px" display="inline-flex" flexWrap="wrap" rowGap="2px" width="calc(100% - 200px)">
        {/* Existing Tags List  */}
        {filters?.map((e) => (
          <Tag
            className={e.isActive ? 'filterTag' : 'filterTag filterTagDisabled'}
            data-testid={`message-filter-tag-${e.id}`}
            key={e.id}
            style={{ userSelect: 'none' }}
          >
            <MdOutlineSettings
              data-testid={`message-filter-edit-${e.id}`}
              onClick={() => {
                onEdit(e);
              }}
              size={14}
            />
            <TagLabel
              alignItems="center"
              border="0px solid hsl(0 0% 85% / 1)"
              borderWidth="0px 1px"
              data-testid={`message-filter-toggle-${e.id}`}
              display="inline-flex"
              height="100%"
              mx="2"
              onClick={() => onToggle(e.id)}
              px="6px"
              textDecoration={e.isActive ? '' : 'line-through'}
            >
              {e.name || e.code || 'New Filter'}
            </TagLabel>
            <TagCloseButton
              data-testid={`message-filter-remove-${e.id}`}
              m="0"
              onClick={() => onRemove(e.id)}
              opacity={1}
              px="1"
            />
          </Tag>
        ))}
      </Box>
    </GridItem>
  );
};
