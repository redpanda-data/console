import React, { Component } from 'react';
import { Button, Popover, Result, Tooltip, Typography } from 'antd';
import { motion } from 'framer-motion';
import { computed, IReactionDisposer, makeObservable, observable } from 'mobx';
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
import DeleteRecordsModal from './DeleteRecordsModal/DeleteRecordsModal';
import { IsBusiness } from '../../../utils/env';
import { WarningOutlined } from '@ant-design/icons';
import { LockIcon } from '@primer/octicons-react';
import { ResponsiveLine } from '@nivo/line'
import { prettyBytes } from '../../../utils/utils';

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
    ) { }

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
    @observable deleteRecordsModalVisible = false
    topicTabs: TopicTab[];

    constructor(props: any) {
        super(props);

        const topic = () => this.topic;

        const mkDocuTip = (text: string, icon?: JSX.Element) => <Tooltip overlay={text} placement='left'><span>{icon ?? null}Documentation</span></Tooltip>
        const warnIcon = <span style={{ fontSize: '15px', marginRight: '5px', transform: 'translateY(1px)', display: 'inline-block' }}><WarningOutlined color='hsl(22deg 29% 85%)' /></span>;

        this.topicTabs = [
            new TopicTab(topic, 'messages', 'viewMessages', 'Messages', (t) => <TopicMessageView topic={t} refreshTopicData={(force: boolean) => this.refreshData(force)} />),
            new TopicTab(topic, 'consumers', 'viewConsumers', 'Consumers', (t) => <TopicConsumers topic={t} />),
            new TopicTab(topic, 'partitions', 'viewPartitions', 'Partitions', (t) => <TopicPartitions topic={t} />),
            new TopicTab(topic, 'configuration', 'viewConfig', 'Configuration', (t) => <TopicConfiguration topic={t} />),
            new TopicTab(topic, 'topicacl', 'seeTopic', 'ACL', (t) => {
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
            }, [(t) => {
                if (IsBusiness)
                    if (api.userData != null && !api.userData.canListAcls)
                        return <Popover content={`You need the cluster-permission 'viewAcl' to view this tab`}>
                            <div> <LockIcon size={16} /> ACL</div>
                        </Popover>
                return undefined;
            }]),
            new TopicTab(topic, 'documentation', 'seeTopic', 'Documentation', (t) => <TopicDocumentation topic={t} />, [
                t => t.documentation == 'NOT_CONFIGURED' ? mkDocuTip('Topic documentation is not configured in Kowl') : null,
                t => t.documentation == 'NOT_EXISTENT' ? mkDocuTip('Documentation for this topic was not found in the configured repository', warnIcon) : null,
            ]),
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
            <>
                <motion.div {...animProps} key={'b'} style={{ margin: '0 1rem' }}>
                    {uiSettings.topicDetailsShowStatisticsBar && (
                        <Card className="statisticsBar">
                            <HideStatisticsBarButton onClick={() => (uiSettings.topicDetailsShowStatisticsBar = false)} />
                            <TopicQuickInfoStatistic topic={topic} />
                        </Card>
                    )}

                    {/* Metrics */}
                    <Card>
                        <TopicMetrics topicName={topic.topicName} />
                    </Card>

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
            </>
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



@observer
class TopicMetrics extends Component<{ topicName: string }> {

    isRequesting = false;
    timer: number;

    constructor(props: any) {
        super(props);
        // makeObservable(this);

        this.timer = setInterval(() => {
            try {
                if (this.isRequesting) return;
                this.isRequesting = true;

                api.refreshMetricsForTopic(this.props.topicName, true);
            }
            catch (err: any) {
                // nothing we can, or should do at the moment
            }
            finally {
                this.isRequesting = false;
            }
        }, 3000) as unknown as number;
    }

    componentWillUnmount() {
        clearInterval(this.timer);
    }

    render() {
        const metrics = api.topicMetrics.get(this.props.topicName) ?? [];

        const series = [
            {
                id: 'size',
                color: "hsl(205, 70%, 50%)",
                data: metrics.map(p => ({
                    x: p.Timestamp,
                    y: p.Value,
                })),
            },
        ];

        return <div style={{ height: '230px' }}>
            <ResponsiveLine
                data={series}

                margin={{ left: 68, top: 10, right: 20, bottom: 30 }}
                curve="monotoneX"

                xScale={{ type: 'linear', stacked: false, min: 'auto', max: 'auto' }}
                xFormat={x => new Date(Number(x) * 1000).toLocaleTimeString()}
                axisBottom={{
                    format: x => new Date(x * 1000).toLocaleTimeString(),
                    // tickValues: 8,
                    legendPosition: 'middle'
                }}

                yScale={{ type: 'linear', stacked: false, min: 0, max: 'auto' }}
                yFormat={y => prettyBytes(Number(y))}
                axisLeft={{
                    format: y => prettyBytes(Number(y)),
                    legend: 'Size',
                    tickValues: 5,
                    legendOffset: -60,
                    legendPosition: 'middle'
                }}


                enableArea={true}
                lineWidth={2}
                pointSize={5}
                pointColor={{ theme: 'background' }}
                pointBorderWidth={1}

                pointBorderColor={{ from: 'serieColor' }}
                pointLabelYOffset={-12}
                useMesh={true}

                motionConfig={{
                    mass: 1,
                    tension: 500,
                    friction: 40,
                }}
                // enableGridX={false}
                colors={{
                    datum: 'color',
                }}


            // gridXValues={[0, 20, 40, 60, 80, 100, 120]}
            // gridYValues={[0, 500, 1000, 1500, 2000, 2500]}

            // legends={[
            //     {
            //         anchor: 'bottom-right',
            //         direction: 'column',
            //         justify: false,
            //         translateX: 140,
            //         translateY: 0,
            //         itemsSpacing: 2,
            //         itemDirection: 'left-to-right',
            //         itemWidth: 80,
            //         itemHeight: 12,
            //         itemOpacity: 0.75,
            //         symbolSize: 12,
            //         symbolShape: 'circle',
            //         symbolBorderColor: 'rgba(0, 0, 0, .5)',
            //         effects: [
            //             {
            //                 on: 'hover',
            //                 style: {
            //                     itemBackground: 'rgba(0, 0, 0, .03)',
            //                     itemOpacity: 1
            //                 }
            //             }
            //         ]
            //     }
            // ]}
            />
        </div>
    }
}

export default TopicDetails;
