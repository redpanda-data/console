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

import { ConfigEntry, Topic } from '../../../state/restInterfaces';
import { observer } from 'mobx-react';
import { api } from '../../../state/backendApi';
import '../../../utils/arrayExtensions';
import { prettyBytesOrNA } from '../../../utils/utils';
import { formatConfigValue } from '../../../utils/formatters/ConfigValueFormatter';
import { Box, Flex, Text, Divider, Tooltip } from '@redpanda-data/ui';
import { MdInfoOutline } from 'react-icons/md';
import { Fragment } from 'react';

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
        messageSum = partitions.sum(p => (p.waterMarkHigh - p.waterMarkLow)).toString();
    }

    // Config Entries / Separator
    const configEntries = api.topicConfig.get(topic.topicName)?.configEntries;
    const filteredConfigEntries = filterTopicConfig(configEntries);
    const cleanupPolicy = configEntries?.find(x => x.name == 'cleanup.policy')?.value;
    let configStats: Array<ConfigEntry | undefined> = []
    if (configEntries && filteredConfigEntries && cleanupPolicy) {
        const dynamicEntries = ['cleanup.policy'];

        if (cleanupPolicy.includes('delete')) {
            dynamicEntries.push('retention.ms');
            dynamicEntries.push('retention.bytes');
        }
        if (cleanupPolicy.includes('compact')) {
            dynamicEntries.push('segment.ms');
            dynamicEntries.push('segment.bytes');
        }

        configStats = dynamicEntries
          .map(favName => filteredConfigEntries!.find(e => e.name===favName))
          .filter(e => e!=null);
    }

    return (
      <Flex as="dl" gap={4} my={4}>
          <Flex gap={2}>
              <Text as="dt" fontWeight="bold">
                  Size:
              </Text>
              <Text as="dd">
                  {!!topic ? prettyBytesOrNA(topic.logDirSummary.totalSizeBytes):'...'}
              </Text>
          </Flex>
          <Box>
              <Divider orientation="vertical"/>
          </Box>
          <Flex gap={2}>
              <Tooltip
                label="The number of messages shown is an estimate. This is calculated by summing the differences between the highest and lowest offsets in each partition. The actual number of messages may vary due to factors such as message deletions, log compaction, and uncommitted or transactional messages."
                hasArrow
                placement="bottom"
              >
                  <Flex alignItems="flex-end">
                      <MdInfoOutline size={16}/>
                  </Flex>
              </Tooltip>
              <Text as="dt" fontWeight="bold">
                  Estimated messages:
              </Text>
              <Text as="dd">
                  {messageSum}
              </Text>
          </Flex>
          {configStats?.map((configEntry, idx) => {
                return <Fragment key={idx}>
                    <Box>
                        <Divider orientation="vertical"/>
                    </Box>
                    <Flex gap={2}>
                        <Text as="dt" fontWeight="bold">
                            {configEntry?.name}:
                        </Text>
                        <Text as="dd">
                            {formatConfigValue(configEntry!.name, configEntry?.value, 'friendly')}
                        </Text>
                    </Flex>
                </Fragment>;
            }
          )}
      </Flex>
    );
})

function filterTopicConfig(config: ConfigEntry[] | null | undefined): ConfigEntry[] | null | undefined {
    if (!config) return config;

    const newConfig: ConfigEntry[] = [];
    for (const e of config) newConfig.push(e);

    if (config.find(e => e.name == 'cleanup.policy' && (e.value ?? '').includes('compact'))) {
        // this is a compacted topic, 'retention.bytes', 'retention.ms' don't apply, so hide them
        newConfig.removeAll(e => e.name == 'retention.bytes' || e.name == 'retention.ms');
    }

    return newConfig;
}
