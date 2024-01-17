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

import React, { useRef, useState } from 'react';
import { autorun, IReactionDisposer, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { Topic, TopicAction, TopicActions, TopicConfigEntry } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { editQuery } from '../../../utils/queryHelper';
import { Code, DefaultSkeleton, QuickTable } from '../../../utils/tsxUtils';
import { renderLogDirSummary } from '../../misc/common';
import { PageComponent, PageInitHelper } from '../Page';
import { CheckIcon, CircleSlashIcon, EyeClosedIcon } from '@primer/octicons-react';
import createAutoModal from '../../../utils/createAutoModal';
import { CreateTopicModalContent, CreateTopicModalState, RetentionSizeUnit, RetentionTimeUnit } from './CreateTopicModal/CreateTopicModal';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { Alert, AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertIcon, Box, Button, Checkbox, DataTable, Flex, Icon, Popover, Text, Tooltip, useToast } from '@redpanda-data/ui';
import { HiOutlineTrash } from 'react-icons/hi';
import { Statistic } from '../../misc/Statistic';
import { Link } from 'react-router-dom';
import SearchBar from '../../misc/SearchBar';

@observer
class TopicList extends PageComponent {
    quickSearchReaction: IReactionDisposer;

    @observable topicToDelete: null | Topic = null;
    @observable filteredTopics: Topic[];

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

        this.refreshData(true);
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
        api.refreshClusterOverview(force);

    }

    isFilterMatch(filter: string, item: Topic): boolean {
        if (item.topicName.toLowerCase().includes(filter.toLowerCase())) return true;
        return false;
    }

    render() {
        if (!api.topics) return DefaultSkeleton;

        let topics = api.topics;
        if (uiSettings.topicList.hideInternalTopics) {
            topics = topics.filter(x => !x.isInternal && !x.topicName.startsWith('_'));
        }
        topics = topics.filter(x => x.topicName.toLowerCase().includes(uiSettings.topicList.quickSearch.toLowerCase()));


        const partitionCount = topics.sum((x) => x.partitionCount);
        const replicaCount = topics.sum((x) => x.partitionCount * x.replicationFactor);

        return (
            <PageContent>
                <Section>
                    <Flex>
                        <Statistic title="Total topics" value={topics.length} />
                        <Statistic title="Total partitions" value={partitionCount} />
                        <Statistic title="Total replicas" value={replicaCount} />
                    </Flex>
                </Section>

                <Box pt={6}>
                    <SearchBar<Topic>
                        dataSource={() => topics || []}
                        isFilterMatch={this.isFilterMatch}
                        filterText={uiSettings.topicList.quickSearch}
                        onQueryChanged={(filterText) => (uiSettings.topicList.quickSearch = filterText)}
                        onFilteredDataChanged={data => this.filteredTopics = data}
                    />
                </Box>
                <Section>
                    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
                        <Button
                            variant="solid"
                            colorScheme="brand"
                            onClick={() => this.showCreateTopicModal()}
                            style={{ minWidth: '160px', marginBottom: '12px' }}
                        >
                            Create topic
                        </Button>

                        <Checkbox
                            isChecked={!uiSettings.topicList.hideInternalTopics}
                            onChange={x => uiSettings.topicList.hideInternalTopics = !x.target.checked}
                            style={{ marginLeft: 'auto' }}>
                            Show internal topics
                        </Checkbox>

                        <this.CreateTopicModal />
                    </div>
                    <Box my={4}>
                        <DataTable<Topic>
                            data={topics}
                            showPagination
                            columns={[
                                {
                                    header: 'Name',
                                    accessorKey: 'topicName',
                                    cell: ({row: {original: topic}}) => <Link to={`/topics/${encodeURIComponent(topic.topicName)}`}>{renderName(topic)}</Link>,
                                    size: Infinity,
                                },
                                {
                                    header: 'Partitions',
                                    accessorKey: 'partitions',
                                    cell: ({row: {original: topic}}) => topic.partitionCount,
                                },
                                {
                                    header: 'Replicas',
                                    accessorKey: 'replicationFactor',
                                },
                                {
                                    header: 'CleanupPolicy',
                                    accessorKey: 'cleanupPolicy',
                                },
                                {
                                    header: 'Size',
                                    accessorKey: 'size',
                                    cell: ({row: {original: topic}}) => renderLogDirSummary(topic.logDirSummary),
                                },
                                {
                                    id: 'action',
                                    header: '',
                                    cell: ({row: {original: record}}) => (
                                        <Flex gap={1}>
                                            <DeleteDisabledTooltip topic={record}>
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        this.topicToDelete = record;
                                                    }}
                                                >
                                                    <Icon as={HiOutlineTrash} />
                                                </button>
                                            </DeleteDisabledTooltip>
                                        </Flex>
                                    ),
                                },
                            ]}
                        />
                    </Box>
                </Section>

                <ConfirmDeletionModal
                    topicToDelete={this.topicToDelete}
                    onCancel={() => (this.topicToDelete = null)}
                    onFinish={() => {
                        this.topicToDelete = null;
                        this.refreshData(true);
                    }}
                />
            </PageContent>
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
        <Popover content={popoverContent} placement="right" closeDelay={10} size="stretch" hideCloseButton>
            <span>
                {topic.topicName}
                {iconClosedEye}
            </span>
        </Popover>
    );
};

