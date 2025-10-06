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

import { HStack, Text } from '@redpanda-data/ui';

import { SidebarItemBadge } from './misc/sidebar-item-badge';
import type { PageDefinition } from './routes';

interface SidebarItemTitleProps {
  route: PageDefinition;
}

export const getSidebarItemTitleWithBetaBadge = ({ route }: SidebarItemTitleProps) => (
  <HStack key={`${route.path}-title`} spacing="12px">
    <Text>{route.title}</Text>
    <SidebarItemBadge>beta</SidebarItemBadge>
  </HStack>
);
