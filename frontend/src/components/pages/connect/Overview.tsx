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

import { Badge, Box, DataTable, Link, Stack, Text, Tooltip } from '@redpanda-data/ui';
import { observer, useLocalObservable } from 'mobx-react';
import { Component, type FunctionComponent } from 'react';
import { useLocation } from 'react-router-dom';
import { isServerless } from '../../../config';
import { ListSecretScopesRequest } from '../../../protogen/redpanda/api/dataplane/v1alpha2/secret_pb';
import { appGlobal } from '../../../state/appGlobal';
import { api, rpcnSecretManagerApi } from '../../../state/backendApi';
import type { ClusterConnectorInfo, ClusterConnectorTaskInfo, ClusterConnectors } from '../../../state/restInterfaces';
import { Features } from '../../../state/supportedFeatures';
import { uiSettings } from '../../../state/ui';
import { Code, DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import SearchBar from '../../misc/SearchBar';
import Section from '../../misc/Section';
import Tabs, { type Tab } from '../../misc/tabs/Tabs';
import { PageComponent, type PageInitHelper } from '../Page';
import RpConnectPipelinesList from '../rp-connect/Pipelines.List';
import { RedpandaConnectIntro } from '../rp-connect/RedpandaConnectIntro';
import RpConnectSecretsList from '../rp-connect/secrets/Secrets.List';
import {
  ConnectorClass,
  ConnectorsColumn,
  NotConfigured,
  OverviewStatisticsCard,
  TaskState,
  TasksColumn,
  errIcon,
  mr05,
} from './helper';

enum ConnectView {
  KafkaConnect = 'kafka-connect',
  RedpandaConnect = 'redpanda-connect',
  RedpandaConnectSecret = 'redpanda-connect-secret',
}

/**
 * The Redpanda Connect Secret Manager introduces a new tab in Redpanda Connect.
 * this logic determines which tab should be opened based on the `defaultTab`
 * query parameter in the URL.
 */
const getDefaultView = (defaultView: string): { initialTab: ConnectView; redpandaConnectTab: ConnectView } => {
  const showKafkaTab = { initialTab: ConnectView.KafkaConnect, redpandaConnectTab: ConnectView.RedpandaConnect };
  const showRedpandaConnectTab = {
    initialTab: ConnectView.RedpandaConnect,
    redpandaConnectTab: ConnectView.RedpandaConnect,
  };

  switch (defaultView) {
    case 'kafka-connect':
      return showKafkaTab;
    case 'redpanda-connect':
      return showRedpandaConnectTab;
    case 'redpanda-connect-secret':
      return { initialTab: ConnectView.RedpandaConnect, redpandaConnectTab: ConnectView.RedpandaConnectSecret };
    default:
      return showRedpandaConnectTab;
  }
};

const WrapUseSearchParamsHook: FunctionComponent<{ matchedPath: string }> = (props) => {
  const { search } = useLocation();
  const searchParams = new URLSearchParams(search);
  const defaultTab = searchParams.get('defaultTab') || '';
  return <KafkaConnectOverview defaultView={defaultTab} {...props} />;
};

@observer
class KafkaConnectOverview extends PageComponent<{ defaultView: string }> {
  initPage(p: PageInitHelper): void {
    p.title = 'Overview';
    p.addBreadcrumb('Connect', '/connect-clusters');

    this.checkRPCNSecretEnable();
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  async checkRPCNSecretEnable() {
    if (Features.pipelinesApi) {
      await rpcnSecretManagerApi.checkScope(new ListSecretScopesRequest());
    }
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
    const tabs = [
      {
        key: ConnectView.RedpandaConnect,
        title: (
          <Box minWidth="180px">
            Redpanda Connect <Badge ml={2}>Recommended</Badge>
          </Box>
        ),
        content: (
          <Box>
            <Text mb={4}>
              Redpanda Connect is an alternative to Kafka Connect. Choose from a growing ecosystem of readily available
              connectors.{' '}
              <Link href="https://docs.redpanda.com/redpanda-cloud/develop/connect/about/" target="_blank">
                Learn more.
              </Link>
            </Text>
            <TabRedpandaConnect defaultView={getDefaultView(this.props.defaultView).redpandaConnectTab} />
          </Box>
        ),
      },
      {
        key: ConnectView.KafkaConnect,
        title: <Box minWidth="180px">Kafka Connect</Box>,
        content: (
          <Box>
            <Text mb={4}>
              Kafka Connect is our set of managed connectors. These provide a way to integrate your Redpanda data with
              different data systems.{' '}
              <Link href="https://docs.redpanda.com/redpanda-cloud/develop/managed-connectors/" target="_blank">
                Learn more.
              </Link>
            </Text>
            <TabKafkaConnect />
          </Box>
        ),
      },
    ] as Tab[];

    if (isServerless()) tabs.removeAll((x) => x.key === ConnectView.KafkaConnect);

    return (
      <PageContent>
        <Text>
          There are two ways to integrate your Redpanda data with data from external systems: Redpanda Connect and Kafka
          Connect.
        </Text>
        {tabs.length === 1 ? (
          typeof tabs[0].content === 'function' ? (
            tabs[0].content()
          ) : (
            tabs[0].content
          )
        ) : (
          <Tabs tabs={tabs} defaultSelectedTabKey={getDefaultView(this.props.defaultView).initialTab} />
        )}
      </PageContent>
    );
  }
}

export default WrapUseSearchParamsHook;

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
            size: Number.POSITIVE_INFINITY,
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
                <span
                  className="hoverLink"
                  style={{ display: 'inline-block', width: '100%' }}
                  onClick={() => appGlobal.history.push(`/connect-clusters/${encodeURIComponent(r.clusterName)}`)}
                >
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
            cell: ({ row: { original } }) => <ConnectorsColumn observable={original} />,
          },
          {
            accessorKey: 'connectors',
            size: 150,
            header: 'Tasks',
            cell: ({ row: { original } }) => <TasksColumn observable={original} />,
          },
        ]}
      />
    );
  }
}

