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

/* eslint-disable no-useless-escape */
import { Modal, Skeleton, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { observer, useLocalObservable } from 'mobx-react';
import { comparer } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { ClusterConnectorInfo, DataType, PropertyImportance } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { Code, findPopupContainer } from '../../../utils/tsxUtils';
import { sortField } from '../../misc/common';
import { KowlTable } from '../../misc/KowlTable';
import { PageComponent, PageInitHelper } from '../Page';
import { ConnectClusterStore } from '../../../state/connect/state';
import { ConfigPage } from './dynamic-ui/components';
import './helper';
import { ConfirmModal, NotConfigured, TaskState } from './helper';
import PageContent from '../../misc/PageContent';
import { delay } from '../../../utils/utils';
import { Button, Alert, AlertIcon, Box, CodeBlock, Flex, Grid, Heading, Tabs, Text, useDisclosure, Modal as RPModal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter } from '@redpanda-data/ui';
import Section from '../../misc/Section';
import React from 'react';
import { getConnectorFriendlyName } from './ConnectorBoxCard';

export type UpdatingConnectorData = { clusterName: string; connectorName: string };
export type RestartingTaskData = { clusterName: string; connectorName: string; taskId: number };
interface LocalConnectorState {
    pausingConnector: ClusterConnectorInfo | null;
    restartingConnector: ClusterConnectorInfo | null;
    updatingConnector: UpdatingConnectorData | null;
    restartingTask: RestartingTaskData | null;
    deletingConnector: string | null;
}
const KafkaConnectorMain = observer(
    ({
        clusterName,
        connectorName,
        refreshData,
    }: {
        clusterName: string;
        connectorName: string;
        refreshData: (force: boolean) => Promise<void>;
    }) => {
        const [connectClusterStore] = useState(ConnectClusterStore.getInstance(clusterName));

        useEffect(() => {
            const init = async () => {
                await connectClusterStore.setup();
            };
            init();
        }, [connectClusterStore]);

        const $state = useLocalObservable<LocalConnectorState>(() => ({
            pausingConnector: null,
            restartingConnector: null,
            updatingConnector: null,
            restartingTask: null,
            deletingConnector: null,
        }));
        if (!connectClusterStore.isInitialized)
            return (
                <div>
                    <Skeleton loading={true} active={true} paragraph={{ rows: 20, width: '100%' }} />
                </div>
            );

        const connectorStore = connectClusterStore.getConnectorStore(connectorName);

        const connector = connectClusterStore.getRemoteConnector(connectorName);

        const canEdit = connectClusterStore.canEdit;
        if (!connector) return null;

        return <>
            {/* Title */}
            <Flex flexDirection="row" alignItems="center" gap="1em">
                <span style={{ fontSize: 'x-large', fontWeight: 600 }}>
                    {connectorName}
                </span>
                <Box display="inline" fontSize="13px" opacity="0.8" backgroundColor="#0001" padding=".2em .8em" borderRadius="100px">
                    {connector.type == 'source' ? 'Import from' : 'Export to'}
                    {' '}
                    {getConnectorFriendlyName(connector.class)}
                </Box>
            </Flex>

            {/* [Pause] [Restart] [Delete] */}
            <Flex flexDirection="row" alignItems="center" gap="1">

                {/* [View JSON Config] */}
                <ViewConfigModalButton connector={connector} />

                {/* [Pause/Resume]  [Restart] */}
                {connectClusterStore.validateConnectorState(connectorName, ['FAILED', 'UNASSIGNED']) ? (
                    null
                ) : (
                    <>
                        <Tooltip
                            placement="top"
                            trigger={!canEdit ? 'hover' : 'none'}
                            mouseLeaveDelay={0}
                            getPopupContainer={findPopupContainer}
                            overlay={'You don\'t have \'canEditConnectCluster\' permissions for this connect cluster'}
                        >
                            <Button disabled={!canEdit} onClick={() => ($state.pausingConnector = connector)}>
                                {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) ? 'Pause' : 'Resume'}
                            </Button>
                        </Tooltip>
                        <Tooltip
                            placement="top"
                            trigger={!canEdit ? 'hover' : 'none'}
                            mouseLeaveDelay={0}
                            getPopupContainer={findPopupContainer}
                            overlay={'You don\'t have \'canEditConnectCluster\' permissions for this connect cluster'}
                        >
                            <Button disabled={!canEdit} onClick={() => ($state.restartingConnector = connector)}>
                                Restart
                            </Button>
                        </Tooltip>
                    </>
                )}

                {/* [Delete] */}
                <Tooltip
                    placement="top"
                    trigger={!canEdit ? 'hover' : 'none'}
                    mouseLeaveDelay={0}
                    getPopupContainer={findPopupContainer}
                    overlay={'You don\'t have \'canEditConnectCluster\' permissions for this connect cluster'}
                >
                    <Button
                        variant="outline"
                        colorScheme="red"
                        disabled={!canEdit}
                        onClick={() => ($state.deletingConnector = connectorName)}
                        style={{ marginLeft: '1em', minWidth: '8em' }}
                    >
                        Delete
                    </Button>
                </Tooltip>
            </Flex>

            <Tabs isLazy marginBlock="2"
                size="lg"
                items={[
                    {
                        key: 'overview',
                        name: 'Overview',
                        component: <Box mt="8">
                            <ConfigOverviewTab clusterName={clusterName} connectClusterStore={connectClusterStore} connector={connector} />
                        </Box>
                    },
                    {
                        key: 'configuration',
                        name: 'Configuration',
                        component: <Box mt="8">
                            <Box>
                                <ConfigPage connectorStore={connectorStore} />
                            </Box>

                            {/* Update Config Button */}
                            <div style={{ marginTop: '1em' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '1em 0', marginBottom: '1.5em' }}>
                                    <Tooltip
                                        placement="top"
                                        trigger={!canEdit ? 'hover' : 'none'}
                                        mouseLeaveDelay={0}
                                        getPopupContainer={findPopupContainer}
                                        overlay={'You don\'t have \'canEditConnectCluster\' permissions for this connect cluster'}
                                    >
                                        <Button
                                            variant="outline"
                                            style={{ width: '200px' }}
                                            disabled={(() => {
                                                if (!canEdit) return true;
                                                if (!connector) return true;
                                                if (comparer.shallow(connector.config, connectorStore.getConfigObject())) return true;
                                            })()}
                                            onClick={() => {
                                                $state.updatingConnector = { clusterName, connectorName };
                                            }}
                                        >
                                            Update Config
                                        </Button>
                                    </Tooltip>
                                </div>
                            </div>
                        </Box>
                    }
                ]}
            />


            {/* Pause/Resume Modal */}
            <ConfirmModal<ClusterConnectorInfo>
                target={() => $state.pausingConnector}
                clearTarget={() => ($state.pausingConnector = null)}
                content={(c) => (
                    <>
                        {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) ? 'Pause' : 'Resume'} connector{' '}
                        <strong>{c.name}</strong>?
                    </>
                )}
                successMessage={(c) => (
                    <>
                        {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) ? 'Resumed' : 'Paused'} connector{' '}
                        <strong>{c.name}</strong>
                    </>
                )}
                onOk={async (c) => {
                    if (connectClusterStore.validateConnectorState(connectorName, ['RUNNING']))
                        await api.pauseConnector(clusterName, c.name);
                    else await api.resumeConnector(clusterName, c.name);
                    await delay(500);
                    await refreshData(true);
                }}
            />

            {/* Restart */}
            <ConfirmModal<ClusterConnectorInfo>
                target={() => $state.restartingConnector}
                clearTarget={() => ($state.restartingConnector = null)}
                content={(c) => (
                    <>
                        Restart connector <strong>{c.name}</strong>?
                    </>
                )}
                successMessage={(c) => (
                    <>
                        Successfully restarted connector <strong>{c.name}</strong>
                    </>
                )}
                onOk={async (c) => {
                    await api.restartConnector(clusterName, c.name);
                    await refreshData(true);
                }}
            />

            {/* Update Config */}
            <ConfirmModal<UpdatingConnectorData>
                target={() => $state.updatingConnector}
                clearTarget={() => ($state.updatingConnector = null)}
                content={(c) => (
                    <>
                        Update configuration of connector <strong>{c.connectorName}</strong>?
                    </>
                )}
                successMessage={(c) => (
                    <>
                        Successfully updated config of <strong>{c.connectorName}</strong>
                    </>
                )}
                onOk={async (c) => {
                    connectClusterStore.getConnectorStore(c.connectorName);
                    await connectClusterStore.updateConnnector(c.connectorName);
                    appGlobal.history.push(`/connect-clusters/${encodeURIComponent(clusterName)}`);
                    await refreshData(true);
                }}
            />

            {/* Restart Task */}
            <ConfirmModal<RestartingTaskData>
                target={() => $state.restartingTask}
                clearTarget={() => ($state.restartingTask = null)}
                content={(c) => (
                    <>
                        Restart task <strong>{c.taskId}</strong> of <strong>{c.connectorName}</strong>?
                    </>
                )}
                successMessage={(c) => (
                    <>
                        Successfully restarted <strong>{c.taskId}</strong> of <strong>{c.connectorName}</strong>
                    </>
                )}
                onOk={async (c) => {
                    await api.restartTask(c.clusterName, c.connectorName, c.taskId);
                    await refreshData(true);
                }}
            />

            {/* Delete Connector */}
            <ConfirmModal<string>
                target={() => $state.deletingConnector}
                clearTarget={() => ($state.deletingConnector = null)}
                content={(c) => (
                    <>
                        Delete connector <strong>{c}</strong>?
                    </>
                )}
                successMessage={(c) => (
                    <>
                        Deleted connector <strong>{c}</strong>
                    </>
                )}
                onOk={async (_connectorName) => {
                    await connectClusterStore.deleteConnector(connectorName);
                    appGlobal.history.push(`/connect-clusters/${encodeURIComponent(clusterName)}`);
                    await refreshData(true);
                }}
            />
        </>

    }
);

