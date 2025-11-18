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
import { CodeBlock, Pre } from 'components/redpanda-ui/components/code-block';
import { Text } from 'components/redpanda-ui/components/typography';

const ShadowingDescription = () => (
  <>
    <Text>
      Shadowing protects your data from regional outages. It continuously replicates topics to a separate cluster in a
      different region, creating an up-to-date backup.
    </Text>
    <Text>
      Think of it as an insurance policy for your data. The source cluster handles all production traffic, while the
      shadow cluster maintains a read-only copy. If your primary region goes down, you can quickly switch to the shadow
      cluster with minimal data loss.
    </Text>
    <Text>
      Shadowing preserves everything: your data, offsets, timestamps, and consumer positions. This means your
      applications can resume exactly where they left off after a failover.
    </Text>
  </>
);

interface ShadowLinkEmptyStateProps {
  onCreateClick: () => void;
}

export const ShadowLinkEmptyState = ({ onCreateClick }: ShadowLinkEmptyStateProps) => (
  <Card size={'full'}>
    <CardHeader>
      <CardTitle>Shadowing</CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <ShadowingDescription />
      <Text>Create a shadow link to connect your source cluster to your shadow cluster.</Text>
      <div>
        <Button onClick={onCreateClick} testId="create-shadowlink-button">
          Create shadow link
        </Button>
      </div>
    </CardContent>
  </Card>
);

export const ShadowLinkFeatureDisabledState = () => (
  <Card data-testid="shadowlink-feature-disabled-card" size="full">
    <CardHeader>
      <CardTitle>Shadowing</CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <ShadowingDescription />
      <Text>To get started, run the following command to enable Shadowing on your cluster:</Text>
      <CodeBlock testId="shadowlink-enable-command">
        <Pre>rpk cluster config set enable_shadow_linking true</Pre>
      </CodeBlock>
    </CardContent>
  </Card>
);
