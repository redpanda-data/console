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

import { Badge, type BadgeEmphasis, type BadgeTone } from 'components/redpanda-ui/components/badge';
import { MCPIcon } from 'components/redpanda-ui/components/icons';
import { CircleUser, Link, Server, Waypoints } from 'lucide-react';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';

const getScopeConfig = (scope: Scope): { text: string; icon?: React.ReactNode } => {
  switch (scope) {
    case Scope.REDPANDA_CONNECT:
      return { text: 'Redpanda Connect', icon: <Link className="h-3 w-3" /> };
    case Scope.REDPANDA_CLUSTER:
      return { text: 'Cluster', icon: <Server className="h-3 w-3" /> };
    case Scope.MCP_SERVER:
      return { text: 'MCP Server', icon: <MCPIcon className="h-3 w-3" /> };
    case Scope.AI_AGENT:
      return { text: 'AI Agent', icon: <CircleUser className="h-3 w-3" /> };
    case Scope.AI_GATEWAY:
      return { text: 'AI Gateway', icon: <Waypoints className="h-3 w-3" /> };
    case Scope.UNSPECIFIED:
      return { text: 'Unspecified' };
    default:
      return { text: 'Unknown' };
  }
};

export const SecretScopeBadge = ({
  scope,
  tone = 'primary',
  variant = 'subtle',
}: {
  scope: Scope;
  tone?: BadgeTone;
  variant?: BadgeEmphasis;
}) => {
  const config = getScopeConfig(scope);
  return (
    <Badge icon={config.icon} tone={tone} variant={variant}>
      {config.text}
    </Badge>
  );
};