const ConfigOverviewTab = observer((p: {
    clusterName: string,
    connectClusterStore: ConnectClusterStore,
    connector: ClusterConnectorInfo,
}) => {
    const { connectClusterStore, connector } = p;
    const connectorName = connector.name;

    const { isOpen, onOpen, onClose } = useDisclosure();

    const errorTitle = 'Error in connector';

    return <>
        <Grid
            templateAreas={`
                "errors errors"
                "health details"
                "tasks details"
            `}
            gridTemplateRows="auto"
            alignItems="start"
            gap="6"
        >
            <Box gridArea="errors">
                <Alert status="error" variant="solid" height="12" borderRadius="8px" onClick={onOpen}>
                    <AlertIcon />
                    {errorTitle}
                    <Button ml="auto" variant="ghost" colorScheme="gray" size="sm" mt="1px">View details</Button>
                </Alert>

                <RPModal onClose={onClose} size="6xl" isOpen={isOpen}>
                    <ModalOverlay />
                    <ModalContent>
                        <ModalHeader>{errorTitle}</ModalHeader>
                        <ModalCloseButton />
                        <ModalBody>
                            <CodeBlock language="json" codeString={`
org.apache.kafka.common.config.ConfigException: Cannot connect to 'c' S3 bucket due to: The specified bucket is not valid.
	at com.redpanda.kafka.connect.s3.config.AwsConfigValidator.validate(AwsConfigValidator.java:57)
	at com.redpanda.kafka.connect.s3.S3SinkConnector.start(S3SinkConnector.java:71)
	at org.apache.kafka.connect.runtime.WorkerConnector.doStart(WorkerConnector.java:190)
	at org.apache.kafka.connect.runtime.WorkerConnector.start(WorkerConnector.java:215)
	at org.apache.kafka.connect.runtime.WorkerConnector.doTransitionTo(WorkerConnector.java:360)
	at org.apache.kafka.connect.runtime.WorkerConnector.doTransitionTo(WorkerConnector.java:343)
	at org.apache.kafka.connect.runtime.WorkerConnector.doRun(WorkerConnector.java:143)
	at org.apache.kafka.connect.runtime.WorkerConnector.run(WorkerConnector.java:121)
	at org.apache.kafka.connect.runtime.isolation.Plugins.lambda$withClassLoader$1(Plugins.java:177)
	at java.base/java.util.concurrent.Executors$RunnableAdapter.call(Executors.java:539)
	at java.base/java.util.concurrent.FutureTask.run(FutureTask.java:264)
	at java.base/java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1136)
	at java.base/java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:635)
	at java.base/java.lang.Thread.run(Thread.java:833)
                            `} />
                        </ModalBody>
                        <ModalFooter>
                            <Button onClick={onClose}>Close</Button>
                        </ModalFooter>
                    </ModalContent>
                </RPModal>

            </Box>

            <Section gridArea="health">
                <Flex flexDirection="row" gap="4" m="1">
                    <Box width="5px" borderRadius="3px" background="green" />

                    <Flex flexDirection="column">
                        <Text fontWeight="semibold" fontSize="3xl">Running</Text>
                        <Text opacity=".5">Status</Text>
                    </Flex>
                </Flex>
            </Section>

            <Section py={4} gridArea="tasks" minWidth="500px">
                <Flex alignItems="center" mt="2" mb="6" gap="2">
                    <Heading as="h3" fontSize="1rem" fontWeight="semibold" textTransform="uppercase" color="blackAlpha.800">
                        Tasks
                    </Heading>
                    <Text opacity=".5" fontWeight="normal">({connectClusterStore.getConnectorTasks(connectorName)?.length || 0})</Text>
                </Flex>
                <KowlTable
                    key="taskList"
                    dataSource={connectClusterStore.getConnectorTasks(connectorName)}
                    columns={[
                        {
                            title: 'Task',
                            dataIndex: 'taskId',
                            width: 200,
                            sorter: sortField('taskId'),
                            defaultSortOrder: 'ascend',
                            render: (v) => <Code nowrap>Task-{v}</Code>,
                        },
                        {
                            title: 'Status',
                            dataIndex: 'state',
                            sorter: sortField('state'),
                            render: (_, r) => <TaskState observable={r} />,
                            filterType: { type: 'enum', optionClassName: 'capitalize', toDisplay: (x) => String(x).toLowerCase() },
                        },
                        {
                            title: 'Worker',
                            dataIndex: 'workerId',
                            sorter: sortField('workerId'),
                            render: (_, r) => <Code nowrap>{r.workerId}</Code>,
                            filterType: { type: 'enum' },
                        }
                    ]}
                    rowKey="taskId"
                    search={{
                        searchColumnIndex: 0,
                        isRowMatch: (row, regex) =>
                            regex.test(String(row.taskId)) || regex.test(row.state) || regex.test(row.workerId),
                    }}
                    observableSettings={uiSettings.kafkaConnect.connectorDetails}
                    pagination={{
                        defaultPageSize: 10,
                    }}
                />
            </Section>

            <Section py={4} gridArea="details">
                <Heading as="h3" mb="6" mt="2" fontSize="1rem" fontWeight="semibold" textTransform="uppercase" color="blackAlpha.800">
                    Connector Details
                </Heading>

                <ConnectorDetails clusterName={p.clusterName} connectClusterStore={connectClusterStore} connector={connector} />
            </Section>
        </Grid>

    </>
});

