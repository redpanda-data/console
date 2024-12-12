/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { observer } from 'mobx-react';
import { api } from '../../../state/backendApi';
import type { ConfigEntry, Topic } from '../../../state/restInterfaces';
import '../../../utils/arrayExtensions';
import { Box, Divider, Flex, Text, Tooltip } from '@redpanda-data/ui';
import { MdInfoOutline } from 'react-icons/md';
import { formatConfigValue } from '../../../utils/formatters/ConfigValueFormatter';
import { prettyBytesOrNA } from '../../../utils/utils';
import type { CleanupPolicyType } from './types';

// todo: rename QuickInfo
export const TopicQuickInfoStatistic = observer((p: { topic: Topic }) => {
  const topic = p.topic;

  // Messages
  const partitions = api.topicPartitions.get(topic.topicName);

  let messageSum: null | string;

  if (partitions === undefined) {
    messageSum = '...'; // no response yet
  } else if (partitions === null) {
    messageSum = 'N/A'; // explicit null -> not allowed
  } else {
    messageSum = partitions.sum((p) => p.waterMarkHigh - p.waterMarkLow).toString();
  }

  // Config Entries / Separator
  const configEntries = api.topicConfig.get(topic.topicName)?.configEntries;
  const filteredConfigEntries = filterTopicConfig(configEntries);
  const cleanupPolicy = configEntries?.find((x) => x.name === 'cleanup.policy')?.value;

  const retentionMs = filteredConfigEntries?.find((e) => e.name === 'retention.ms');
  const retentionBytes = filteredConfigEntries?.find((e) => e.name === 'retention.bytes');

  const segmentMs = filteredConfigEntries?.find((e) => e.name === 'segment.ms');
  const segmentBytes = filteredConfigEntries?.find((e) => e.name === 'segment.bytes');

  if (!configEntries || !filteredConfigEntries || !cleanupPolicy) {
    return null;
  }

  return (
    <Flex as="dl" gap={4} my={4}>
      <Flex gap={2}>
        <Text as="dt" fontWeight="bold">
          Size:
        </Text>
        <Text as="dd">{topic ? prettyBytesOrNA(topic.logDirSummary.totalSizeBytes) : '...'}</Text>
      </Flex>
      <Box>
        <Divider orientation="vertical" />
      </Box>
      <Flex gap={2}>
        <Tooltip
          label="The number of messages shown is an estimate. This is calculated by summing the differences between the highest and lowest offsets in each partition. The actual number of messages may vary due to factors such as message deletions, log compaction, and uncommitted or transactional messages."
          hasArrow
          placement="bottom"
        >
          <Flex alignItems="flex-end">
            <MdInfoOutline size={16} />
          </Flex>
        </Tooltip>
        <Text as="dt" fontWeight="bold">
          Estimated messages:
        </Text>
        <Text as="dd">{messageSum}</Text>
      </Flex>
      <Box>
        <Divider orientation="vertical" />
      </Box>
      {cleanupPolicy && (
        <Flex gap={2}>
          <Text as="dt" fontWeight="bold">
            Cleanup Policy:
          </Text>
          <Text as="dd">
            {(
              {
                compact: 'Compact',
                'compact,delete': 'Compact & Delete',
                delete: 'Delete',
              } as Record<CleanupPolicyType, string>
            )[cleanupPolicy as CleanupPolicyType] ?? ''}
          </Text>
        </Flex>
      )}
      <Box>
        <Divider orientation="vertical" />
      </Box>
      <Flex gap={2}>
        {cleanupPolicy === 'compact' && (
          <>
            <Text as="dt" fontWeight="bold">
              Segment:
            </Text>
            {segmentMs && segmentBytes && (
              <Text as="dd">
                ~
                <>
                  {formatConfigValue(segmentMs.name, segmentMs.value, 'friendly')} or{' '}
                  {formatConfigValue(segmentBytes.name, segmentBytes.value, 'friendly')}
                  {Number.isFinite(Number(segmentBytes.value)) && Number(segmentBytes.value) !== -1 && ' / partition'}
                </>
              </Text>
            )}
          </>
        )}

        {cleanupPolicy === 'delete' && (
          <>
            <Text as="dt" fontWeight="bold">
              Retention:
            </Text>
            {retentionMs && retentionBytes && (
              <Text as="dd">
                ~
                {retentionMs.value === '-1' && retentionBytes.value === '-1' ? (
                  'Unlimited'
                ) : (
                  <>
                    {formatConfigValue(retentionMs.name, retentionMs.value, 'friendly')} or{' '}
                    {formatConfigValue(retentionBytes.name, retentionBytes.value, 'friendly')}
                    {Number.isFinite(Number(retentionBytes.value)) &&
                      Number(retentionBytes.value) !== -1 &&
                      ' / partition'}
                  </>
                )}
              </Text>
            )}
          </>
        )}
      </Flex>
    </Flex>
  );
});

function filterTopicConfig(config: ConfigEntry[] | null | undefined): ConfigEntry[] | null | undefined {
  if (!config) return config;

  const newConfig: ConfigEntry[] = [];
  for (const e of config) newConfig.push(e);

  if (config.find((e) => e.name === 'cleanup.policy' && (e.value ?? '').includes('compact'))) {
    // this is a compacted topic, 'retention.bytes', 'retention.ms' don't apply, so hide them
    newConfig.removeAll((e) => e.name === 'retention.bytes' || e.name === 'retention.ms');
  }

  return newConfig;
}
