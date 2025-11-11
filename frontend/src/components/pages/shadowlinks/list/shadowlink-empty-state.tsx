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

import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Text } from 'components/redpanda-ui/components/typography';

interface ShadowLinkEmptyStateProps {
  onCreateClick: () => void;
}

export const ShadowLinkEmptyState = ({ onCreateClick }: ShadowLinkEmptyStateProps) => (
  <Card size={'full'}>
    <CardHeader>
      <CardTitle>Shadowing</CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <Text>
        Shadowing is Redpanda's disaster recovery solution that protects your data from regional outages. It
        continuously replicates your topics to a separate cluster in a different location, creating a live backup that
        stays up-to-date.
      </Text>
      <Text>
        Think of it as an insurance policy for your data. Your source cluster handles all production traffic while the
        shadow cluster maintains a read-only copy. If disaster strikes and your primary region goes down, you can
        quickly switch to the shadow cluster with minimal data loss.
      </Text>
      <Text>
        Shadowing preserves everything: your data, offsets, timestamps, and consumer positions. This means your
        applications can resume exactly where they left off after a failover.
      </Text>
      <Text>Get started by creating your first shadow link to connect a source topic to a destination cluster.</Text>
      <div>
        <Button onClick={onCreateClick} testId="create-shadowlink-button">
          Create Shadow link
        </Button>
      </div>
    </CardContent>
  </Card>
);
