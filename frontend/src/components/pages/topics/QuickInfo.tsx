import React from "react";
import { TopicConfigEntry } from "../../../state/restInterfaces";
import { Row, Statistic } from "antd";
import { observer } from "mobx-react";
import { api } from "../../../state/backendApi";
import prettyBytes from 'pretty-bytes';
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { FavoritePopover, FormatConfigValue } from "./Tab.Config";
import { uiSettings } from "../../../state/ui";


// todo: rename QuickInfo
export const TopicQuickInfoStatistic = observer((p: { topicName: string }) => {

    const topic = api.Topics?.first(t => t.topicName == p.topicName);
    if (topic === undefined) return null; // not ready yet

    let topicConfig = filterTopicConfig(api.TopicConfig.get(p.topicName));
    if (!topicConfig) return null;

    const partitions = api.TopicPartitions.get(p.topicName);
    let messageSum: null | string;
    if (partitions === undefined) messageSum = '...'; // waiting...
    else if (partitions === null) messageSum = null; // hide
    else messageSum = partitions.sum(p => (p.waterMarkHigh - p.waterMarkLow)).toString();

    return <Row >

        <Statistic title='Size' value={prettyBytes(topic.logDirSize)} />
        {messageSum && <Statistic title='Messages' value={messageSum} />}

        {uiState.topicSettings.favConfigEntries.filter(tce => !!tce).length > 0
            ? <div style={{ width: '1px', background: '#8883', margin: '0 1.5rem', marginLeft: 0 }} />
            : null}

        {
            topicConfig && uiState.topicSettings.favConfigEntries
                .map(fav => topicConfig!.find(tce => tce.name === fav))
                .filter(tce => tce)
                .map(configEntry =>
                    FavoritePopover(configEntry!, <Statistic title={(configEntry!.name)} value={FormatConfigValue(configEntry!.name, configEntry!.value, uiSettings.topicList.valueDisplay)} />)
                )
        }
    </Row>
})

function filterTopicConfig(config: TopicConfigEntry[] | null | undefined): TopicConfigEntry[] | null | undefined {
    if (!config) return config;

    const newConfig: TopicConfigEntry[] = [];
    for (const e of config) newConfig.push(e);

    if (config.find(e => e.name == 'cleanup.policy' && e.value.includes('compact'))) {
        // this is a compacted topic, 'retention.bytes', 'retention.ms' don't apply, so hide them
        newConfig.removeAll(e => e.name == 'retention.bytes' || e.name == 'retention.ms');
    }

    return newConfig;
}