function ConfirmDeletionModal({ topicToDelete, onFinish, onCancel }: { topicToDelete: Topic | null; onFinish: () => void; onCancel: () => void }) {
    const [deletionPending, setDeletionPending] = useState(false);
    const [error, setError] = useState<string | Error | null>(null);
    const toast = useToast()
    const cancelRef = useRef<HTMLButtonElement | null>(null)


    const cleanup = () => {
        setDeletionPending(false);
        setError(null);
    };

    const finish = () => {
        onFinish();
        cleanup();

        toast({
            title: 'Topic Deleted',
            description: <Text as="span">Topic <Code>{topicToDelete?.topicName}</Code> deleted successfully</Text>,
            status: 'success',
        })
    };

    const cancel = () => {
        onCancel();
        cleanup();
    };

    return (
        <AlertDialog
            isOpen={topicToDelete !== null}
            leastDestructiveRef={cancelRef}
            onClose={cancel}
        >
            <AlertDialogOverlay>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        Delete Topic
                    </AlertDialogHeader>

                    <AlertDialogBody>
                        {error && <Alert status="error" mb={2}>
                            <AlertIcon/>
                            {`An error occurred: ${typeof error === 'string' ? error : error.message}`}
                        </Alert>}
                        {topicToDelete?.isInternal && <Alert status="error" mb={2}>
                            <AlertIcon/>
                            This is an internal topic, deleting it might have unintended side-effects!
                        </Alert>}
                        <Text>
                            Are you sure you want to delete topic <Code>{topicToDelete?.topicName}</Code>?<br/>
                            This action cannot be undone.
                        </Text>
                    </AlertDialogBody>

                    <AlertDialogFooter>
                        <Button ref={cancelRef} onClick={cancel} variant="ghost">
                            Cancel
                        </Button>
                        <Button isLoading={deletionPending} colorScheme="brand" onClick={() => {
                            setDeletionPending(true);
                            api.deleteTopic(topicToDelete!.topicName) // modal is not shown when topic is null
                                .then(finish)
                                .catch(setError)
                                .finally(() => {
                                    setDeletionPending(false)
                                });
                        }} ml={3}>
                            Delete
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialogOverlay>
        </AlertDialog>
    )
}

function DeleteDisabledTooltip(props: { topic: Topic; children: JSX.Element }): JSX.Element {
    const { topic } = props;
    const deleteButton = props.children;

    const wrap = (button: JSX.Element, message: string) => (
        <Tooltip placement="left" label={message} hasArrow>
            {React.cloneElement(button, {
                disabled: true,
                className: (button.props.className ?? '') + ' disabled',
                onClick: undefined
            })}
        </Tooltip>
    );

    return <>{hasDeletePrivilege(topic.allowedActions) ? deleteButton : wrap(deleteButton, 'You don\'t have \'deleteTopic\' permission for this topic.')}</>;
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
            return -1;
    };
    const getRetentionSizeFinalValue = (value: number | undefined, unit: RetentionSizeUnit) => {
        if (unit == 'default')
            return undefined;

        if (value == undefined)
            throw new Error(`unexpected: value for retention size is 'undefined' but unit is set to ${unit}`);

        if (unit == 'Bit')
            return value;
        if (unit == 'KiB')
            return value * 1024;
        if (unit == 'MiB')
            return value * 1024 * 1024;
        if (unit == 'GiB')
            return value * 1024 * 1024 * 1024;
        if (unit == 'TiB')
            return value * 1024 * 1024 * 1024 * 1024;

        if (unit == 'infinite')
            return -1;
    };

    return createAutoModal<void, CreateTopicModalState>({
        modalProps: {
            title: 'Create Topic',
            style: { width: '80%', minWidth: '600px', maxWidth: '1000px', top: '50px' },

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

            additionalConfig: [
                { name: '', value: '' },
            ],

            defaults: {
                get retentionTime() { return tryGetBrokerConfig('log.retention.ms'); },
                get retentionBytes() { return tryGetBrokerConfig('log.retention.bytes'); },
                get replicationFactor() { return tryGetBrokerConfig('default.replication.factor'); },
                get partitions() { return tryGetBrokerConfig('num.partitions'); },
                get cleanupPolicy() { return tryGetBrokerConfig('log.cleanup.policy'); },
                get minInSyncReplicas() {
                    return '1'; // todo, what is the name of the default value? is it the same for apache and redpanda?
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
            if (state.retentionSizeUnit != 'default')
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
        onSuccess: (_state, _result) => {
            parent.refreshData(true);
        },
        content: (state) => <CreateTopicModalContent state={state} />,
    });

}
