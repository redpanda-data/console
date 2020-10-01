import React, { Component, RefObject } from 'react';
import { Table, Empty, Skeleton, Checkbox, Row, Statistic, Input, Typography, AutoComplete, Button, Popover, Switch, Divider, Descriptions, Col } from 'antd';
import { observer } from 'mobx-react';
import { api } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { PageComponent, PageInitHelper } from '../Page';
import { makePaginationConfig, sortField } from '../../misc/common';
import { motion, AnimatePresence } from 'framer-motion';
import { animProps, MotionDiv, MotionSpan, animProps_span_searchResult } from '../../../utils/animationProps';
import { appGlobal } from '../../../state/appGlobal';
import { FilterableDataSource } from '../../../utils/filterableDataSource';
import { TopicDetail, TopicAction, TopicActions } from '../../../state/restInterfaces';
import { observable, autorun, IReactionDisposer } from 'mobx';
import prettyBytes from 'pretty-bytes';
import { prettyBytesOrNA, DebugTimerStore } from '../../../utils/utils';
import { uiState } from '../../../state/uiState';
import Card from '../../misc/Card';
import { editQuery } from '../../../utils/queryHelper';
import Icon from '@ant-design/icons';
import { QuickTable, DefaultSkeleton } from '../../../utils/tsxUtils';
import { EyeClosedIcon, CheckIcon, CircleSlashIcon } from '@primer/octicons-v2-react';
import SearchBar from '../../misc/SearchBar';
const { Text } = Typography;
const statisticStyle: React.CSSProperties = { margin: 0, marginRight: '2em', padding: '.2em' };

@observer
class TopicList extends PageComponent {
    pageConfig = makePaginationConfig(uiSettings.topicList.pageSize);
    @observable searchBar: RefObject<SearchBar<TopicDetail>> = React.createRef();
    quickSearchReaction: IReactionDisposer;

