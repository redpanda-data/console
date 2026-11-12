import { Button } from 'components/redpanda-ui/components/button';
import 'components/legacy-layout.css';
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

import { ErrorResult } from 'components/misc/error-result';
import {
  DataTable,
  type DataTableColumnDef,
  DataTableColumnHeader,
} from 'components/redpanda-ui/components/data-table';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { Component, useCallback, useMemo, useState } from 'react';

import {
  ConnectorClass,
  ConnectorsColumn,
  errIcon,
  NotConfigured,
  OverviewStatisticsCard,
  TaskState,
  TasksColumn,
} from './helper';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { uiSettings } from '../../../state/ui';
import type { ClusterConnectorInfo, ClusterConnectors, ClusterConnectorTaskInfo } from '../../../types/kafka-connect';
import { isNonEmptyString } from '../../../utils/string-utils';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { DEFAULT_TABLE_PAGE_SIZE } from '../../constants';
import { SearchBar } from '../../misc/search-bar';
import { Section } from '../../misc/section';
import { type Tab, Tabs } from '../../misc/tabs/tabs';

// Legacy table parity: 50 rows a page, pager only past that. No column-visibility UI, so hiding is off.
const TABLE_OPTIONS = {
  enableHiding: false,
  initialState: { pagination: { pageIndex: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE } },
};

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
            cell: ({ row: { original: r } }) => {
              if (isNonEmptyString(r.error)) {
                return (
                  <Tooltip delayDuration={150}>
                    <TooltipTrigger
                      render={
                        <span>
                          <span className="console-connector-error-icon">{errIcon}</span>
                          {r.clusterName}
                        </span>
                      }
                    />
                    <TooltipContent side="top">{r.error}</TooltipContent>
                  </Tooltip>
                );
              }
              return (
                <Button
                  className={cn('hoverLink', 'inline-block w-full text-left')}
                  onClick={() => appGlobal.historyPush(`/connect-clusters/${encodeURIComponent(r.clusterName)}`)}
                  variant="unstyled"
                >
                  {r.clusterName}
                </Button>
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
            header: 'Connectors',
            cell: ({ row: { original } }) => <ConnectorsColumn observable={original} />,
          },
          {
            id: 'tasks',
            accessorKey: 'connectors',
            header: 'Tasks',
            cell: ({ row: { original } }) => <TasksColumn observable={original} />,
          },
        ]}
        data={clusters}
        pagination={clusters.length > DEFAULT_TABLE_PAGE_SIZE}
        sorting={false}
        tableOptions={TABLE_OPTIONS}
      />
    );
  }
}

interface ConnectorType extends ClusterConnectorInfo {
  cluster: ClusterConnectors;
}

