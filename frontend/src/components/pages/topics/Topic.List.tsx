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

import React from 'react';
import { TrashIcon } from '@heroicons/react/outline';
import { Alert, Button, Modal, notification, Popover, Row, Statistic, Tooltip } from 'antd';
import { motion } from 'framer-motion';
import { autorun, IReactionDisposer, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { Topic, TopicAction, TopicActions, TopicConfigEntry } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { animProps } from '../../../utils/animationProps';
import { editQuery } from '../../../utils/queryHelper';
import { Code, DefaultSkeleton, findPopupContainer, QuickTable } from '../../../utils/tsxUtils';
import Card from '../../misc/Card';
import { makePaginationConfig, renderLogDirSummary, sortField } from '../../misc/common';
import { KowlTable } from '../../misc/KowlTable';
import { PageComponent, PageInitHelper } from '../Page';
import { useState } from 'react';
import { CheckIcon, CircleSlashIcon, EyeClosedIcon } from '@primer/octicons-react';
import createAutoModal from '../../../utils/createAutoModal';
import { CreateTopicModalContent, CreateTopicModalState, RetentionSizeUnit, RetentionTimeUnit } from './CreateTopicModal/CreateTopicModal';
import { UInt64Max } from '../../../utils/utils';

@observer
class TopicList extends PageComponent {
    pageConfig = makePaginationConfig(uiSettings.topicList.pageSize);
    quickSearchReaction: IReactionDisposer;
    @observable topicToDelete: null | string = null;

    CreateTopicModal;
    showCreateTopicModal;

    constructor(p: any) {
        super(p);
        makeObservable(this);

        const m = makeCreateTopicModal(this);
        this.CreateTopicModal = m.Component;
        this.showCreateTopicModal = m.show;
    }

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
                if (q) query['q'] = q;
            });
        });
    }
    componentWillUnmount() {
        if (this.quickSearchReaction) this.quickSearchReaction();
    }

    refreshData(force: boolean) {
        api.refreshTopics(force);
    }

    isFilterMatch(filter: string, item: Topic): boolean {
        if (item.topicName.toLowerCase().includes(filter.toLowerCase())) return true;
        return false;
    }

    render() {
        if (!api.topics) return DefaultSkeleton;

        const topics = api.topics;

        const partitionCountReal = topics.sum((x) => x.partitionCount);
        const partitionCountOnlyReplicated = topics.sum((x) => x.partitionCount * (x.replicationFactor - 1));

        const partitionDetails = QuickTable(
            [
                { key: 'Primary:', value: partitionCountReal },
                { key: 'Replicated:', value: partitionCountOnlyReplicated },
                { key: 'All:', value: partitionCountReal + partitionCountOnlyReplicated },
            ],
            {
                keyAlign: 'right', keyStyle: { fontWeight: 500 },
                gapWidth: 4,
                valueAlign: 'right'
            }
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
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                            onClick={() => this.showCreateTopicModal()}
                            style={{ minWidth: '160px', marginBottom: '12px' }}
                        >
                            Create Topic
                        </Button>
                        <this.CreateTopicModal />
                    </div>
                    <KowlTable
                        dataSource={topics}
                        rowKey={(x) => x.topicName}
                        columns={[
                            { title: 'Name', dataIndex: 'topicName', render: (t, r) => renderName(r), sorter: sortField('topicName'), className: 'whiteSpaceDefault', defaultSortOrder: 'ascend' },
                            { title: 'Partitions', dataIndex: 'partitions', render: (t, r) => r.partitionCount, sorter: (a, b) => a.partitionCount - b.partitionCount, width: 1 },
                            { title: 'Replicas', dataIndex: 'replicationFactor', sorter: sortField('replicationFactor'), width: 1 },
                            {
                                title: 'CleanupPolicy', dataIndex: 'cleanupPolicy', width: 1,
                                filterType: {
                                    type: 'enum',
                                    optionClassName: 'capitalize'
                                },
                                sorter: sortField('cleanupPolicy'),
                            },
                            {
                                title: 'Size', render: (t, r) => renderLogDirSummary(r.logDirSummary), sorter: (a, b) => a.logDirSummary.totalSizeBytes - b.logDirSummary.totalSizeBytes, width: '140px',
                            },
                            {
                                width: 1,
                                title: ' ',
                                key: 'action',
                                className: 'msgTableActionColumn',
                                render: (text, record) => (
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <DeleteDisabledTooltip topic={record}>
                                            <Button
                                                type="text"
                                                className="iconButton"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    this.topicToDelete = record.topicName;
                                                }}
                                            >
                                                <TrashIcon />
                                            </Button>
                                        </DeleteDisabledTooltip>
                                    </div>
                                ),
                            },
                        ]}

                        search={{
                            searchColumnIndex: 0,
                            isRowMatch: (row, regex) => {
                                if (regex.test(row.topicName)) return true;
                                if (regex.test(row.cleanupPolicy)) return true;
                                return false;
                            },

                        }}

                        observableSettings={uiSettings.topicList}
                        onRow={(record) => ({
                            onClick: () => appGlobal.history.push('/topics/' + record.topicName),
                        })}
                        rowClassName="hoverLink"
                    />
                </Card>
                <ConfirmDeletionModal
                    topicToDelete={this.topicToDelete}
                    onCancel={() => (this.topicToDelete = null)}
                    onFinish={() => {
                        this.topicToDelete = null;
                        this.refreshData(true);
                    }}
                />
            </motion.div>
        );
    }
}
export default TopicList;

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

