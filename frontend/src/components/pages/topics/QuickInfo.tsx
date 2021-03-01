import React from "react";
import { TopicConfigEntry, TopicDetail } from "../../../state/restInterfaces";
import { message, Row, Statistic } from "antd";
import { observer } from "mobx-react";
import { api } from "../../../state/backendApi";
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { FavoritePopover, FormatConfigValue } from "./Tab.Config";
import { uiSettings } from "../../../state/ui";
import { prettyBytesOrNA } from "../../../utils/utils";

const StatsSeparator = () => <div style={{ width: '1px', background: '#8883', margin: '0 1.5rem', marginLeft: 0 }} />


// todo: rename QuickInfo
export const TopicQuickInfoStatistic = observer((p: { topic: TopicDetail }) => {
    const topic = p.topic;
    const statsAr = [] as JSX.Element[];

    // Size
    const size = <Statistic key='size' title='Size' value={topic ? prettyBytesOrNA(topic.logDirSize) : "..."} />
    statsAr.push(size);

    // Messages
    const partitions = api.topicPartitions.get(topic.topicName);
    let messageSum: null | string;
    if (partitions === undefined) messageSum = '...'; // no response yet
    else if (partitions === null) messageSum = "N/A"; // explicit null -> not allowed
    else messageSum = partitions.sum(p => (p.waterMarkHigh - p.waterMarkLow)).toString();
    statsAr.push(<Statistic key='msgs' title='Messages' value={messageSum} />);

    // Config Entries / Seperator
    const configEntries = filterTopicConfig(api.topicConfig.get(topic.topicName)?.configEntries);
    if (configEntries) {
        const configStats = uiState.topicSettings.favConfigEntries
            .map(favName => configEntries!.find(e => e.name === favName))
            .filter(e => e != null)
            .map(configEntry =>
                FavoritePopover(configEntry!, <Statistic key={(configEntry!.name)} title={(configEntry!.name)} value={FormatConfigValue(configEntry!.name, configEntry!.value, uiSettings.topicList.valueDisplay)} />)
            );

        if (configStats.length > 0)
            statsAr.push(<StatsSeparator key={'separator'} />);

        statsAr.push(...configStats);
    }

    return <Row>{statsAr}</Row>
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