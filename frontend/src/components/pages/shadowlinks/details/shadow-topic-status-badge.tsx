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
      variant: 'neutral-inverted' as const,
    },
    [ShadowTopicState.ACTIVE]: {
      text: 'Active',
      variant: 'success-inverted' as const,
    },
    [ShadowTopicState.FAULTED]: {
      text: 'Error',
      variant: 'destructive-inverted' as const,
    },
    [ShadowTopicState.PAUSED]: {
      text: 'Paused',
      variant: 'warning-inverted' as const,
    },
    [ShadowTopicState.FAILING_OVER]: {
      text: 'Failing over',
      variant: 'warning-inverted' as const,
    },
    [ShadowTopicState.FAILED_OVER]: {
      text: 'Failed over',
      variant: 'info-inverted' as const,
    },
    [ShadowTopicState.PROMOTING]: {
      text: 'Promoting',
      variant: 'info-inverted' as const,
    },
    [ShadowTopicState.PROMOTED]: {
      text: 'Promoted',
      variant: 'info-inverted' as const,
    },
  }[state] || { text: 'Unknown', variant: 'neutral-inverted' as const };

  return <Badge variant={stateInfo.variant}>{stateInfo.text}</Badge>;
};