const renderName = (topic: Topic) => {
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

function ConfirmDeletionModal({ topicToDelete, onFinish, onCancel }: { topicToDelete: string | null; onFinish: () => void; onCancel: () => void }) {
    const [deletionPending, setDeletionPending] = useState(false);
    const [error, setError] = useState<string | Error | null>(null);

    const cleanup = () => {
        setDeletionPending(false);
        setError(null);
    };

    const finish = () => {
        onFinish();
        cleanup();
        notification['success']({
            message: <>Topic <Code>{topicToDelete}</Code> deleted successfully</>,
        });
    };

    const cancel = () => {
        onCancel();
        cleanup();
    };

    return (
        <Modal
            className="topicDeleteModal"
            visible={topicToDelete != null}
            centered
            closable={false}
            maskClosable={!deletionPending}
            keyboard={!deletionPending}
            okText={error ? 'Retry' : 'Yes'}
            confirmLoading={deletionPending}
            okType="danger"
            cancelText="No"
            cancelButtonProps={{ disabled: deletionPending }}
            onCancel={cancel}
            onOk={() => {
                setDeletionPending(true);
                api.deleteTopic(topicToDelete!) // modal is not shown when topic is null
                    .then(finish)
                    .catch(setError)
                    .finally(() => { setDeletionPending(false) });
            }}
        >
            <>
                {error && <Alert type="error" message={`An error occurred: ${typeof error === 'string' ? error : error.message}`} />}
                <p>
                    Are you sure you want to delete topic <Code>{topicToDelete}</Code>?<br />
                    This action cannot be undone.
                </p>
            </>
        </Modal>
    );
}

function DeleteDisabledTooltip(props: { topic: Topic; children: JSX.Element }): JSX.Element {
    const { topic } = props;
    const deleteButton = props.children;

    const wrap = (button: JSX.Element, message: string) => (
        <Tooltip placement="top" trigger="hover" mouseLeaveDelay={0} getPopupContainer={findPopupContainer} overlay={message}>
            {React.cloneElement(button, {
                disabled: true,
                className: (button.props.className ?? '') + ' disabled',
                onClick: undefined,
            })}
        </Tooltip>
    );

    return <>{hasDeletePrivilege(topic.allowedActions) ? deleteButton : wrap(deleteButton, "You don't have 'deleteTopic' permission for this topic.")}</>;
}

function hasDeletePrivilege(allowedActions?: Array<TopicAction>) {
    return Boolean(allowedActions?.includes('all') || allowedActions?.includes('deleteTopic'));
}


function makeCreateTopicModal(parent: TopicList) {
    api.refreshCluster(); // get brokers (includes configs) to display default values
    const tryGetBrokerConfig = (configName: string): string | undefined => {
        return api.clusterInfo?.brokers?.find(_ => true)
            ?.config.configs
            .find(x => x.name === configName)?.value ?? undefined;
    };

    const getRetentionTimeFinalValue = (value: number | undefined, unit: RetentionTimeUnit) => {
        if (unit == 'default')
            return undefined;

        if (value == undefined)
            throw new Error(`unexpected: value for retention time is 'undefined' but unit is set to ${unit}`);

        if (unit == 'ms')
            return value;
        if (unit == 'seconds')
            return value * 1000;
        if (unit == 'minutes')
            return value * 1000 * 60;
        if (unit == 'hours')
            return value * 1000 * 60 * 60;
        if (unit == 'days')
            return value * 1000 * 60 * 60 * 24;
        if (unit == 'months')
            return value * 1000 * 60 * 60 * 24 * (365 / 12);
        if (unit == 'years')
            return value * 1000 * 60 * 60 * 24 * 365;

        if (unit == 'infinite')
            return UInt64Max;
    };
    const getRetentionSizeFinalValue = (value: number | undefined, unit: RetentionSizeUnit) => {
        if (unit == 'default')
            return undefined;

        if (value == undefined)
            throw new Error(`unexpected: value for retention size is 'undefined' but unit is set to ${unit}`);

        if (unit == 'bytes')
            return value;
        if (unit == 'kB')
            return value * 1024;
        if (unit == 'MB')
            return value * 1024 * 1024;
        if (unit == 'GB')
            return value * 1024 * 1024 * 1024;
        if (unit == 'TB')
            return value * 1024 * 1024 * 1024 * 1024;

        if (unit == 'infinite')
            return UInt64Max;
    };

    return createAutoModal<void, CreateTopicModalState>({
        modalProps: {
            title: 'Create Topic',
            width: '80%',
            style: { minWidth: '600px', maxWidth: '1000px', top: '50px' },
            bodyStyle: { paddingTop: '1em' },

            okText: 'Create',
            successTitle: 'Topic created!',

            closable: false,
            keyboard: false,
            maskClosable: false,
        },
        onCreate: () => observable({
            topicName: '',

            // todo: get 'log.retention.bytes' and 'log.retention.ms' from any broker and show it for "default"

            retentionTimeMs: 1,
            retentionTimeUnit: 'default',

            retentionSize: 1,
            retentionSizeUnit: 'default',

            partitions: undefined,
            cleanupPolicy: 'delete',
            minInSyncReplicas: undefined,
            replicationFactor: undefined,

            additionalConfig: [],

            defaults: {
                get retentionTime() { return tryGetBrokerConfig('log.retention.ms'); },
                get retentionBytes() { return tryGetBrokerConfig('log.retention.bytes'); },
                get replicationFactor() { return tryGetBrokerConfig('default.replication.factor'); },
                get partitions() { return tryGetBrokerConfig('num.partitions'); },
                get cleanupPolicy() { return tryGetBrokerConfig('log.cleanup.policy'); },
                get minInSyncReplicas() {
                    return "1"; // todo, what is the name of the default value? is it the same for apache and redpanda?
                },
            }
        }),
        isOkEnabled: state => /^\S+$/.test(state.topicName),
        onOk: async state => {

            if (!state.topicName) throw new Error('"Topic Name" must be set');
            if (!state.cleanupPolicy) throw new Error('"Cleanup Policy" must be set');

            const config: TopicConfigEntry[] = [];
            const setVal = (name: string, value: string | number | undefined) => {
                if (value === undefined) return;
                config.removeAll(x => x.name === name);
                config.push({ name, value: String(value) });
            };

            for (const x of state.additionalConfig)
                setVal(x.name, x.value);

            if (state.retentionTimeUnit != 'default')
                setVal('retention.ms', getRetentionTimeFinalValue(state.retentionTimeMs, state.retentionTimeUnit));
            if (state.retentionTimeUnit != 'default')
                setVal('retention.bytes', getRetentionSizeFinalValue(state.retentionSize, state.retentionSizeUnit));
            if (state.minInSyncReplicas != undefined)
                setVal('min.insync.replicas', state.minInSyncReplicas);

            setVal('cleanup.policy', state.cleanupPolicy);

            const result = await api.createTopic({
                topicName: state.topicName,
                partitionCount: state.partitions ?? Number(state.defaults.partitions ?? '-1'),
                replicationFactor: state.replicationFactor ?? Number(state.defaults.replicationFactor ?? '-1'),
                configs: config.filter(x => x.name.length > 0),
            });

            return <div style={{
                display: 'grid',
                gridTemplateColumns: 'auto auto',
                justifyContent: 'center',
                justifyItems: 'end',
                columnGap: '8px',
                rowGap: '4px'
            }}>
                <span>Name:</span><span style={{ justifySelf: 'start' }}>{result.topicName}</span>
                <span>Partitions:</span><span style={{ justifySelf: 'start' }}>{String(result.partitionCount).replace('-1', '(Default)')}</span>
                <span>Replication Factor:</span><span style={{ justifySelf: 'start' }}>{String(result.replicationFactor).replace('-1', '(Default)')}</span>
            </div>
        },
        onSuccess: (state, result) => {
            parent.refreshData(true);
        },
        content: (state) => <CreateTopicModalContent state={state} />,
    });

}