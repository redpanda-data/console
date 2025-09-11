/**
 * Copyright 2024 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Badge, HStack, Text } from '@redpanda-data/ui';
import type { PageDefinition } from './routes';

interface SidebarItemTitleProps {
  route: PageDefinition;
}

export const getSidebarItemTitleWithBetaBadge = ({ route }: SidebarItemTitleProps) => (
  <HStack spacing="12px" key={`${route.path}-title`}>
    <Text>{route.title}</Text>
    <Badge>beta</Badge>
  </HStack>
);
