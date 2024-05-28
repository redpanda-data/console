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

import { observer, useLocalObservable } from 'mobx-react';
import { Component, useState } from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { ClusterConnectorInfo, ClusterConnectors, ClusterConnectorTaskInfo } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { Code, DefaultSkeleton } from '../../../utils/tsxUtils';
import Tabs, { Tab } from '../../misc/tabs/Tabs';
import { PageComponent, PageInitHelper } from '../Page';
import { ConnectorClass, ConnectorsColumn, errIcon, mr05, NotConfigured, OverviewStatisticsCard, TasksColumn, TaskState } from './helper';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { Alert, AlertDescription, AlertIcon, AlertTitle, Box, Button, CodeBlock, DataTable, Grid, Heading, Image, Stack, Text, Tooltip } from '@redpanda-data/ui';
import { Link } from 'react-router-dom';
import SearchBar from '../../misc/SearchBar';
import RedpandaBot from '../../../assets/redpanda/PandaBot.png';
import PipelinesYamlEditor from '../../misc/PipelinesYamlEditor';


@observer
class KafkaConnectOverview extends PageComponent {
    initPage(p: PageInitHelper): void {
        p.title = 'Overview';
        p.addBreadcrumb('Connectors', '/connect-clusters');

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    async refreshData(force: boolean) {
        await api.refreshConnectClusters(force);
        // if (api.connectConnectors?.isConfigured) {
        //     const clusters = api.connectConnectors.clusters;
        //     if (clusters?.length == 1) {
        //         const cluster = clusters[0];
        //         appGlobal.history.replace(`/connect-clusters/${cluster.clusterName}`);
        //     }
        // }
    }

    render() {
        if (!api.connectConnectors) return DefaultSkeleton;
        if (api.connectConnectors.isConfigured == false) return <NotConfigured />;

        return (
            <PageContent>
                <Tabs
                    tabs={[
                        {
                            key: 'redpandaConnect',
                            title: <Box minWidth="180px">Redpanda Connect</Box>,
                            content: <TabRedpandaConnect />
                        },
                        {
                            key: 'kafkaConnect',
                            title: <Box minWidth="180px">Kafka Connect</Box>,
                            content: <TabKafkaConnect />
                        },
                    ]}
                />

            </PageContent>
        );
    }
}

export default KafkaConnectOverview;

@observer
class TabClusters extends Component {
    render() {
        const clusters = api.connectConnectors?.clusters;
        if (clusters === null || clusters === undefined) {
            return null;
        }

        return (
            <DataTable<ClusterConnectors>
                data={clusters}
                sorting={false}
                pagination
                columns={[
                    {
                        header: 'Cluster',
                        accessorKey: 'clusterName',
                        size: Infinity,
                        cell: ({ row: { original: r } }) => {
                            if (r.error) {
                                return (
                                    <Tooltip label={r.error} placement="top" hasArrow={true}>
                                        <>
                                            <span style={mr05}>{errIcon}</span>
                                            {r.clusterName}
                                        </>
                                    </Tooltip>
                                );
                            }

                            return (
                                <span className="hoverLink" style={{ display: 'inline-block', width: '100%' }} onClick={() => appGlobal.history.push(`/connect-clusters/${encodeURIComponent(r.clusterName)}`)}>
                                    {r.clusterName}
                                </span>
                            );
                        },
                    },
                    {
                        accessorKey: 'clusterAddress',
                        header: 'Version',
                        cell: ({ row: { original } }) => original.clusterInfo.version,
                    },
                    {
                        accessorKey: 'connectors',
                        size: 150,
                        header: 'Connectors',
                        cell: ({ row: { original } }) => <ConnectorsColumn observable={original} />
                    },
                    {
                        accessorKey: 'connectors',
                        size: 150,
                        header: 'Tasks',
                        cell: ({ row: { original } }) => <TasksColumn observable={original} />
                    }
                ]}
            />
        );
    }
}


interface ConnectorType extends ClusterConnectorInfo {
    cluster: ClusterConnectors
}


const TabConnectors = observer(() => {
    const clusters = api.connectConnectors!.clusters;
    const allConnectors: ConnectorType[] = clusters?.flatMap(cluster => cluster.connectors.map(c => ({ cluster, ...c }))) ?? [];

    const state = useLocalObservable<{
        filteredResults: ConnectorType[]
    }>(() => ({
        filteredResults: []
    }))

    const isFilterMatch = (filter: string, item: ConnectorType): boolean => {
        try {
            const quickSearchRegExp = new RegExp(uiSettings.clusterOverview.connectorsList.quickSearch, 'i')
            return Boolean(item.name.match(quickSearchRegExp)) || Boolean(item.class.match(quickSearchRegExp))
        } catch (e) {
            console.warn('Invalid expression');
            return item.name.toLowerCase().includes(filter.toLowerCase());
        }
    }

    return (
        <Box>
            <SearchBar<ConnectorType>
                isFilterMatch={isFilterMatch}
                filterText={uiSettings.clusterOverview.connectorsList.quickSearch}
                onQueryChanged={x => {
                    uiSettings.clusterOverview.connectorsList.quickSearch = x;
                }}
                dataSource={() => allConnectors}
                placeholderText="Enter search term/regex"
                onFilteredDataChanged={data => {
                    state.filteredResults = data
                }}
            />
            <DataTable<ConnectorType>
                data={state.filteredResults}
                pagination
                sorting={false}
                columns={[
                    {
                        header: 'Connector',
                        accessorKey: 'name',
                        size: 35, // Assuming '35%' is approximated to '35'
                        cell: ({ row: { original } }) => (
                            <Tooltip placement="top" label={original.name} hasArrow={true}>
                                <span className="hoverLink" style={{ display: 'inline-block', width: '100%' }} onClick={() => appGlobal.history.push(`/connect-clusters/${encodeURIComponent(original.cluster.clusterName)}/${encodeURIComponent(original.name)}`)}>
                                    {original.name}
                                </span>
                            </Tooltip>
                        )
                    },
                    {
                        header: 'Class',
                        accessorKey: 'class',
                        cell: ({ row: { original } }) => <ConnectorClass observable={original} />
                    },
                    {
                        header: 'Type',
                        accessorKey: 'type',
                        size: 100,
                    },
                    {
                        header: 'State',
                        accessorKey: 'state',
                        size: 120,
                        cell: ({ row: { original } }) => <TaskState observable={original} />
                    },
                    {
                        header: 'Tasks',
                        size: 120,
                        cell: ({ row: { original } }) => <TasksColumn observable={original} />
                    },
                    {
                        header: 'Cluster',
                        cell: ({ row: { original } }) => <Code nowrap>{original.cluster.clusterName}</Code>
                    }
                ]}
            />
        </Box>
    );
});

interface TaskType extends ClusterConnectorTaskInfo {
    connector: ConnectorType;
    cluster: ClusterConnectors;
    connectorName: string;
}

@observer
class TabTasks extends Component {
    render() {
        const clusters = api.connectConnectors!.clusters;
        const allConnectors: ConnectorType[] = clusters?.flatMap(cluster => cluster.connectors.map(c => ({ cluster, ...c }))) ?? [];
        const allTasks: TaskType[] = allConnectors.flatMap(con =>
            con.tasks.map(task => {
                return {
                    ...task,
                    connector: con,
                    cluster: con.cluster,

                    connectorName: con.name
                };
            })
        );

        return (
            <DataTable<TaskType>
                data={allTasks}
                pagination
                sorting
                columns={[
                    {
                        header: 'Connector',
                        accessorKey: 'name', // Assuming 'name' is correct based on your initial dataIndex
                        cell: ({ row: { original } }) => (
                            <Text wordBreak="break-word" whiteSpace="break-spaces" className="hoverLink" onClick={() => appGlobal.history.push(`/connect-clusters/${encodeURIComponent(original.cluster.clusterName)}/${encodeURIComponent(original.connectorName)}`)}>
                                {original.connectorName}
                            </Text>
                        ),
                        size: 300
                    },
                    {
                        header: 'Task ID',
                        accessorKey: 'taskId',
                        size: 50
                    },
                    {
                        header: 'State',
                        accessorKey: 'state',
                        cell: ({ row: { original } }) => <TaskState observable={original} />,
                    },
                    {
                        header: 'Worker',
                        accessorKey: 'workerId',
                    },
                    {
                        header: 'Cluster',
                        cell: ({ row: { original } }) => <Code nowrap>{original.cluster.clusterName}</Code>
                    }
                ]}
            />
        );
    }
}


const TabKafkaConnect = observer((_p: {}) => {
    const settings = uiSettings.kafkaConnect;

    return <Stack spacing={3}>
        <OverviewStatisticsCard />

        <Section>
            <Tabs tabs={connectTabs} onChange={() => settings.selectedTab} selectedTabKey={settings.selectedTab} />
        </Section>
    </Stack>
})


const TabRedpandaConnect = observer((_p: {}) => {
    const exampleCode = `
input:
  generate:
    interval: 1s
    mapping: |
      root.id = uuid_v4()
      root.user.name = fake("name")
      root.user.email = fake("email")
      root.content = fake("paragraph")

pipeline:
  processors:
    - mutation: |
        root.hash = content().hash("sha256").encode("hex")

output:
  kafka:
    addresses: [ TODO ]
    topic: TODO
`;
    const [editorText, setEditorText] = useState(exampleCode);

    return <Grid templateColumns="1fr 320px" gap={10}>
        <Stack spacing={3}>
            <Heading as="h2">Getting started</Heading>
            <Text>Redpanda Connect text explaining the feature. More information can be found in our docs.</Text>

            <Text mt={3}>1. Install Redpanda with Brew:</Text>
            <Box ml="4" maxWidth="400px">
                <CodeBlock language="sh" codeString="brew install redpanda-data/tap/redpanda" />
            </Box>

            <Text mt={3}>2. Use the editor below to explore. We've pre-filled it with the output of <code>rpk connect create</code>.</Text>
            <Box height="460px" w="650px">
                <PipelinesYamlEditor
                    defaultPath="config.yaml"
                    path="config.yaml"
                    value={editorText}
                    onChange={e => {
                        if (e)
                            setEditorText(e);
                    }}
                    language="yaml"
                    options={{
                        fontSize: 15
                    }}
                />

            </Box>
            <Text>Optional: <span style={{ textDecoration: '1px solid underline', fontWeight: 600 }}><Link to="/security/users/create">Create a SASL user for authentication</Link></span>. This user will be populated in the "logger" component of the code</Text>

            <Text mt={3}>3. Save your configuration in your working directory (as config.yaml, for example)</Text>

            <Text mt={3}>4. Run your config to test it:</Text>
            <Box ml="4" maxWidth="400px">
                <CodeBlock language="sh" codeString="rpk connect -c ./config.yaml" />
            </Box>

            <Box mt={10}>
                <Link to="/topics/__redpanda.connect_pipeline_logs">
                    <Button variant="brand">Complete quickstart</Button>
                </Link>
            </Box>
        </Stack>

        <Stack spacing={8} mt={12}>
            <Image src={RedpandaBot} alt="redpanda bot icon" />

            <Alert status="info" >
                <AlertIcon />
                <Box>
                    <AlertTitle>Hint</AlertTitle>
                    <AlertDescription>
                        If you'd like the template tailored to your pipeline, rpk connect list shows the menu of components that build the template using<br />
                        <code>redpanda connect create stdin/mapping/kafka_franz</code>
                    </AlertDescription>
                </Box>
            </Alert>
        </Stack>

    </Grid>
})

export type ConnectTabKeys = 'clusters' | 'connectors' | 'tasks';
const connectTabs: Tab[] = [
    { key: 'clusters', title: 'Clusters', content: <TabClusters /> },
    { key: 'connectors', title: 'Connectors', content: <TabConnectors /> },
    { key: 'tasks', title: 'Tasks', content: <TabTasks /> }
];
