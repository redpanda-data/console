import React, { Component, CSSProperties, useState } from "react";
import { Row, Tabs, Skeleton, Radio, Checkbox, Button, Select, Input, Typography, Result, Space, Popover, Tooltip } from "antd";
import { observer } from "mobx-react";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { PageComponent, PageInitHelper } from "../Page";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { TopicQuickInfoStatistic } from "./QuickInfo";
import { TopicConfiguration } from "./Tab.Config";
import { TopicMessageView } from "./Tab.Messages";
import { appGlobal } from "../../../state/appGlobal";
import { TopicPartitions } from "./Tab.Partitions";
import { TopicConfigEntry, TopicDetail, TopicAction } from "../../../state/restInterfaces";
import Card from "../../misc/Card";
import { TopicConsumers } from "./Tab.Consumers";
import { simpleUniqueId } from "../../../utils/utils";
import { Label, ObjToKv, OptionGroup, DefaultSkeleton } from "../../../utils/tsxUtils";
import { LockIcon, EyeClosedIcon } from "@primer/octicons-v2-react";
import { computed, observable } from "mobx";
import { HideStatisticsBarButton } from "../../misc/HideStatisticsBarButton";
import { TopicDocumentation } from "./Tab.Docu";

const { Text } = Typography;

const TopicTabIds = ['messages', 'consumers', 'partitions', 'configuration', 'documentation'] as const;
export type TopicTabId = typeof TopicTabIds[number];

// A tab (specifying title+content) that disable/lock itself if the user doesn't have some required permissions.
class TopicTab {
    constructor(
        public readonly topicGetter: () => TopicDetail | undefined | null,
        public id: TopicTabId,
        private requiredPermission: TopicAction,
        public titleText: string,
        private contentFunc: (topic: TopicDetail) => React.ReactNode,
        private disableHooks?: ((topic: TopicDetail) => React.ReactNode | undefined)[]
    ) { }

    @computed get isEnabled(): boolean {
        const topic = this.topicGetter();

        if (topic && this.disableHooks)
            for (const h of this.disableHooks)
                if (h(topic)) return false;

        if (!topic)
            return true; // no data yet
        if (!topic.allowedActions || topic.allowedActions[0] == 'all')
            return true; // kowl free version

        return topic.allowedActions.includes(this.requiredPermission);
    }

    @computed get isDisabled(): boolean {
        return !this.isEnabled;
    }

    @computed get title(): React.ReactNode {
        if (this.isEnabled) return this.titleText;

        const topic = this.topicGetter();
        if (topic && this.disableHooks)
            for (const h of this.disableHooks) {
                const replacementTitle = h(topic);
                if (replacementTitle) return replacementTitle;
            }

        return 1 &&
            <Popover content={`You're missing the required permission '${this.requiredPermission}' to view this tab`}>
                <div><LockIcon size={16} />{' '}{this.titleText}</div>
            </Popover>
    }

    @computed get content(): React.ReactNode {
        const topic = this.topicGetter();
        if (topic) return this.contentFunc(topic);
        return null;
    }
}


@observer
class TopicDetails extends PageComponent<{ topicName: string }> {

    topicTabs: TopicTab[];

    constructor(props: any) {
        super(props);

        const topic = () => this.topic;

        this.topicTabs = [
            new TopicTab(topic, 'messages', 'viewMessages', 'Messages', t => <TopicMessageView topic={t} />),
            new TopicTab(topic, 'consumers', 'viewConsumers', 'Consumers', t => <TopicConsumers topic={t} />),
            new TopicTab(topic, 'partitions', 'viewPartitions', 'Partitions', t => <TopicPartitions topic={t} />),
            new TopicTab(topic, 'configuration', 'viewConfig', 'Configuration', t => <TopicConfiguration topic={t} />),
            new TopicTab(topic, 'documentation', 'seeTopic', 'Documentation', t => <TopicDocumentation topic={t} />),
        ];
    }

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

        if (uiSettings.topicDetailsActiveTabKey == 'consumers') // don't refresh unless needed, it's expensive
            api.refreshTopicConsumers(this.props.topicName, force);

        api.refreshTopicPartitions(this.props.topicName, force);

        api.refreshTopicConfig(this.props.topicName, force);

        api.refreshTopicPermissions(this.props.topicName, force);

        api.refreshTopicDocumentation(this.props.topicName, force);
    }


    @computed get topic(): undefined | TopicDetail | null { // undefined = not yet known, null = known to be null
        if (!api.topics) return undefined;
        const topic = api.topics.find(e => e.topicName == this.props.topicName);
        if (!topic) return null;
        return topic;
    }
    @computed get topicConfig(): undefined | TopicConfigEntry[] | null {
        return api.topicConfig.get(this.props.topicName);
    }

    get selectedTabId(): TopicTabId {
        function computeTabId() {
            // use url anchor if possible
            let key = (appGlobal.history.location.hash).replace("#", "");
            if (TopicTabIds.includes(key as any)) return key as TopicTabId;

            // use settings (last visited tab)
            key = uiSettings.topicDetailsActiveTabKey!;
            if (TopicTabIds.includes(key as any)) return key as TopicTabId;

            // default to partitions
            return 'messages'
        }

        // 1. calculate what tab is selected as usual: url -> settings -> default
        // 2. if that tab is enabled, return it, otherwise return the first one that is not
        //    (todo: should probably show some message if all tabs are disabled...)
        const id = computeTabId();
        if (this.topicTabs.first(t => t.id == id)!.isEnabled)
            return id;
        return this.topicTabs.first(t => t.isEnabled)?.id ?? 'messages';
    }


    componentDidMount() {
        // fix anchor
        const anchor = '#' + this.selectedTabId;
        const location = appGlobal.history.location;
        if (location.hash !== anchor) {
            location.hash = anchor;
            appGlobal.history.replace(location);
        }
    }

    render() {
        const topic = this.topic;
        const topicConfig = this.topicConfig;
        if (topic === undefined || topicConfig === undefined) return DefaultSkeleton;
        if (topic === null) return this.topicNotFound();

        setTimeout(() => topicConfig && this.addBaseFavs(topicConfig), 10);

        return (
            <motion.div {...animProps} key={'b'} style={{ margin: '0 1rem' }}>
                {uiSettings.topicDetailsShowStatisticsBar &&
                    <Card className='statisticsBar'>
                        <HideStatisticsBarButton onClick={() => uiSettings.topicDetailsShowStatisticsBar = false} />
                        <TopicQuickInfoStatistic topicName={topic.topicName} />
                    </Card>
                }

                {/* Tabs:  Messages, Configuration */}
                <Card>
                    <Tabs style={{ overflow: 'visible' }} animated={false}
                        activeKey={this.selectedTabId}
                        onChange={this.setTabPage}
                    >
                        {this.topicTabs.map(tab =>
                            <Tabs.TabPane key={tab.id} tab={tab.title} disabled={tab.isDisabled}>
                                {tab.content}
                            </Tabs.TabPane>
                        )}
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
        uiSettings.topicDetailsActiveTabKey = activeKey as any;

        const loc = appGlobal.history.location;
        loc.hash = String(activeKey);
        appGlobal.history.replace(loc);
    }

    topicNotFound() {
        const name = this.props.topicName;
        return <Result
            status={404}
            title="404"
            subTitle={<>The topic <Text code>{name}</Text> does not exist.</>}
            extra={<Button type="primary" onClick={() => appGlobal.history.goBack()}>Go Back</Button>}
        />
    }
}




export default TopicDetails;
