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

import { useApiStoreHook } from '../../../state/backend-api';
import type { ConfigEntry, Topic } from '../../../state/rest-interfaces';
import '../../../utils/array-extensions';
import { Stat } from 'components/redpanda-ui/components/stat';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { InfoIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { CleanupPolicyType } from './types';
import { formatConfigValue } from '../../../utils/formatters/config-value-formatter';
import { numberToThousandsString } from '../../../utils/tsx-utils';
import { prettyBytesOrNA } from '../../../utils/utils';

const CLEANUP_POLICY_LABELS: Record<CleanupPolicyType, string> = {
  compact: 'Compact',
  'compact,delete': 'Compact & Delete',
  delete: 'Delete',
};

const ESTIMATE_HINT =
  'The number of messages shown is an estimate. This is calculated by summing the differences between the highest and lowest offsets in each partition. The actual number of messages may vary due to factors such as message deletions, log compaction, and uncommitted or transactional messages.';

// todo: rename QuickInfo
export const TopicQuickInfoStatistic = (p: { topic: Topic }) => {
  const topic = p.topic;

  // Messages
  const partitions = useApiStoreHook((s) => s.topicPartitions.get(topic.topicName));

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
  const configEntries = useApiStoreHook((s) => s.topicConfig.get(topic.topicName))?.configEntries;
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
    <div className="my-4 flex flex-wrap items-start gap-x-10 gap-y-3" data-testid="topic-quick-info">
      <Stat label="Size" value={topic ? prettyBytesOrNA(topic.logDirSummary.totalSizeBytes) : '...'} />
      <Stat
        label="Estimated messages"
        value={
          <span className="inline-flex items-center gap-1.5">
            {messageSum}
            <Tooltip>
              <TooltipTrigger
                render={<InfoIcon className="size-3.5 text-muted-foreground" data-testid="estimate-hint" />}
              />
              <TooltipContent className="max-w-sm">{ESTIMATE_HINT}</TooltipContent>
            </Tooltip>
          </span>
        }
      />
      <Stat label="Cleanup Policy" value={CLEANUP_POLICY_LABELS[cleanupPolicy as CleanupPolicyType] ?? ''} />
      {cleanupPolicy === 'compact' && segmentMs && segmentBytes && (
        <Stat
          label="Segment"
          value={
            <>
              ~{formatConfigValue(segmentMs.name, segmentMs.value, 'friendly')} or{' '}
              {formatConfigValue(segmentBytes.name, segmentBytes.value, 'friendly')}
              {Number.isFinite(Number(segmentBytes.value)) && Number(segmentBytes.value) !== -1 && ' / partition'}
            </>
          }
        />
      )}
      {cleanupPolicy === 'delete' && retentionMs && retentionBytes && (
        <>
          <Stat
            label="Retention Time"
            value={
              <>
                {retentionMs.value !== '-1' && '~'}
                {formatConfigValue(retentionMs.name, retentionMs.value, 'friendly')}
              </>
            }
          />
          <Stat
            label="Retention Size"
            value={
              <>
                {retentionBytes.value !== '-1' && '~'}
                {formatConfigValue(retentionBytes.name, retentionBytes.value, 'friendly')}
                {Number.isFinite(Number(retentionBytes.value)) && Number(retentionBytes.value) !== -1 && ' / partition'}
              </>
            }
          />
        </>
      )}
    </div>
  );
};

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