interface ConnectorType extends ClusterConnectorInfo {
  cluster: ClusterConnectors;
}

const TabConnectors = observer(() => {
  const clusters = api.connectConnectors?.clusters;
  const allConnectors: ConnectorType[] =
    clusters?.flatMap((cluster) => cluster.connectors.map((c) => ({ cluster, ...c }))) ?? [];

  const state = useLocalObservable<{
    filteredResults: ConnectorType[];
  }>(() => ({
    filteredResults: [],
  }));

  const isFilterMatch = (filter: string, item: ConnectorType): boolean => {
    try {
      const quickSearchRegExp = new RegExp(uiSettings.clusterOverview.connectorsList.quickSearch, 'i');
      return Boolean(item.name.match(quickSearchRegExp)) || Boolean(item.class.match(quickSearchRegExp));
    } catch (e) {
      console.warn('Invalid expression');
      return item.name.toLowerCase().includes(filter.toLowerCase());
    }
  };

  return (
    <Box>
      <SearchBar<ConnectorType>
        isFilterMatch={isFilterMatch}
        filterText={uiSettings.clusterOverview.connectorsList.quickSearch}
        onQueryChanged={(x) => {
          uiSettings.clusterOverview.connectorsList.quickSearch = x;
        }}
        dataSource={() => allConnectors}
        placeholderText="Enter search term/regex"
        onFilteredDataChanged={(data) => {
          state.filteredResults = data;
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
                <span
                  className="hoverLink"
                  style={{ display: 'inline-block', width: '100%' }}
                  onClick={() =>
                    appGlobal.history.push(
                      `/connect-clusters/${encodeURIComponent(original.cluster.clusterName)}/${encodeURIComponent(original.name)}`,
                    )
                  }
                >
                  {original.name}
                </span>
              </Tooltip>
            ),
          },
          {
            header: 'Class',
            accessorKey: 'class',
            cell: ({ row: { original } }) => <ConnectorClass observable={original} />,
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
            cell: ({ row: { original } }) => <TaskState observable={original} />,
          },
          {
            header: 'Tasks',
            size: 120,
            cell: ({ row: { original } }) => <TasksColumn observable={original} />,
          },
          {
            header: 'Cluster',
            cell: ({ row: { original } }) => <Code nowrap>{original.cluster.clusterName}</Code>,
          },
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
    const clusters = api.connectConnectors?.clusters;
    const allConnectors: ConnectorType[] =
      clusters?.flatMap((cluster) => cluster.connectors.map((c) => ({ cluster, ...c }))) ?? [];
    const allTasks: TaskType[] = allConnectors.flatMap((con) =>
      con.tasks.map((task) => {
        return {
          ...task,
          connector: con,
          cluster: con.cluster,

          connectorName: con.name,
        };
      }),
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
              <Text
                wordBreak="break-word"
                whiteSpace="break-spaces"
                className="hoverLink"
                onClick={() =>
                  appGlobal.history.push(
                    `/connect-clusters/${encodeURIComponent(original.cluster.clusterName)}/${encodeURIComponent(original.connectorName)}`,
                  )
                }
              >
                {original.connectorName}
              </Text>
            ),
            size: 300,
          },
          {
            header: 'Task ID',
            accessorKey: 'taskId',
            size: 50,
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
            cell: ({ row: { original } }) => <Code nowrap>{original.cluster.clusterName}</Code>,
          },
        ]}
      />
    );
  }
}

