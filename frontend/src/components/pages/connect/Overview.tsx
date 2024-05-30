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
import { Alert, AlertDescription, AlertIcon, AlertTitle, Box, CodeBlock, DataTable, Flex, Grid, Heading, Image, ListItem, OrderedList, Stack, Text, Tooltip } from '@redpanda-data/ui';
import SearchBar from '../../misc/SearchBar';
import RedpandaConnectLogo from '../../../assets/redpanda/rp-connect.svg';
import PipelinesYamlEditor from '../../misc/PipelinesYamlEditor';
import { isEmbedded } from '../../../config';
import { SingleSelect } from '../../misc/Select';
import { Link as ReactRouterLink } from 'react-router-dom'
import { Link as ChakraLink } from '@chakra-ui/react';

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

        const tabs = [
            {
                key: 'redpandaConnect',
                title: <Box minWidth="180px">Redpanda Connect</Box>,
                content: <TabRedpandaConnect />,
                disabled: isEmbedded(), // For now, only selfhosted; no cloud/serverless
            },
            {
                key: 'kafkaConnect',
                title: <Box minWidth="180px">Kafka Connect</Box>,
                content: <TabKafkaConnect />
            },
        ] as Tab[];

        return (
            <PageContent>
                <Tabs tabs={tabs} defaultSelectedTabKey={isEmbedded() ? 'kafkaConnect' : 'redpandaConnect'} />
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

const installInstructions = {
    'Linux': `curl -LO https://github.com/redpanda-data/redpanda/releases/latest/download/rpk-linux-amd64.zip &&
  mkdir -p ~/.local/bin &&
  export PATH="~/.local/bin:$PATH" &&
  unzip rpk-linux-amd64.zip -d ~/.local/bin/`,
    'macOS - Homebrew': 'brew install redpanda-data/tap/redpanda',
    'macOS - Apple Silicon download': `curl -LO https://github.com/redpanda-data/redpanda/releases/latest/download/rpk-darwin-arm64.zip &&
  mkdir -p ~/.local/bin &&
  export PATH=$PATH:~/.local/bin &&
  unzip rpk-darwin-arm64.zip -d ~/.local/bin/`,
    'macOS - Intel download': `curl -LO https://github.com/redpanda-data/redpanda/releases/latest/download/rpk-darwin-amd64.zip &&
  mkdir -p ~/.local/bin &&
  export PATH=$PATH:~/.local/bin &&
  unzip rpk-darwin-amd64.zip -d ~/.local/bin/`

} as const;

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
  kafka_franz:
    seed_brokers:
        - TODO_REDPANDA_BROKER_ADDRESS
    topic: TODO_YOUR_OUTPUT_TOPIC

redpanda:
  seed_brokers:
    - TODO_REDPANDA_BROKER_ADDRESS
  logs_topic: __redpanda.connect.logs
  logs_level: info
`.trim();
    const [editorText, setEditorText] = useState(exampleCode);
    const [selectedInstall, setSelectedInstall] = useState('macOS - Homebrew' as keyof typeof installInstructions);
    const options = Object.keys(installInstructions).map(x => ({ value: (x as typeof selectedInstall) }));

    return <Grid templateColumns="1fr 320px" gap={10}>
        <Stack spacing={3}>
            <Heading as="h2">Using Redpanda Connect</Heading>
            <Text>Redpanda Connect is a declarative data streaming service with wide range of <ChakraLink isExternal href="https://docs.redpanda.com/redpanda-connect/about#components" style={{ textDecoration: 'underline solid 1px' }}>connectors and processors</ChakraLink>.</Text>

            <OrderedList display="flex" flexDirection="column" gap="0.5rem">
                <ListItem>
                    <Text mt={3}>Install Redpanda Connect</Text>
                    <Box>
                        <Stack gap={2} mb={6}>
                            <Text fontWeight="bold">Choose your install method</Text>
                            <Box width="275px">
                                <SingleSelect<typeof selectedInstall>
                                    options={options}
                                    value={selectedInstall}
                                    onChange={setSelectedInstall}
                                />
                            </Box>
                            <Box>
                                <CodeBlock language="bash" codeString={installInstructions[selectedInstall]} />
                            </Box>
                        </Stack>
                    </Box>
                </ListItem>

                <ListItem>
                    <Text mt={3}>Build your first pipeline. Start from the Redpanda data generator example below. Explore the components using autocomplete (CTRL/CMD+Space). For other examples and use cases, see <ChakraLink isExternal href="https://docs.redpanda.com/redpanda-connect/cookbooks/custom_metrics" style={{ textDecoration: 'underline solid 1px' }}>our documentation</ChakraLink>.</Text>
                    <Flex ml="-1rem" mt={3} minHeight="550px" minWidth="500px">
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

                    </Flex>
                </ListItem>

                <ListItem>
                    <Text mt={3}>
                        Set up your connection to Redpanda for data
                        in the <ChakraLink isExternal href="https://docs.redpanda.com/redpanda-connect/components/outputs/kafka_franz" style={{ textDecoration: 'underline solid 1px' }}>kafka_franz</ChakraLink> component
                        and <ChakraLink isExternal href="https://docs.redpanda.com/redpanda-connect/components/logger/about" style={{ textDecoration: 'underline solid 1px' }}>logs</ChakraLink> in the redpanda component.
                    </Text>
                </ListItem>

                <ListItem>
                    <Text mt={3}>Make sure that your output topic and logs topic both exist.</Text>
                </ListItem>

                <ListItem>
                    <Text mt={3}>To test the above config in the Terminal, first save your configuration from the editor to your working directory as <code>config.yaml</code>.</Text>
                </ListItem>

                <ListItem>
                    <Text mt={3}>Test the config by executing it:</Text>
                    <Box maxWidth="400px" marginBlock={3}>
                        <CodeBlock language="sh" codeString="rpk connect run ./config.yaml" />
                        <Text mt={3}>Anything you write to stdin will be written unchanged to stdout.</Text>
                    </Box>
                </ListItem>

                <ListItem>
                    <Text mt={3}>Go to the <ChakraLink as={ReactRouterLink} to="/topics" style={{ textDecoration: 'underline solid 1px' }}>Topics</ChakraLink> page to read the logs and your output topic. </Text>
                </ListItem>
            </OrderedList>
        </Stack>

        <Stack spacing={8} mt={12}>
            <Image src={RedpandaConnectLogo} alt="redpanda bot icon" />

            <Alert status="info" >
                <AlertIcon />
                <Box>
                    <AlertTitle>Hint</AlertTitle>
                    <AlertDescription>
                        In the Terminal, to show the full menu of components available, use <code>rpk connect list</code>.
                        <br /><br />
                        Then, to generate a config with a specific listed component, use<br />
                        <code>rpk connect create [component]</code>.
                        <br /><br />
                        For more help: <code>rpk connect create -h</code>
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
