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

import { Box, Button, DataTable, Text } from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';

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

@observer
class KafkaClusterDetails extends PageComponent<{ clusterName: string }> {
  @observable placeholder = 5;
  @observable filteredResults: ClusterConnectorInfo[] = [];

  constructor(p: Readonly<PageProps<{ clusterName: string }>>) {
    super(p);
    makeObservable(this);
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

  isFilterMatch(filter: string, item: ClusterConnectorInfo): boolean {
    try {
      const quickSearchRegExp = new RegExp(uiSettings.connectorsList.quickSearch, 'i');
      return Boolean(item.name.match(quickSearchRegExp)) || Boolean(item.class.match(quickSearchRegExp));
    } catch (_e) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.warn('Invalid expression');
      return item.name.toLowerCase().includes(filter.toLowerCase());
    }
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
          <div>
            <div style={{ display: 'flex', marginBottom: '.5em' }}>
              <Link params={{ clusterName }} to="/connect-clusters/$clusterName/create-connector">
                <Button colorScheme="brand" variant="solid">
                  Create connector
                </Button>
              </Link>
            </div>

            <Box my={5}>
              <SearchBar<ClusterConnectorInfo>
                dataSource={() => connectors ?? []}
                filterText={uiSettings.connectorsList.quickSearch}
                isFilterMatch={this.isFilterMatch}
                onFilteredDataChanged={(data) => {
                  this.filteredResults = data;
                }}
                onQueryChanged={(filterText) => {
                  uiSettings.connectorsList.quickSearch = filterText;
                }}
                placeholderText="Enter search term/regex"
              />
            </Box>

            <DataTable<ClusterConnectorInfo>
              columns={[
                {
                  header: 'Connector',
                  accessorKey: 'name',
                  cell: ({ row: { original } }) => (
                    <Link
                      params={{
                        clusterName: encodeURIComponent(clusterName),
                        connector: encodeURIComponent(original.name),
                      }}
                      to="/connect-clusters/$clusterName/$connector"
                    >
                      <Text whiteSpace="break-spaces" wordBreak="break-word">
                        {original.name}
                      </Text>
                    </Link>
                  ),
                  size: Number.POSITIVE_INFINITY,
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
              ]}
              data={this.filteredResults}
              defaultPageSize={10}
              pagination
              sorting
            />
          </div>

          {/* Plugin List */}
          <div style={{ marginTop: '2em', display: isEmbedded() ? 'none' : 'block' }}>
            <h3 style={{ marginLeft: '0.25em', marginBottom: '0.6em' }}>Connector Types</h3>

            <DataTable<ClusterAdditionalInfo['plugins'][0]>
              columns={[
                {
                  header: 'Class',
                  accessorKey: 'class',
                  cell: ({ row: { original } }) => <ConnectorClass observable={original} />,
                  size: 500,
                },
                {
                  header: 'Version',
                  accessorKey: 'version',
                  size: 300,
                },
                {
                  header: 'Type',
                  accessorKey: 'type',
                },
              ]}
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

export default KafkaClusterDetails;