const TabConnectors = () => {
  const clusters = api.connectConnectors?.clusters;
  const allConnectors: ConnectorType[] = useMemo(
    () => clusters?.flatMap((cluster) => cluster.connectors.map((c) => ({ cluster, ...c }))) ?? [],
    [clusters]
  );
  const [filteredResults, setFilteredResults] = useState<ConnectorType[]>([]);
  const [searchText, setSearchText] = useState(uiSettings.clusterOverview.connectorsList.quickSearch);
  const dataSource = useCallback(() => allConnectors, [allConnectors]);
  const isFilterMatch = useCallback((filter: string, item: ConnectorType): boolean => {
    try {
      const quickSearchRegExp = new RegExp(filter, 'i');
      const nameMatch = item.name.match(quickSearchRegExp) !== null;
      const classMatch = item.class.match(quickSearchRegExp) !== null;
      if (nameMatch) {
        return true;
      }
      return classMatch;
    } catch {
      return item.name.toLowerCase().includes(filter.toLowerCase());
    }
  }, []);
  const onQueryChanged = useCallback((x: string) => {
    setSearchText(x);
    uiSettings.clusterOverview.connectorsList.quickSearch = x;
  }, []);
  return (
    <div>
      <SearchBar<ConnectorType>
        dataSource={dataSource}
        filterText={searchText}
        isFilterMatch={isFilterMatch}
        onFilteredDataChanged={setFilteredResults}
        onQueryChanged={onQueryChanged}
        placeholderText="Enter search term/regex"
      />
      <DataTable<ConnectorType>
        columns={[
          {
            header: 'Connector',
            accessorKey: 'name',
            cell: ({ row: { original } }) => (
              <Tooltip delayDuration={150}>
                <TooltipTrigger
                  render={
                    <Button
                      className={cn('hoverLink', 'inline-block w-full text-left')}
                      onClick={() =>
                        appGlobal.historyPush(
                          `/connect-clusters/${encodeURIComponent(original.cluster.clusterName)}/${encodeURIComponent(original.name)}`
                        )
                      }
                      variant="unstyled"
                    >
                      {original.name}
                    </Button>
                  }
                />
                <TooltipContent side="top">{original.name}</TooltipContent>
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
          },
          {
            header: 'State',
            accessorKey: 'state',
            cell: ({ row: { original } }) => <TaskState observable={original} />,
          },
          {
            header: 'Tasks',
            cell: ({ row: { original } }) => <TasksColumn observable={original} />,
          },
          {
            header: 'Cluster',
            cell: ({ row: { original } }) => (
              <InlineCode className="whitespace-nowrap">{original.cluster.clusterName}</InlineCode>
            ),
          },
        ]}
        data={filteredResults}
        pagination={filteredResults.length > DEFAULT_TABLE_PAGE_SIZE}
        sorting={false}
        tableOptions={TABLE_OPTIONS}
      />
    </div>
  );
};

interface TaskType extends ClusterConnectorTaskInfo {
  cluster: ClusterConnectors;
  connector: ConnectorType;
  connectorName: string;
}

// Module-level so the sortable headers keep their identity across the tab's re-renders.
const TASK_COLUMNS: DataTableColumnDef<TaskType>[] = [
  {
    id: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Connector" />,
    accessorKey: 'connectorName',
    cell: ({ row: { original } }) => (
      // biome-ignore lint/a11y/useKeyWithClickEvents: pre-existing behavior
      // biome-ignore lint/a11y/noStaticElementInteractions: pre-existing behavior
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: pre-existing behavior
      <div
        className="hoverLink text-body wrap-break-word whitespace-break-spaces"
        onClick={() =>
          appGlobal.historyPush(
            `/connect-clusters/${encodeURIComponent(original.cluster.clusterName)}/${encodeURIComponent(original.connectorName)}`
          )
        }
      >
        {original.connectorName}
      </div>
    ),
  },
  {
    id: 'taskId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Task ID" />,
    accessorKey: 'taskId',
  },
  {
    id: 'state',
    header: ({ column }) => <DataTableColumnHeader column={column} title="State" />,
    accessorKey: 'state',
    cell: ({ row: { original } }) => <TaskState observable={original} />,
  },
  {
    id: 'workerId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Worker" />,
    accessorKey: 'workerId',
  },
  {
    id: 'cluster',
    // Read off the joined cluster, so there is no accessor to sort on.
    enableSorting: false,
    header: 'Cluster',
    cell: ({ row: { original } }) => (
      <InlineCode className="whitespace-nowrap">{original.cluster.clusterName}</InlineCode>
    ),
  },
];

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
        columns={TASK_COLUMNS}
        data={allTasks}
        pagination={allTasks.length > DEFAULT_TABLE_PAGE_SIZE}
        sorting
        tableOptions={TABLE_OPTIONS}
      />
    );
  }
}

// biome-ignore lint/complexity/noBannedTypes: empty object represents pages with no route params
export const TabKafkaConnect = (_p: {}) => {
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
    <div className="flex flex-col gap-3">
      <OverviewStatisticsCard />

      <Section>
        <Tabs onChange={() => settings.selectedTab} selectedTabKey={settings.selectedTab} tabs={connectTabs} />
      </Section>
    </div>
  );
};

const connectTabs: Tab[] = [
  { key: 'clusters', title: 'Clusters', content: <TabClusters /> },
  { key: 'connectors', title: 'Connectors', content: <TabConnectors /> },
  { key: 'tasks', title: 'Tasks', content: <TabTasks /> },
];
