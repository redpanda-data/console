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

import { Badge, Flex, Text } from '@redpanda-data/ui';
import { BanIcon } from 'components/icons';
import type { FC } from 'react';

export const EmptyBadge: FC<{ mode: 'empty' | 'null' }> = ({ mode }) => (
  <Badge variant="inverted">
    <Flex gap={2} verticalAlign="center">
      <BanIcon size={16} />
      <Text>
        {
          {
            empty: 'Empty',
            null: 'Null',
          }[mode]
        }
      </Text>
    </Flex>
  </Badge>
);