    initPage(p: PageInitHelper): void {
        p.title = 'Topics';
        p.addBreadcrumb('Topics', '/topics');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    componentDidMount() {
        // 1. use 'q' parameter for quick search (if it exists)
        editQuery((query) => {
            if (query['q']) uiSettings.topicList.quickSearch = String(query['q']);
        });

        // 2. whenever the quick search box changes, update the url
        this.quickSearchReaction = autorun(() => {
            editQuery((query) => {
                const q = String(uiSettings.topicList.quickSearch);
                query['q'] = q ? q : undefined;
            });
        });
    }
    componentWillUnmount() {
        if (this.quickSearchReaction) this.quickSearchReaction();
    }

    refreshData(force: boolean) {
        api.refreshTopics(force);
    }

    getTopics() {
        if (!api.Topics) return [];
        return api.Topics.filter((t) => (uiSettings.topicList.hideInternalTopics && t.isInternal ? false : true));
    }

    isFilterMatch(filter: string, item: TopicDetail): boolean {
        if (item.topicName.toLowerCase().includes(filter)) return true;
        return false;
    }

    render() {
        if (!api.Topics) return DefaultSkeleton;
        if (api.Topics.length == 0) return <Empty />;

        const topics = this.getTopics();

        const data = this.searchBar.current ? this.searchBar.current.data : ([] as TopicDetail[]);
        const partitionCountReal = topics.sum((x) => x.partitionCount);
        const partitionCountOnlyReplicated = topics.sum((x) => x.partitionCount * (x.replicationFactor - 1));

        const partitionDetails = QuickTable(
            [
                { key: 'Primary:', value: partitionCountReal },
                { key: 'Replicated:', value: partitionCountOnlyReplicated },
                { key: 'All:', value: partitionCountReal + partitionCountOnlyReplicated },
            ],
            { keyAlign: 'right', keyStyle: { fontWeight: 'bold' } }
        );

        return (
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <Card>
                    <Row>
                        <Statistic title="Total Topics" value={topics.length} />
                        <Popover title="Partition Details" content={partitionDetails} placement="right" mouseEnterDelay={0} trigger="hover">
                            <div className="hoverLink" style={{ display: 'flex', verticalAlign: 'middle', cursor: 'default' }}>
                                <Statistic title="Total Partitions" value={partitionCountReal + partitionCountOnlyReplicated} />
                            </div>
                        </Popover>
                    </Row>
                </Card>

                <Card>
                    <Row justify="space-between" align="middle">
                        <Col span="auto">
                            <SearchBar<TopicDetail> dataSource={this.getTopics} isFilterMatch={this.isFilterMatch} ref={this.searchBar} />
                        </Col>
                        <Col>
                            <Checkbox style={{ paddingLeft: '1rem', marginLeft: 'auto' }} checked={uiSettings.topicList.hideInternalTopics} onChange={(e) => (uiSettings.topicList.hideInternalTopics = e.target.checked)}>
                                Hide internal topics
                            </Checkbox>
                        </Col>
                    </Row>

                    <Table
                        style={{ margin: '0', padding: '0' }}
                        size="middle"
                        onRow={(record) => ({
                            onClick: () => appGlobal.history.push('/topics/' + record.topicName),
                        })}
                        pagination={this.pageConfig}
                        onChange={(pagination) => {
                            if (pagination.pageSize) uiSettings.topicList.pageSize = pagination.pageSize;
                            this.pageConfig.current = pagination.current;
                            this.pageConfig.pageSize = pagination.pageSize;
                        }}
                        rowClassName={() => 'hoverLink'}
                        dataSource={data}
                        rowKey={(x) => x.topicName}
                        showSorterTooltip={false}
                        columns={[
                            { title: 'Name', dataIndex: 'topicName', render: (t, r) => renderName(r), sorter: sortField('topicName'), className: 'whiteSpaceDefault', defaultSortOrder: 'ascend' },
                            { title: 'Partitions', dataIndex: 'partitions', render: (t, r) => r.partitionCount, sorter: (a, b) => a.partitionCount - b.partitionCount, width: 1 },
                            { title: 'Replication', dataIndex: 'replicationFactor', sorter: sortField('replicationFactor'), width: 1 },
                            { title: 'CleanupPolicy', dataIndex: 'cleanupPolicy', sorter: sortField('cleanupPolicy'), width: 1 },
                            { title: 'Size', dataIndex: 'logDirSize', render: (t: number) => prettyBytesOrNA(t), sorter: (a, b) => a.logDirSize - b.logDirSize, width: '140px' },
                        ]}
                    />
                </Card>
            </motion.div>
        );
    }
}

const iconAllowed = (
    <span style={{ color: 'green' }}>
        <CheckIcon size={16} />
    </span>
);
const iconForbidden = (
    <span style={{ color: '#ca000a' }}>
        <CircleSlashIcon size={15} />
    </span>
);
const iconClosedEye = (
    <span style={{ color: '#0008', paddingLeft: '4px', transform: 'translateY(-1px)', display: 'inline-block' }}>
        <EyeClosedIcon size={14} verticalAlign="middle" />
    </span>
);

const renderName = (topic: TopicDetail) => {
    const actions = topic.allowedActions;

    if (!actions || actions[0] == 'all') return topic.topicName; // happens in non-business version

    let missing = 0;
    for (const a of TopicActions) if (!actions.includes(a)) missing++;

    if (missing == 0) return topic.topicName; // everything is allowed

    // There's at least one action the user can't do
    // Show a table of what they can't do
    const popoverContent = (
        <div>
            <div style={{ marginBottom: '1em' }}>
                You're missing permissions to view
                <br />
                one more aspects of this topic.
            </div>
            {QuickTable(
                TopicActions.map((a) => ({
                    key: a,
                    value: actions.includes(a) ? iconAllowed : iconForbidden,
                })),
                {
                    gapWidth: '6px',
                    gapHeight: '2px',
                    keyAlign: 'right',
                    keyStyle: { fontSize: '86%', fontWeight: 700, textTransform: 'capitalize' },
                    tableStyle: { margin: 'auto' },
                }
            )}
        </div>
    );

    return (
        <Popover content={popoverContent} placement="right" mouseEnterDelay={0.1} mouseLeaveDelay={0.1}>
            <span>
                {topic.topicName}
                {iconClosedEye}
            </span>
        </Popover>
    );
};

export default TopicList;
