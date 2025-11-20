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

import { create } from '@bufbuild/protobuf';
import { Badge, Box, DataTable, Link, Stack, Text, Tooltip } from '@redpanda-data/ui';
import { useQuery } from '@tanstack/react-query';
import ErrorResult from 'components/misc/error-result';
import { WaitingRedpanda } from 'components/redpanda-ui/components/waiting-redpanda';
import { observer, useLocalObservable } from 'mobx-react';
import { Component, type FunctionComponent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import {
  ConnectorClass,
  ConnectorsColumn,
  errIcon,
  mr05,
  NotConfigured,
  OverviewStatisticsCard,
  TaskState,
  TasksColumn,
} from './helper';
import { config, isFeatureFlagEnabled, isServerless } from '../../../config';
import { ListSecretScopesRequestSchema } from '../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { appGlobal } from '../../../state/app-global';
import { api, pipelinesApi, rpcnSecretManagerApi } from '../../../state/backend-api';
import type {
  ClusterConnectorInfo,
  ClusterConnectors,
  ClusterConnectorTaskInfo,
  KafkaConnectors,
} from '../../../state/rest-interfaces';
import { Features } from '../../../state/supported-features';
import { uiSettings } from '../../../state/ui';
import { Code, DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import SearchBar from '../../misc/search-bar';
import Section from '../../misc/section';
import Tabs, { type Tab } from '../../misc/tabs/tabs';
import { PageComponent, type PageInitHelper } from '../page';
import RpConnectPipelinesList from '../rp-connect/pipelines-list';
import { RedpandaConnectIntro } from '../rp-connect/redpanda-connect-intro';

const ConnectView = {
  KafkaConnect: 'kafka-connect',
  RedpandaConnect: 'redpanda-connect',
  RedpandaConnectSecret: 'redpanda-connect-secret',
} as const;

type ConnectView = (typeof ConnectView)[keyof typeof ConnectView];

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

const WrapKafkaConnectOverview: FunctionComponent<{ matchedPath: string }> = (props) => {
  const { search } = useLocation();
  const searchParams = new URLSearchParams(search);
  const defaultTab = searchParams.get('defaultTab') || '';

  const { data, isLoading } = useQuery<KafkaConnectors>({
    queryKey: ['kafka-connect-connectors'],
    queryFn: async () => {
      const response = await config.fetch(`${config.restBasePath}/kafka-connect/connectors`, {
        method: 'GET',
        headers: [['Content-Type', 'application/json']],
      });

      if (!response.ok) {
        throw new Error('Failed to fetch kafka connect connectors');
      }

      return response.json();
    },
  });

  if (isLoading) {
    return <WaitingRedpanda />;
  }

  const isKafkaConnectEnabled = data?.isConfigured ?? false;

  return <KafkaConnectOverview defaultView={defaultTab} isKafkaConnectEnabled={isKafkaConnectEnabled} {...props} />;
};

@observer
class KafkaConnectOverview extends PageComponent<{ defaultView: string; isKafkaConnectEnabled: boolean }> {
  initPage(p: PageInitHelper): void {
    p.title = 'Overview';
    p.addBreadcrumb('Connect', '/connect-clusters');

    void this.checkRPCNSecretEnable();
    void this.refreshData();
    appGlobal.onRefresh = () => void this.refreshData();
  }

  async checkRPCNSecretEnable() {
    if (Features.pipelinesApi) {
      await rpcnSecretManagerApi.checkScope(create(ListSecretScopesRequestSchema));
    }
  }

  async refreshData() {
    await api.refreshConnectClusters();
    // if (api.connectConnectors?.isConfigured) {
    //     const clusters = api.connectConnectors.clusters;
    //     if (clusters?.length == 1) {
    //         const cluster = clusters[0];
    //         appGlobal.historyReplace(`/connect-clusters/${cluster.clusterName}`);
    //     }
    // }
  }

  render() {
    // Redirect to wizard if enableRpcnTiles is enabled, kafka connect is disabled, and there are no existing pipelines
    if (
      isFeatureFlagEnabled('enableRpcnTiles') &&
      pipelinesApi.pipelines?.length === 0 &&
      !this.props.isKafkaConnectEnabled
    ) {
      return <Navigate replace to="/rp-connect/wizard" />;
    }

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
            {!isFeatureFlagEnabled('enableRpcnTiles') && (
              <Text mb={4}>
                Redpanda Connect is an alternative to Kafka Connect. Choose from a growing ecosystem of readily
                available connectors.{' '}
                <Link href="https://docs.redpanda.com/redpanda-cloud/develop/connect/about/" target="_blank">
                  Learn more.
                </Link>
              </Text>
            )}
            {Features.pipelinesApi ? <RpConnectPipelinesList matchedPath="/rp-connect" /> : <RedpandaConnectIntro />}
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

    if (isServerless() || !this.props.isKafkaConnectEnabled) {
      tabs.removeAll((x) => x.key === ConnectView.KafkaConnect);
    }

    return (
      <PageContent>
        {this.props.isKafkaConnectEnabled && (
          <Text>
            There are two ways to integrate your Redpanda data with data from external systems: Redpanda Connect and
            Kafka Connect.
          </Text>
        )}
        {tabs.length === 1 ? (
          typeof tabs[0].content === 'function' ? (
            tabs[0].content()
          ) : (
            tabs[0].content
          )
        ) : (
          <Tabs defaultSelectedTabKey={getDefaultView(this.props.defaultView).initialTab} tabs={tabs} />
        )}
      </PageContent>
    );
  }
}

export default WrapKafkaConnectOverview;

@observer
class TabClusters extends Component {
  render() {
    const clusters = api.connectConnectors?.clusters;
    if (clusters === null || clusters === undefined) {
      return null;
    }

    return (
      <DataTable<ClusterConnectors>
        columns={[
          {
            header: 'Cluster',
            accessorKey: 'clusterName',
            size: Number.POSITIVE_INFINITY,
            cell: ({ row: { original: r } }) => {
              if (r.error) {
                return (
                  <Tooltip hasArrow={true} label={r.error} placement="top">
                    <span style={mr05}>{errIcon}</span>
                    {r.clusterName}
                  </Tooltip>
                );
              }

              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: part of TabClusters implementation
                // biome-ignore lint/a11y/noNoninteractiveElementInteractions: legacy MobX pattern
                // biome-ignore lint/a11y/useKeyWithClickEvents: legacy MobX pattern
                <span
                  className="hoverLink"
                  onClick={() => appGlobal.historyPush(`/connect-clusters/${encodeURIComponent(r.clusterName)}`)}
                  style={{ display: 'inline-block', width: '100%' }}
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
        data={clusters}
        pagination
        sorting={false}
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
    } catch (_e) {
      return item.name.toLowerCase().includes(filter.toLowerCase());
    }
  };

  return (
    <Box>
      <SearchBar<ConnectorType>
        dataSource={() => allConnectors}
        filterText={uiSettings.clusterOverview.connectorsList.quickSearch}
        isFilterMatch={isFilterMatch}
        onFilteredDataChanged={(data) => {
          state.filteredResults = data;
        }}
        onQueryChanged={(x) => {
          uiSettings.clusterOverview.connectorsList.quickSearch = x;
        }}
        placeholderText="Enter search term/regex"
      />
      <DataTable<ConnectorType>
        columns={[
          {
            header: 'Connector',
            accessorKey: 'name',
            size: 35, // Assuming '35%' is approximated to '35'
            cell: ({ row: { original } }) => (
              <Tooltip hasArrow={true} label={original.name} placement="top">
                {/** biome-ignore lint/a11y/noStaticElementInteractions: part of TabConnectors implementation */}
                {/** biome-ignore lint/a11y/noNoninteractiveElementInteractions: legacy MobX pattern */}
                {/** biome-ignore lint/a11y/useKeyWithClickEvents: legacy MobX pattern */}
                <span
                  className="hoverLink"
                  onClick={() =>
                    appGlobal.historyPush(
                      `/connect-clusters/${encodeURIComponent(original.cluster.clusterName)}/${encodeURIComponent(original.name)}`
                    )
                  }
                  style={{ display: 'inline-block', width: '100%' }}
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
        data={state.filteredResults}
        pagination
        sorting={false}
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
      con.tasks.map((task) => ({
        ...task,
        connector: con,
        cluster: con.cluster,

        connectorName: con.name,
      }))
    );

    return (
      <DataTable<TaskType>
        columns={[
          {
            header: 'Connector',
            accessorKey: 'name', // Assuming 'name' is correct based on your initial dataIndex
            cell: ({ row: { original } }) => (
              <Text
                className="hoverLink"
                onClick={() =>
                  appGlobal.historyPush(
                    `/connect-clusters/${encodeURIComponent(original.cluster.clusterName)}/${encodeURIComponent(original.connectorName)}`
                  )
                }
                whiteSpace="break-spaces"
                wordBreak="break-word"
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
        data={allTasks}
        pagination
        sorting
      />
    );
  }
}

// biome-ignore lint/complexity/noBannedTypes: empty object represents pages with no route params
const TabKafkaConnect = observer((_p: {}) => {
  const settings = uiSettings.kafkaConnect;

  if (api.connectConnectorsError) {
    return <ErrorResult error={api.connectConnectorsError} />;
  }
  if (!api.connectConnectors) {
    return DefaultSkeleton;
  }
  if (api.connectConnectors.isConfigured === false) {
    return <NotConfigured />;
  }

  return (
    <Stack spacing={3}>
      <OverviewStatisticsCard />

      <Section>
        <Tabs onChange={() => settings.selectedTab} selectedTabKey={settings.selectedTab} tabs={connectTabs} />
      </Section>
    </Stack>
  );
});

export type ConnectTabKeys = 'clusters' | 'connectors' | 'tasks';
const connectTabs: Tab[] = [
  { key: 'clusters', title: 'Clusters', content: <TabClusters /> },
  { key: 'connectors', title: 'Connectors', content: <TabConnectors /> },
  { key: 'tasks', title: 'Tasks', content: <TabTasks /> },
];
