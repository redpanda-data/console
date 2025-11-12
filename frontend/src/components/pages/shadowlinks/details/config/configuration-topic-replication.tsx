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

'use client';

import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Text } from 'components/redpanda-ui/components/typography';
import type { ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';

export interface ConfigurationTopicReplicationProps {
  shadowLink: ShadowLink;
}

export const ConfigurationTopicReplication = ({ shadowLink: _shadowLink }: ConfigurationTopicReplicationProps) => (
  <Card testId="topic-replication-placeholder-card">
    <CardContent className="py-8 text-center">
      <Text className="text-muted-foreground">Topic config replication configuration coming soon</Text>
    </CardContent>
  </Card>
);