@observer
class KafkaConnectorDetails extends PageComponent<{ clusterName: string; connector: string }> {
    initPage(p: PageInitHelper): void {
        const clusterName = decodeURIComponent(this.props.clusterName);
        const connector = decodeURIComponent(this.props.connector);
        p.title = connector;
        p.addBreadcrumb('Connectors', '/connect-clusters');
        p.addBreadcrumb(clusterName, `/connect-clusters/${encodeURIComponent(clusterName)}`);
        p.addBreadcrumb(connector, `/connect-clusters/${encodeURIComponent(clusterName)}/${encodeURIComponent(connector)}`);
        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    async refreshData(force: boolean): Promise<void> {
        await api.refreshConnectClusters(force);
    }

    render() {
        const clusterName = decodeURIComponent(this.props.clusterName);
        const connectorName = decodeURIComponent(this.props.connector);

        if (api.connectConnectors?.isConfigured === false) return <NotConfigured />;

        return (
            <PageContent>
                <KafkaConnectorMain clusterName={clusterName} connectorName={connectorName} refreshData={this.refreshData} />
            </PageContent>
        );
    }
}

export default KafkaConnectorDetails;

const ViewConfigModalButton = (p: { connector: ClusterConnectorInfo }) => {
    const [showConfig, setShowConfig] = useState(false);

    const closeConfigModal = () => setShowConfig(false);
    const viewConfigModal = <Modal open={showConfig} onOk={closeConfigModal} onCancel={closeConfigModal} cancelButtonProps={{ style: { display: 'none' } }}
        bodyStyle={{ paddingBottom: '8px', paddingTop: '14px' }}
        centered
        closable={false} maskClosable={true}
        okText="Close" width="60%"
    >
        <>
            <Flex alignItems="center" mb="8px">
                <Box fontSize="medium" fontWeight={500}>Connector Config (JSON)</Box>
            </Flex>

            <CodeBlock codeString={p.connector.jsonConfig} language="json" showCopyButton />
        </>
    </Modal>;

    return <>
        <Button variant="outline" onClick={() => setShowConfig(true)}>View Json Config</Button>
        {viewConfigModal}
    </>
};

const ConnectorDetails = observer((p: {
    clusterName: string,
    connectClusterStore: ConnectClusterStore,
    connector: ClusterConnectorInfo,
}) => {
    const store = p.connectClusterStore.getConnectorStore(p.connector.name);

    const allProps = [...store.propsByName.values()];

    const items = allProps
        .filter(x => {
            if (x.isHidden) return false;
            if (x.entry.definition.type == DataType.Password) return false;
            if (x.entry.definition.importance != PropertyImportance.High) return false;

            if (!x.value) return false;
            if (x.name == 'name') return false;

            return true;
        })
        .orderBy(x => {
            let i = 0;
            for (const s of store.connectorStepDefinitions)
                for (const g of s.groups)
                    for (const p of g.config_keys) {
                        if (p == x.name)
                            return i;
                        i++
                    }

            return 0;
        });

    const displayEntries = items.map(e => {
        const r = {
            name: e.entry.definition.display_name,
            value: String(e.value)
        };

        // Try to undo mapping
        if (e.entry.metadata.recommended_values?.length) {
            const match = e.entry.metadata.recommended_values.find(x => x.value == e.value);
            if (match) {
                r.value = String(match.display_name);
            }
        }

        return r;
    });

    return <Grid templateColumns="auto 1fr" rowGap="3" columnGap="10">
        {displayEntries.map(x =>
            <React.Fragment key={x.name}>
                <Text fontWeight="semibold" whiteSpace="nowrap">{x.name}</Text>
                <Text whiteSpace="nowrap" textOverflow="ellipsis" overflow="hidden">{x.value}</Text>
            </React.Fragment>
        )}
    </Grid>
});
