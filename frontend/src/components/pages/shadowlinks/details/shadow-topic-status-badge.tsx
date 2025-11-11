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
    [ShadowTopicState.UNSPECIFIED]: { text: 'Unknown', variant: 'gray' as const },
    [ShadowTopicState.ACTIVE]: { text: 'Active', variant: 'green' as const },
    [ShadowTopicState.FAULTED]: { text: 'Error', variant: 'red' as const },
    [ShadowTopicState.PAUSED]: { text: 'Paused', variant: 'yellow' as const },
    [ShadowTopicState.FAILING_OVER]: { text: 'Failing over', variant: 'orange' as const },
    [ShadowTopicState.FAILED_OVER]: { text: 'Failed over', variant: 'blue' as const },
    [ShadowTopicState.PROMOTING]: { text: 'Promoting', variant: 'purple' as const },
    [ShadowTopicState.PROMOTED]: { text: 'Promoted', variant: 'purple' as const },
  }[state] || { text: 'Unknown', variant: 'gray' as const };

  return <Badge variant={stateInfo.variant}>{stateInfo.text}</Badge>;
};
