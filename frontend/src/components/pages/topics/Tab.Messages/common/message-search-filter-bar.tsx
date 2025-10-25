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
import { observer } from 'mobx-react';
import type { FC } from 'react';
import { MdOutlineSettings } from 'react-icons/md';

import type { FilterEntry } from '../../../../../state/ui';
import { uiState } from '../../../../../state/ui-state';

export const MessageSearchFilterBar: FC<{ onEdit: (filter: FilterEntry) => void }> = observer(({ onEdit }) => {
  const settings = uiState.topicSettings.searchParams;

  return (
    <GridItem display="flex" gridColumn="-1/1" justifyContent="space-between">
      <Box columnGap="8px" display="inline-flex" flexWrap="wrap" rowGap="2px" width="calc(100% - 200px)">
        {/* Existing Tags List  */}
        {settings.filters?.map((e) => (
          <Tag
            className={e.isActive ? 'filterTag' : 'filterTag filterTagDisabled'}
            key={e.id}
            style={{ userSelect: 'none' }}
          >
            <MdOutlineSettings
              onClick={() => {
                onEdit(e);
              }}
              size={14}
            />
            <TagLabel
              alignItems="center"
              border="0px solid hsl(0 0% 85% / 1)"
              borderWidth="0px 1px"
              display="inline-flex"
              height="100%"
              mx="2"
              onClick={() => (e.isActive = !e.isActive)}
              px="6px"
              textDecoration={e.isActive ? '' : 'line-through'}
            >
              {e.name || e.code || 'New Filter'}
            </TagLabel>
            <TagCloseButton m="0" onClick={() => settings.filters.remove(e)} opacity={1} px="1" />
          </Tag>
        ))}
      </Box>
    </GridItem>
  );
});
