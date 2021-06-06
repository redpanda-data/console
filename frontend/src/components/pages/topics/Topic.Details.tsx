import React from 'react';

import { LockIcon } from '@primer/octicons-v2-react';
import { Button, Popover, Result, Typography } from 'antd';
import { motion } from 'framer-motion';
import { computed, makeObservable } from 'mobx';
import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { ConfigEntry, Topic, TopicAction } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/uiState';
import { animProps } from '../../../utils/animationProps';
import '../../../utils/arrayExtensions';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import Card from '../../misc/Card';
import { makePaginationConfig } from '../../misc/common';
import { HideStatisticsBarButton } from '../../misc/HideStatisticsBarButton';
import Tabs from '../../misc/tabs/Tabs';
import { PageComponent, PageInitHelper } from '../Page';
import { TopicQuickInfoStatistic } from './QuickInfo';
import AclList from './Tab.Acl/AclList';
import { TopicConfiguration } from './Tab.Config';
import { TopicConsumers } from './Tab.Consumers';
import { TopicDocumentation } from './Tab.Docu';
import { TopicMessageView } from './Tab.Messages';
import { TopicPartitions } from './Tab.Partitions';

const { Text } = Typography;

const TopicTabIds = ['messages', 'consumers', 'partitions', 'configuration', 'documentation', 'topicacl'] as const;
export type TopicTabId = typeof TopicTabIds[number];

// A tab (specifying title+content) that disable/lock itself if the user doesn't have some required permissions.
class TopicTab {
    constructor(
        public readonly topicGetter: () => Topic | undefined | null,
        public id: TopicTabId,
        private requiredPermission: TopicAction,
        public titleText: string,
        private contentFunc: (topic: Topic) => React.ReactNode,
        private disableHooks?: ((topic: Topic) => React.ReactNode | undefined)[]
    ) {}

    @computed get isEnabled(): boolean {
        const topic = this.topicGetter();

        if (topic && this.disableHooks) {
            for (const h of this.disableHooks) {
                if (h(topic)) return false;
            }
        }

        if (!topic) return true; // no data yet
        if (!topic.allowedActions || topic.allowedActions[0] == 'all') return true; // kowl free version

        return topic.allowedActions.includes(this.requiredPermission);
    }

    @computed get isDisabled(): boolean {
        return !this.isEnabled;
    }

