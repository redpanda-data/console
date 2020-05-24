import React, { Component, CSSProperties, useState } from "react";
import { Row, Tabs, Skeleton, Radio, Checkbox, Button, Select, Input, Typography, Result, Space } from "antd";
import { observer } from "mobx-react";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { PageComponent, PageInitHelper } from "../Page";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { TopicQuickInfoStatistic } from "./Topic.QuickInfo";
import { TopicConfiguration } from "./Topic.Config";
import { TopicMessageView } from "./Topic.Messages";
import { appGlobal } from "../../../state/appGlobal";
import { TopicPartitions } from "./Topic.Partitions";
import { TopicConfigEntry } from "../../../state/restInterfaces";
import Card from "../../misc/Card";
import { TopicConsumers } from "./Topic.Consumers";
import { simpleUniqueId } from "../../../utils/utils";
import { Label, ObjToKv, OptionGroup } from "../../../utils/tsxUtils";

const { Text } = Typography;

@observer
class TopicDetails extends PageComponent<{ topicName: string }> {

    initPage(p: PageInitHelper): void {
        const topicName = this.props.topicName;
        uiState.currentTopicName = topicName;

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);

        p.title = topicName;
        p.addBreadcrumb('Topics', '/topics');
        p.addBreadcrumb(topicName, '/topics/' + topicName);
    }

    refreshData(force: boolean) {
        api.refreshTopics(force);
        api.refreshTopicConfig(this.props.topicName, force);
        api.refreshTopicPartitions(this.props.topicName, force);

        if (uiState.topicSettings.activeTabKey == 'consumers') // don't refresh unless needed, it's expensive
            api.refreshTopicConsumers(this.props.topicName, force);
    }

    get tabPageKey() {
        const tabs = ['partitions', 'messages', 'configuration', 'consumers'];

        // use url anchor if possible
        let key = (appGlobal.history.location.hash).replace("#", "");
        if (tabs.includes(key)) return key;

        // use settings (last visited tab)
        key = uiState.topicSettings.activeTabKey!;
        if (tabs.includes(key)) return key;

        // default to partitions
        return 'partitions'
    }

    componentDidMount() {
        // fix anchor
        const anchor = '#' + this.tabPageKey;
        const location = appGlobal.history.location;
        if (location.hash !== anchor) {
            location.hash = anchor;
            appGlobal.history.replace(location);
        }
    }

    render() {
        const topicName = this.props.topicName;
        // todo: we shouldn't prepare data here. Instead we should create actions that obtain
        // the data and pass those to the components, they should be responsible to handle 'undefined' themselves.
        if (!api.Topics) return this.skeleton;
        const topic = api.Topics.find(e => e.topicName == topicName);
        if (!topic) return this.topicNotFound(topicName);
        const topicConfig = api.TopicConfig.get(topicName);
        if (!topicConfig) return this.skeleton;

        let messageSum: null | string = '...';
        let partitions = api.TopicPartitions.get(topic.topicName);
        if (partitions)
            messageSum = partitions.sum(p => (p.waterMarkHigh - p.waterMarkLow)).toString();

        setTimeout(() => this.addBaseFavs(topicConfig), 10);

        return (
            <motion.div {...animProps} key={'b'} style={{ margin: '0 1rem' }}>
                {/* QuickInfo */}
                <Card>
                    <TopicQuickInfoStatistic config={topicConfig} size={topic.logDirSize} messageCount={messageSum} />
                </Card>

                {/* Tabs:  Messages, Configuration */}
                <Card>
                    <Tabs style={{ overflow: 'visible' }} animated={false}
                        activeKey={this.tabPageKey}
                        onChange={this.setTabPage}
                    >
                        <Tabs.TabPane key="partitions" tab="Partitions">
                            <TopicPartitions topic={topic} />
                        </Tabs.TabPane>

                        <Tabs.TabPane key="messages" tab="Messages">
                            <TopicMessageView topic={topic} />
                        </Tabs.TabPane>

                        <Tabs.TabPane key="configuration" tab="Configuration">
                            <ConfigDisplaySettings /> {/* todo: move into TopicConfiguration */}
                            <TopicConfiguration config={topicConfig} />
                        </Tabs.TabPane>

                        <Tabs.TabPane key="consumers" tab="Consumers">
                            <TopicConsumers topic={topic} />
                        </Tabs.TabPane>
                    </Tabs>
                </Card>
            </motion.div>
        );
    }

    // depending on the cleanupPolicy we want to show specific config settings at the top
    addBaseFavs(topicConfig: TopicConfigEntry[]): void {
        const cleanupPolicy = topicConfig.find(e => e.name === 'cleanup.policy')?.value;
        const favs = uiState.topicSettings.favConfigEntries;

        switch (cleanupPolicy) {
            case "delete":
                favs.pushDistinct(
                    'retention.ms',
                    'retention.bytes',
                );
                break;
            case "compact":
                favs.pushDistinct(
                    'min.cleanable.dirty.ratio',
                    'delete.retention.ms',
                );
                break;
            case "compact,delete":
                favs.pushDistinct(
                    'retention.ms',
                    'retention.bytes',
                    'min.cleanable.dirty.ratio',
                    'delete.retention.ms',
                );
                break;
        }
    }

    setTabPage = (activeKey: string): void => {
        uiState.topicSettings.activeTabKey = activeKey;

        const loc = appGlobal.history.location;
        loc.hash = activeKey;
        appGlobal.history.replace(loc);
    }

    topicNotFound(name: string) {
        return <Result
            status={404}
            title="404"
            subTitle={<>The topic <Text code>{name}</Text> does not exist.</>}
            extra={<Button type="primary" onClick={() => appGlobal.history.goBack()}>Go Back</Button>}
        />
    }

    skeleton = <>
        <motion.div {...animProps} key={'loader'} style={{ margin: '2rem' }}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}



const ConfigDisplaySettings = observer(() =>
    <div style={{ marginLeft: '1px', marginBottom: '1.5em' }}>
        <Row>
            <Space size='large'>

                <OptionGroup label='Formatting'
                    options={{
                        "Friendly": 'friendly',
                        "Raw": 'raw'
                    }}
                    value={uiSettings.topicList.valueDisplay}
                    onChange={s => uiSettings.topicList.valueDisplay = s}
                />

                <OptionGroup label='Filter'
                    options={{
                        "Show All": 'all',
                        "Only Changed": 'onlyChanged'
                    }}
                    value={uiSettings.topicList.propsFilter}
                    onChange={s => uiSettings.topicList.propsFilter = s}
                />

                <OptionGroup label='Sort'
                    options={{
                        "Default": 'default',
                        "Changed First": 'changedFirst',
                    }}
                    value={uiSettings.topicList.propsOrder}
                    onChange={s => uiSettings.topicList.propsOrder = s}
                />
            </Space>
        </Row>
    </div>);



export default TopicDetails;
