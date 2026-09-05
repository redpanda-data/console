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

import { Link } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DataTable,
  type DataTableColumnDef,
  DataTableColumnHeader,
} from 'components/redpanda-ui/components/data-table';
import { useCallback, useMemo, useState } from 'react';

import { ClusterStatisticsCard, ConnectorClass, NotConfigured, TaskState, TasksColumn } from './helper';
import { isEmbedded } from '../../../config';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import type { ClusterAdditionalInfo, ClusterConnectorInfo } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import SearchBar from '../../misc/search-bar';
import Section from '../../misc/section';
import { PageComponent, type PageInitHelper, type PageProps } from '../page';

class KafkaClusterDetails extends PageComponent<{ clusterName: string }> {
  placeholder = 5;

  constructor(p: Readonly<PageProps<{ clusterName: string }>>) {
    super(p);
  }

  initPage(p: PageInitHelper): void {
    const clusterName = decodeURIComponent(this.props.clusterName);
    p.title = clusterName;
    p.addBreadcrumb('Connectors', '/connect-clusters');
    p.addBreadcrumb(clusterName, `/connect-clusters/${clusterName}`);

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    api.refreshConnectClusters();

    const clusterName = decodeURIComponent(this.props.clusterName);
    api.refreshClusterAdditionalInfo(clusterName, force);
  }

  render() {
    if (!api.connectConnectors) {
      return DefaultSkeleton;
    }

    const clusterName = decodeURIComponent(this.props.clusterName);
    if (api.connectConnectors?.isConfigured === false) {
      return <NotConfigured />;
    }

    const cluster = api.connectConnectors?.clusters?.first((c) => c.clusterName === clusterName);
    const connectors = cluster?.connectors;

    const additionalInfo = api.connectAdditionalClusterInfo.get(clusterName);

    return (
      <PageContent>
        <ClusterStatisticsCard clusterName={clusterName} />

        {/* Main Card */}
        <Section>
          {/* Connectors List */}
          <ConnectorsList clusterName={clusterName} connectors={connectors ?? []} />

          {/* Plugin List */}
          <div style={{ marginTop: '2em', display: isEmbedded() ? 'none' : 'block' }}>
            <h3 style={{ marginLeft: '0.25em', marginBottom: '0.6em' }}>Connector Types</h3>

            <DataTable<ClusterAdditionalInfo['plugins'][0]>
              columns={pluginColumns}
              data={additionalInfo?.plugins ?? []}
              pagination
              sorting
            />
          </div>
        </Section>
      </PageContent>
    );
  }
}

const pluginColumns: DataTableColumnDef<ClusterAdditionalInfo['plugins'][0]>[] = [
  {
    id: 'class',
    enableHiding: false,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Class" />,
    accessorKey: 'class',
    cell: ({ row: { original } }) => <ConnectorClass observable={original} />,
  },
  {
    id: 'version',
    enableHiding: false,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Version" />,
    accessorKey: 'version',
  },
  {
    id: 'type',
    enableHiding: false,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    accessorKey: 'type',
  },
];

const ConnectorsList = ({ clusterName, connectors }: { clusterName: string; connectors: ClusterConnectorInfo[] }) => {
  const [filteredResults, setFilteredResults] = useState<ClusterConnectorInfo[]>([]);
  const [searchText, setSearchText] = useState(uiSettings.connectorsList.quickSearch);

  const dataSource = useCallback(() => connectors, [connectors]);

  const isFilterMatch = useCallback((filter: string, item: ClusterConnectorInfo): boolean => {
    try {
      const quickSearchRegExp = new RegExp(filter, 'i');
      const nameMatch = item.name.match(quickSearchRegExp) !== null;
      const classMatch = item.class.match(quickSearchRegExp) !== null;
      if (nameMatch) return true;
      return classMatch;
    } catch (_e) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.warn('Invalid expression');
      return item.name.toLowerCase().includes(filter.toLowerCase());
    }
  }, []);

  const onQueryChanged = useCallback((filterText: string) => {
    setSearchText(filterText);
    uiSettings.connectorsList.quickSearch = filterText;
  }, []);

  // Memoised on clusterName: DataTable memoises its column model on `columns` identity, and this
  // component re-renders on every keystroke in the SearchBar.
  const connectorColumns = useMemo<DataTableColumnDef<ClusterConnectorInfo>[]>(
    () => [
      {
        id: 'name',
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Connector" />,
        accessorKey: 'name',
        cell: ({ row: { original } }) => (
          <Link
            params={{
              clusterName,
              connector: original.name,
            }}
            search={{} as never}
            to="/connect-clusters/$clusterName/$connector"
          >
            <span className="whitespace-break-spaces break-words">{original.name}</span>
          </Link>
        ),
      },
      {
        id: 'class',
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Class" />,
        accessorKey: 'class',
        cell: ({ row: { original } }) => <ConnectorClass observable={original} />,
      },
      {
        id: 'type',
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        accessorKey: 'type',
      },
      {
        id: 'state',
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="State" />,
        accessorKey: 'state',
        cell: ({ row: { original } }) => <TaskState observable={original} />,
      },
      {
        id: 'tasks',
        // Derived from the task list, so there is nothing to sort on.
        enableSorting: false,
        enableHiding: false,
        header: 'Tasks',
        cell: ({ row: { original } }) => <TasksColumn observable={original} />,
      },
    ],
    [clusterName]
  );

  return (
    <div>
      <div className="mb-2 flex">
        {/* tests/shared/connector.utils.ts clicks this with getByRole('button'), which this
            nesting produces — and the Registry Button takes no route `params`. */}
        <Link params={{ clusterName }} to="/connect-clusters/$clusterName/create-connector">
          <Button variant="primary">Create connector</Button>
        </Link>
      </div>

      <div className="my-5">
        <SearchBar<ClusterConnectorInfo>
          dataSource={dataSource}
          filterText={searchText}
          isFilterMatch={isFilterMatch}
          onFilteredDataChanged={setFilteredResults}
          onQueryChanged={onQueryChanged}
          placeholderText="Enter search term/regex"
        />
      </div>

      <DataTable<ClusterConnectorInfo> columns={connectorColumns} data={filteredResults} pagination sorting />
    </div>
  );
};

export default KafkaClusterDetails;
