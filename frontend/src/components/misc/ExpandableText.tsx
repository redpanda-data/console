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

import { useState } from 'react';
import { Box, Icon, Text } from '@redpanda-data/ui';
import { ChevronUpIcon, ChevronDownIcon } from '@chakra-ui/icons';

export function ExpandableText(p: { children: string, maxChars: number }) {
    const [expanded, setExpanded] = useState(false);

    const showExpander = p.children.length > p.maxChars;

    const isTruncated = showExpander && !expanded;
    const text = isTruncated ? p.children.slice(0, p.maxChars) : p.children;

    return <Text>
        {text}

        {isTruncated && <>...</>}

        {showExpander &&
            <Box display="inline" onClick={() => setExpanded(!expanded)} fontWeight="semibold" cursor="pointer" px="2" userSelect="none" mt="1px">
                {expanded
                    ? <>Less <Icon as={ChevronUpIcon} /></>
                    : <>More <Icon as={ChevronDownIcon} /></>
                }
            </Box>
        }
    </Text>

}
