/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Box, Icon, Text } from '@redpanda-data/ui';
import { ChevronDownIcon, ChevronUpIcon } from 'components/icons';
import { useState } from 'react';

export function ExpandableText(p: { children: string; maxChars: number }) {
  const [expanded, setExpanded] = useState(false);

  const showExpander = p.children.length > p.maxChars;

  const isTruncated = showExpander && !expanded;
  const text = isTruncated ? p.children.slice(0, p.maxChars) : p.children;

  return (
    <Text>
      {text}

      {Boolean(isTruncated) && '...'}

      {Boolean(showExpander) && (
        <Box
          cursor="pointer"
          display="inline"
          fontWeight="semibold"
          mt="1px"
          onClick={() => setExpanded(!expanded)}
          px="2"
          userSelect="none"
        >
          {expanded ? (
            <span style={{ whiteSpace: 'nowrap' }}>
              less <Icon as={ChevronUpIcon} />
            </span>
          ) : (
            <span style={{ whiteSpace: 'nowrap' }}>
              more <Icon as={ChevronDownIcon} />
            </span>
          )}
        </Box>
      )}
    </Text>
  );
}
