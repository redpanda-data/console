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

import { RemoteMCPCreatePage } from '../../components/pages/mcp-servers/create/remote-mcp-create-page';

export const Route = createFileRoute('/mcp-servers/create')({
  staticData: {
    title: 'Create Remote MCP Server',
  },
  component: RemoteMCPCreatePage,
});
