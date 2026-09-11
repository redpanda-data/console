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

import { Badge } from 'components/redpanda-ui/components/badge';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

export const ShadowTopicStatusBadge = ({ state }: { state: ShadowTopicState }) => {
  const stateInfo = {
    [ShadowTopicState.UNSPECIFIED]: {
      text: 'Unknown',
      tone: 'default' as const,
    },
    [ShadowTopicState.ACTIVE]: {
      text: 'Active',
      tone: 'success' as const,
    },
    [ShadowTopicState.FAULTED]: {
      text: 'Error',
      tone: 'destructive' as const,
    },
    [ShadowTopicState.PAUSED]: {
      text: 'Paused',
      tone: 'warning' as const,
    },
    [ShadowTopicState.FAILING_OVER]: {
      text: 'Failing over',
      tone: 'warning' as const,
    },
    [ShadowTopicState.FAILED_OVER]: {
      text: 'Failed over',
      tone: 'informative' as const,
    },
    [ShadowTopicState.PROMOTING]: {
      text: 'Promoting',
      tone: 'informative' as const,
    },
    [ShadowTopicState.PROMOTED]: {
      text: 'Promoted',
      tone: 'informative' as const,
    },
  }[state] || { text: 'Unknown', tone: 'default' as const };

  return (
    <Badge tone={stateInfo.tone} variant="subtle">
      {stateInfo.text}
    </Badge>
  );
};
