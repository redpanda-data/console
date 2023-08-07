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
import { Flex } from '@redpanda-data/ui';
import { Statistic } from '../../misc/Statistic';

const StatsSeparator = () => <div style={{ width: '1px', background: '#8883', margin: '0 1.5rem', marginLeft: 0 }} />


// todo: rename QuickInfo
export const TopicQuickInfoStatistic = observer((p: { topic: Topic }) => {
    const topic = p.topic;
    const statsAr = [] as JSX.Element[];

    // Size
    const size = <Statistic key="size" title="Size" value={topic
        ? prettyBytesOrNA(topic.logDirSummary.totalSizeBytes)
        : '...'} />
    statsAr.push(size);

    // Messages
    const partitions = api.topicPartitions.get(topic.topicName);
    let messageSum: null | string;
    if (partitions === undefined) messageSum = '...'; // no response yet
    else if (partitions === null) messageSum = 'N/A'; // explicit null -> not allowed
    else messageSum = partitions.sum(p => (p.waterMarkHigh - p.waterMarkLow)).toString();
    statsAr.push(<Statistic key="msgs" title="Messages" value={messageSum} />);

    // Config Entries / Seperator
    const configEntries = api.topicConfig.get(topic.topicName)?.configEntries;
    const filteredConfigEntries = filterTopicConfig(configEntries);
    const cleanupPolicy = configEntries?.find(x => x.name == 'cleanup.policy')?.value;
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

        const configStats = dynamicEntries
            .map(favName => filteredConfigEntries!.find(e => e.name === favName))
            .filter(e => e != null)
            .map((configEntry) =>
                <Statistic
                    key={(configEntry!.name)}
                    title={(configEntry!.name)}
                    value={formatConfigValue(configEntry!.name, configEntry?.value, 'friendly')}
                />
            );

        if (configStats.length > 0)
            statsAr.push(<StatsSeparator key={'separator'} />);

        statsAr.push(...configStats);
    }

    return <Flex>{statsAr}</Flex>
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
