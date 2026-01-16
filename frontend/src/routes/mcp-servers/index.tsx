/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { createFileRoute } from '@tanstack/react-router';
import { WrenchIcon } from 'components/icons';

import { RemoteMCPListPage } from '../../components/pages/mcp-servers/list/remote-mcp-list-page';

export const Route = createFileRoute('/mcp-servers/')({
  staticData: {
    title: 'MCP Servers',
    icon: WrenchIcon,
  },
  component: RemoteMCPListPage,
});