    @computed get title(): React.ReactNode {
        if (this.isEnabled) return this.titleText;

        const topic = this.topicGetter();
        if (topic && this.disableHooks) {
            for (const h of this.disableHooks) {
                const replacementTitle = h(topic);
                if (replacementTitle) return replacementTitle;
            }
        }
        
        return (
            1 && (
                <Popover content={`You're missing the required permission '${this.requiredPermission}' to view this tab`}>
                    <div>
                        <LockIcon size={16} /> {this.titleText}
                    </div>
                </Popover>
            )
        );
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
            new TopicTab(topic, 'messages', 'viewMessages', 'Messages', (t) => <TopicMessageView topic={t} />),
            new TopicTab(topic, 'consumers', 'viewConsumers', 'Consumers', (t) => <TopicConsumers topic={t} />),
            new TopicTab(topic, 'partitions', 'viewPartitions', 'Partitions', (t) => <TopicPartitions topic={t} />),
            new TopicTab(topic, 'configuration', 'viewConfig', 'Configuration', (t) => <TopicConfiguration topic={t} />),
            new TopicTab(topic, 'topicacl', 'all', 'ACL', (t) => {
                const paginationConfig = makePaginationConfig();
                return (
                    <AclList
                        acl={api.topicAcls.get(t.topicName)}
                        onChange={(pagination) => {
                            if (pagination.pageSize) uiState.topicSettings.aclPageSize = pagination.pageSize;
                            paginationConfig.current = pagination.current;
                            paginationConfig.pageSize = pagination.pageSize;
                        }}
                    />
                );
            }),
            new TopicTab(topic, 'documentation', 'seeTopic', 'Documentation', (t) => <TopicDocumentation topic={t} />),
        ];
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        const topicName = this.props.topicName;
        uiState.currentTopicName = topicName;

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);

        p.title = topicName;
        p.addBreadcrumb('Topics', '/topics');
        p.addBreadcrumb(topicName, '/topics/' + topicName);

        // clear messages from different topic if we have some
        if (api.messagesFor != '' && api.messagesFor != topicName) {
            api.messages = [];
            api.messagesFor = '';
        }
    }

    refreshData(force: boolean) {
        // there is no single endpoint to refresh a single topic
        api.refreshTopics(force);

        api.refreshTopicPermissions(this.props.topicName, force);

        // consumers are lazy loaded because they're (relatively) expensive
        if (uiSettings.topicDetailsActiveTabKey == 'consumers') api.refreshTopicConsumers(this.props.topicName, force);

        // partitions are always required to display message count in the statistics bar
        api.refreshPartitionsForTopic(this.props.topicName, force);

        // configuration is always required for the statistics bar
        api.refreshTopicConfig(this.props.topicName, force);

        // documentation can be lazy loaded
        if (uiSettings.topicDetailsActiveTabKey == 'documentation') api.refreshTopicDocumentation(this.props.topicName, force);

        // ACL can be lazy loaded
        if (uiSettings.topicDetailsActiveTabKey == 'topicacl') api.refreshTopicAcls(this.props.topicName, force);
    }

    @computed get topic(): undefined | Topic | null {
        // undefined = not yet known, null = known to be null
        if (!api.topics) return undefined;
        const topic = api.topics.find((e) => e.topicName == this.props.topicName);
        if (!topic) return null;
        return topic;
    }
    @computed get topicConfig(): undefined | ConfigEntry[] | null {
        const config = api.topicConfig.get(this.props.topicName);
        if (config === undefined) return undefined;
        if (config === null || config.error != null) return null;
        return config.configEntries;
    }

    get selectedTabId(): TopicTabId {
        function computeTabId() {
            // use url anchor if possible
            let key = appGlobal.history.location.hash.replace('#', '');
            if (TopicTabIds.includes(key as any)) return key as TopicTabId;

            // use settings (last visited tab)
            key = uiSettings.topicDetailsActiveTabKey!;
            if (TopicTabIds.includes(key as any)) return key as TopicTabId;

            // default to partitions
            return 'messages';
        }

        // 1. calculate what tab is selected as usual: url -> settings -> default
        // 2. if that tab is enabled, return it, otherwise return the first one that is not
        //    (todo: should probably show some message if all tabs are disabled...)
        const id = computeTabId();
        if (this.topicTabs.first((t) => t.id == id)!.isEnabled) return id;
        return this.topicTabs.first((t) => t.isEnabled)?.id ?? 'messages';
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

    componentWillUnmount() {
        // leaving the topic details view, stop any pending message searches
        api.stopMessageSearch();
    }

    render() {
        const topic = this.topic;
        if (topic === undefined) return DefaultSkeleton;
        if (topic == null) return this.topicNotFound();

        const topicConfig = this.topicConfig;

        setImmediate(() => topicConfig && this.addBaseFavs(topicConfig));

        return (
            <motion.div {...animProps} key={'b'} style={{ margin: '0 1rem' }}>
                {uiSettings.topicDetailsShowStatisticsBar && (
                    <Card className="statisticsBar">
                        <HideStatisticsBarButton onClick={() => (uiSettings.topicDetailsShowStatisticsBar = false)} />
                        <TopicQuickInfoStatistic topic={topic} />
                    </Card>
                )}

                {/* Tabs:  Messages, Configuration */}
                <Card>
                    <Tabs
                        tabs={this.topicTabs.map(({ id, title, content, isDisabled }) => ({
                            key: id,
                            disabled: isDisabled,
                            title,
                            content,
                        }))}
                        onChange={this.setTabPage}
                        selectedTabKey={this.selectedTabId}
                    />
                </Card>
            </motion.div>
        );
    }

    // depending on the cleanupPolicy we want to show specific config settings at the top
    addBaseFavs(topicConfig: ConfigEntry[]): void {
        const cleanupPolicy = topicConfig.find((e) => e.name === 'cleanup.policy')?.value;
        const favs = uiState.topicSettings.favConfigEntries;

        switch (cleanupPolicy) {
            case 'delete':
                favs.pushDistinct('retention.ms', 'retention.bytes');
                break;
            case 'compact':
                favs.pushDistinct('min.cleanable.dirty.ratio', 'delete.retention.ms');
                break;
            case 'compact,delete':
                favs.pushDistinct('retention.ms', 'retention.bytes', 'min.cleanable.dirty.ratio', 'delete.retention.ms');
                break;
        }
    }

    setTabPage = (activeKey: string): void => {
        uiSettings.topicDetailsActiveTabKey = activeKey as any;

        const loc = appGlobal.history.location;
        loc.hash = String(activeKey);
        appGlobal.history.replace(loc);

        this.refreshData(false);
    };

    topicNotFound() {
        const name = this.props.topicName;
        return (
            <Result
                status={404}
                title="404"
                subTitle={
                    <>
                        The topic <Text code>{name}</Text> does not exist.
                    </>
                }
                extra={
                    <Button type="primary" onClick={() => appGlobal.history.goBack()}>
                        Go Back
                    </Button>
                }
            />
        );
    }
}

export default TopicDetails;
