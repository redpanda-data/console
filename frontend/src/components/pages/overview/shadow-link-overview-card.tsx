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
import type { ShadowLink } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { prettyBytes } from 'utils/utils';

interface ShadowLinkOverviewCardProps {
  shadowLink: ShadowLink;
}

export const ShadowLinkOverviewCard: React.FC<ShadowLinkOverviewCardProps> = ({ shadowLink }) => {
  const navigate = useNavigate();

  // Calculate metrics
  const sourceCluster = shadowLink.configurations?.clientOptions?.bootstrapServers?.[0] || 'N/A';
  const totalTopics = shadowLink.status?.shadowTopicStatuses?.length || 0;
  const failoveredTopics =
    shadowLink.status?.shadowTopicStatuses?.filter(
      (topic) =>
        topic.state === ShadowTopicState.FAILED_OVER ||
        topic.state === ShadowTopicState.FAILING_OVER ||
        topic.state === ShadowTopicState.PROMOTED ||
        topic.state === ShadowTopicState.PROMOTING
    ) || [];

  // Calculate lag metrics from partition information
  const calculateLagMetrics = () => {
    const lags: number[] = [];

    for (const topic of shadowLink.status?.shadowTopicStatuses || []) {
      for (const partition of topic.partitionInformation || []) {
        const lag = Number(partition.sourceHighWatermark - partition.highWatermark);
        if (!Number.isNaN(lag) && lag >= 0) {
          lags.push(lag);
        }
      }
    }

    if (lags.length === 0) {
      return { avg: 0, max: 0 };
    }

    const sum = lags.reduce((acc, val) => acc + val, 0);
    const avg = Math.round(sum / lags.length);
    const max = Math.max(...lags);

    return { avg, max };
  };

  calculateLagMetrics(); // Calculate for future use

  // Calculate total size (approximate from partition data)
  const calculateTotalSize = () => {
    let totalMessages = 0;

    for (const topic of shadowLink.status?.shadowTopicStatuses || []) {
      for (const partition of topic.partitionInformation || []) {
        totalMessages += Number(partition.highWatermark);
      }
    }

    return totalMessages;
  };

  const totalMessages = calculateTotalSize();
  const estimatedSize = totalMessages * 1024; // Rough estimate: 1KB per message

  return (
    <Card size="full" testId="shadow-link-overview-card">
      <CardHeader>
        <CardTitle>Shadow Cluster</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {/* Visual representation */}
          <div className="relative rounded-lg border border-gray-300 p-6">
            <div className="flex items-center justify-between">
              {/* Primary Cluster */}
              <div className="flex min-w-[200px] flex-col gap-2 rounded border border-gray-300 bg-white px-4 py-3">
                <Text className="font-semibold">Primary Cluster</Text>
                <Text className="font-mono text-muted-foreground text-xs">{sourceCluster}</Text>
              </div>

              {/* Connection arrow */}
              <div className="flex flex-1 flex-col items-center justify-center px-6">
                <div className="relative my-2 h-px w-full bg-gray-400">
                  <div className="-translate-y-1/2 absolute top-1/2 right-0 h-0 w-0 border-y-4 border-y-transparent border-l-8 border-l-gray-400" />
                </div>
              </div>

              {/* DR Cluster */}
              <div className="flex min-w-[150px] flex-col gap-2 rounded border border-gray-300 bg-white px-4 py-3">
                <Text className="font-semibold">DR cluster</Text>
              </div>
            </div>

            {/* Metrics below diagram */}
            <div className="mt-4 border-gray-200 border-t pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Text className="font-medium text-sm">Number of topics being shadowed</Text>
                  <Text className="font-semibold text-lg">{totalTopics}</Text>
                </div>
                <div>
                  <Text className="font-medium text-sm">Any failovered topics</Text>
                  <Text className="font-semibold text-lg">
                    {failoveredTopics.length > 0 ? `Yes (${failoveredTopics.length})` : 'No'}
                  </Text>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded border border-gray-200 bg-gray-50 p-4">
              <Text className="font-medium text-muted-foreground text-sm">Messages</Text>
              <Text className="font-semibold text-2xl">{totalMessages.toLocaleString()}</Text>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-4">
              <Text className="font-medium text-muted-foreground text-sm">Size</Text>
              <Text className="font-semibold text-2xl">{prettyBytes(estimatedSize)}</Text>
            </div>
          </div>

          {/* Action button */}
          <div className="flex justify-start">
            <Button
              onClick={() => navigate(`/shadowlinks/${shadowLink.name}`)}
              testId="go-to-shadow-link-button"
              variant="default"
            >
              Go to Shadow link
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