const TabKafkaConnect = observer((_p: {}) => {
  const settings = uiSettings.kafkaConnect;

  if (!api.connectConnectors) return DefaultSkeleton;
  if (api.connectConnectors.isConfigured === false) return <NotConfigured />;

  return (
    <Stack spacing={3}>
      <OverviewStatisticsCard />

      <Section>
        <Tabs tabs={connectTabs} onChange={() => settings.selectedTab} selectedTabKey={settings.selectedTab} />
      </Section>
    </Stack>
  );
});

const TabRedpandaConnect = observer((_p: { defaultView: ConnectView }) => {
  if (!Features.pipelinesApi)
    // If the backend doesn't support pipelines, show the intro page
    return <RedpandaConnectIntro />;

  const tabs = [
    {
      key: 'pipelines',
      title: (
        <Box minWidth="180px" data-testid={'tab-rpcn-connect'}>
          Pipelines
        </Box>
      ),
      content: <RpConnectPipelinesList matchedPath="/rp-connect" />,
    },
    {
      key: 'secrets',
      title: (
        <Box minWidth="180px" data-testid={'tab-rpcn-secret'}>
          Secrets
        </Box>
      ),
      content: <RpConnectSecretsList matchedPath="/rp-connect/secrets" />,
    },
  ] as Tab[];

  /**
   * Verify if the RPCN secret is enabled. Unlike the pipeline, this feature checks
   * the result endpoint rather than the endpoint itself.
   */
  if (!rpcnSecretManagerApi.isEnable) {
    return <RpConnectPipelinesList matchedPath="/rp-connect" />;
  }

  return (
    <Tabs
      tabs={tabs}
      defaultSelectedTabKey={_p.defaultView === ConnectView.RedpandaConnectSecret ? 'secrets' : 'pipelines'}
    />
  );
});

export type ConnectTabKeys = 'clusters' | 'connectors' | 'tasks';
const connectTabs: Tab[] = [
  { key: 'clusters', title: 'Clusters', content: <TabClusters /> },
  { key: 'connectors', title: 'Connectors', content: <TabConnectors /> },
  { key: 'tasks', title: 'Tasks', content: <TabTasks /> },
];
