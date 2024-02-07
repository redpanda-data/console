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
import Section from '../../misc/Section';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import PageContent from '../../misc/PageContent';
import { PageComponent, PageInitHelper } from '../Page';
import { ClusterStatisticsCard, ConnectorClass, NotConfigured, TasksColumn, TaskState } from './helper';
import { isEmbedded } from '../../../config';
import { Link } from 'react-router-dom';
import { Box, Button, DataTable } from '@redpanda-data/ui';
import { ClusterAdditionalInfo, ClusterConnectorInfo } from '../../../state/restInterfaces';
import SearchBar from '../../misc/SearchBar';
import { uiSettings } from '../../../state/ui';


@observer
class KafkaClusterDetails extends PageComponent<{ clusterName: string }> {

    @observable placeholder = 5;
    @observable filteredResults: ClusterConnectorInfo[] = [];

    constructor(p: any) {
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
        api.refreshConnectClusters(force);

        const clusterName = decodeURIComponent(this.props.clusterName);
        api.refreshClusterAdditionalInfo(clusterName, force);
    }

    isFilterMatch(filter: string, item: ClusterConnectorInfo): boolean {
        return item.name.toLowerCase().includes(filter.toLowerCase());
    }

    render() {
        const clusterName = decodeURIComponent(this.props.clusterName);

        if (api.connectConnectors?.isConfigured === false) return <NotConfigured />;

        const cluster = api.connectConnectors?.clusters?.first(c => c.clusterName == clusterName);
        let connectors = cluster?.connectors;

        const additionalInfo = api.connectAdditionalClusterInfo.get(clusterName);

        try {
            const quickSearchRegExp = new RegExp(uiSettings.connectorsList.quickSearch.toLowerCase(), 'i')

            connectors = connectors?.filter(x => {
                return x.name.toLowerCase().match(quickSearchRegExp);
            }) ?? []

        } catch (e) {
            console.warn('Invalid expression')
        }


        return (
            <PageContent>
                <ClusterStatisticsCard clusterName={clusterName} />

                {/* Main Card */}
                <Section>
                    {/* Connectors List */}
                    <div>
                        <div style={{ display: 'flex', marginBottom: '.5em' }}>
                            <Link to={`/connect-clusters/${clusterName}/create-connector`}><Button variant="solid" colorScheme="brand">Create connector</Button></Link>
                        </div>

                        <Box my={5}>
                            <SearchBar<ClusterConnectorInfo>
                                placeholderText="Enter search term/regex"
                                dataSource={() => connectors ?? []}
                                isFilterMatch={this.isFilterMatch}
                                filterText={uiSettings.connectorsList.quickSearch}
                                onQueryChanged={(filterText) => (uiSettings.connectorsList.quickSearch = filterText)}
                                onFilteredDataChanged={data => {
                                    this.filteredResults = data;
                                }}
                            />
                        </Box>

                        <DataTable<ClusterConnectorInfo>
                            data={connectors ?? []}
                            pagination
                            defaultPageSize={10}
                            sorting
                            columns={[
                                {
                                    header: 'Connector',
                                    accessorKey: 'name',
                                    cell: ({row: {original}}) => (
                                        <Link to={`/connect-clusters/${encodeURIComponent(clusterName)}/${encodeURIComponent(original.name)}`}>
                                            {original.name}
                                        </Link>
                                    ),
                                    size: Infinity
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
                                }
                            ]}
                        />
                    </div>

                    {/* Plugin List */}
                    <div style={{ marginTop: '2em', display: isEmbedded() ? 'none' : 'block' }}>
                        <h3 style={{ marginLeft: '0.25em', marginBottom: '0.6em' }}>Connector Types</h3>

                        <DataTable<ClusterAdditionalInfo['plugins'][0]>
                            data={additionalInfo?.plugins ?? []}
                            pagination
                            sorting
                            columns={[
                                {
                                    header: 'Class',
                                    accessorKey: 'class',
                                    cell: ({row: {original}}) => <ConnectorClass observable={original}/>,
                                    size: 500
                                },
                                {
                                    header: 'Version',
                                    accessorKey: 'version',
                                    size: 300
                                },
                                {
                                    header: 'Type',
                                    accessorKey: 'type',
                                }
                            ]
                            }
                        />
                    </div>
                </Section>
            </PageContent>
        );
    }
}

export default KafkaClusterDetails;


