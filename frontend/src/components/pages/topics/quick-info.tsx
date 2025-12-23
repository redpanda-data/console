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

import { api } from '../../../state/backend-api';
import type { ConfigEntry, Topic } from '../../../state/rest-interfaces';
import '../../../utils/array-extensions';
import { Box, Divider, Flex, Text, Tooltip } from '@redpanda-data/ui';
import { InfoIcon } from 'components/icons';
import type { ReactNode } from 'react';

import type { CleanupPolicyType } from './types';
import { formatConfigValue } from '../../../utils/formatters/config-value-formatter';
import { numberToThousandsString } from '../../../utils/tsx-utils';
import { prettyBytesOrNA } from '../../../utils/utils';

// todo: rename QuickInfo
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
export const TopicQuickInfoStatistic = observer((p: { topic: Topic }) => {
  const topic = p.topic;

  // Messages
  const partitions = api.topicPartitions.get(topic.topicName);

  let messageSum: ReactNode;

  if (partitions === undefined) {
    messageSum = '...'; // no response yet
  } else if (partitions === null) {
    messageSum = 'N/A'; // explicit null -> not allowed
  } else {
    const totalMessages = partitions.sum((partition) => partition.waterMarkHigh - partition.waterMarkLow);
    messageSum = numberToThousandsString(totalMessages);
  }

  // Config Entries / Separator
  const configEntries = api.topicConfig.get(topic.topicName)?.configEntries;
  const filteredConfigEntries = filterTopicConfig(configEntries);
  const cleanupPolicy = configEntries?.find((x) => x.name === 'cleanup.policy')?.value;

  const retentionMs = filteredConfigEntries?.find((e) => e.name === 'retention.ms');
  const retentionBytes = filteredConfigEntries?.find((e) => e.name === 'retention.bytes');

  const segmentMs = filteredConfigEntries?.find((e) => e.name === 'segment.ms');
  const segmentBytes = filteredConfigEntries?.find((e) => e.name === 'segment.bytes');

  if (!(configEntries && filteredConfigEntries && cleanupPolicy)) {
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
          hasArrow
          label="The number of messages shown is an estimate. This is calculated by summing the differences between the highest and lowest offsets in each partition. The actual number of messages may vary due to factors such as message deletions, log compaction, and uncommitted or transactional messages."
          placement="bottom"
        >
          <Flex alignItems="flex-end">
            <InfoIcon size={16} />
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
      {Boolean(cleanupPolicy) && (
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
            {segmentMs && segmentBytes ? (
              <Text as="dd">
                ~{formatConfigValue(segmentMs.name, segmentMs.value, 'friendly')} or{' '}
                {formatConfigValue(segmentBytes.name, segmentBytes.value, 'friendly')}
                {Number.isFinite(Number(segmentBytes.value)) && Number(segmentBytes.value) !== -1 && ' / partition'}
              </Text>
            ) : null}
          </>
        )}

        {cleanupPolicy === 'delete' && (
          <>
            <Text as="dt" fontWeight="bold">
              Retention:
            </Text>
            {retentionMs && retentionBytes ? (
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
            ) : null}
          </>
        )}
      </Flex>
    </Flex>
  );
});

function filterTopicConfig(config: ConfigEntry[] | null | undefined): ConfigEntry[] | null | undefined {
  if (!config) {
    return config;
  }

  const newConfig: ConfigEntry[] = [];
  for (const e of config) {
    newConfig.push(e);
  }

  if (config.find((e) => e.name === 'cleanup.policy' && (e.value ?? '').includes('compact'))) {
    // this is a compacted topic, 'retention.bytes', 'retention.ms' don't apply, so hide them
    newConfig.removeAll((e) => e.name === 'retention.bytes' || e.name === 'retention.ms');
  }

  return newConfig;
}
