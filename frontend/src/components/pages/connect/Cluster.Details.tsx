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
import { uiSettings } from '../../../state/ui';
import { sortField } from '../../misc/common';
import { KowlTable } from '../../misc/KowlTable';
import PageContent from '../../misc/PageContent';
import { PageComponent, PageInitHelper } from '../Page';
import { ClusterStatisticsCard, ConnectorClass, NotConfigured, TasksColumn, TaskState } from './helper';
import { isEmbedded } from '../../../config';
import { Link } from 'react-router-dom';
import { Button } from '@redpanda-data/ui';


@observer
class KafkaClusterDetails extends PageComponent<{ clusterName: string }> {

    @observable placeholder = 5;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        const clusterName = decodeURIComponent(this.props.clusterName);
        p.title = clusterName;
        p.addBreadcrumb('Connectors', '/connect-clusters');
        p.addBreadcrumb(clusterName, `/connect-clusters/${clusterName}`);

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshConnectClusters(force);

        const clusterName = decodeURIComponent(this.props.clusterName);
        api.refreshClusterAdditionalInfo(clusterName, force);
    }

    render() {
        const clusterName = decodeURIComponent(this.props.clusterName);

        if (api.connectConnectors?.isConfigured === false) return <NotConfigured />;

        const cluster = api.connectConnectors?.clusters?.first(c => c.clusterName == clusterName);
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
                            <Link to={`/connect-clusters/${clusterName}/create-connector`}><Button variant="solid" colorScheme="brand">Create connector</Button></Link>
                        </div>

                        <KowlTable
                            key="connectorsList"
                            dataSource={connectors}
                            columns={[
                                {
                                    title: 'Connector', dataIndex: 'name',
                                    width: '35%',
                                    render: (_, r) => (
                                        <span className="hoverLink" style={{ display: 'inline-block', width: '100%' }}
                                            onClick={() => appGlobal.history.push(`/connect-clusters/${encodeURIComponent(clusterName)}/${encodeURIComponent(r.name)}`)}>
                                            {r.name}
                                        </span>
                                    ),
                                    sorter: sortField('name'), defaultSortOrder: 'ascend'
                                },
                                {
                                    title: 'Class', dataIndex: 'class',
                                    render: (_, r) => <ConnectorClass observable={r} />,
                                    sorter: sortField('class')
                                },
                                {
                                    width: 100,
                                    title: 'Type', dataIndex: 'type',
                                    className: 'capitalize',
                                    sorter: sortField('type'),
                                    filterType: { type: 'enum', optionClassName: 'capitalize' },

                                },
                                {
                                    width: 120,
                                    title: 'State', dataIndex: 'state',
                                    render: (_, r) => <TaskState observable={r} />,
                                    sorter: sortField('state'),
                                    filterType: { type: 'enum', optionClassName: 'capitalize', toDisplay: x => String(x).toLowerCase() },

                                },
                                {
                                    width: 120,
                                    title: 'Tasks', render: (_, c) => <TasksColumn observable={c} />
                                }
                            ]}
                            search={{
                                searchColumnIndex: 0,
                                isRowMatch: (row, regex) => regex.test(row.name)
                                    || regex.test(row.class)
                                    || regex.test(row.type)
                                    || regex.test(row.state)
                            }}
                            rowKey={r => r.name}

                            observableSettings={uiSettings.kafkaConnect.clusterDetails}
                            pagination={{
                                defaultPageSize: 10,
                            }}

                            className="connectorsTable"
                        />
                    </div>

                    {/* Plugin List */}
                    <div style={{ marginTop: '2em', display: isEmbedded() ? 'none' : 'block' }}>
                        <h3 style={{ marginLeft: '0.25em', marginBottom: '0.6em' }}>Connector Types</h3>

                        <KowlTable
                            dataSource={additionalInfo?.plugins}
                            columns={[
                                {
                                    title: 'Class', dataIndex: 'class',
                                    sorter: sortField('class'),
                                    render: (v, r) => <ConnectorClass observable={r} />
                                },
                                {
                                    title: 'Version', dataIndex: 'version',
                                    sorter: sortField('version'),
                                    filterType: { type: 'enum' },
                                },
                                {
                                    title: 'Type', dataIndex: 'type',
                                    width: '150px',
                                    className: 'capitalize',
                                    sorter: sortField('type'),
                                    filterType: { type: 'enum', optionClassName: 'capitalize', },
                                },
                            ]}
                            search={{
                                searchColumnIndex: 0,
                                isRowMatch: (row, regex) => {
                                    if (regex.test(row.class)) return true;
                                    if (row.type && regex.test(row.type)) return true;
                                    if (row.version && regex.test(row.version)) return true;
                                    return false;
                                }
                            }}
                            rowKey={r => r.class + r.type + r.version}

                            observableSettings={uiSettings.kafkaConnect.clusterDetailsPlugins}
                            pagination={{
                                defaultPageSize: 10,
                            }}

                            className="pluginsTable"
                        />

                    </div>
                </Section>
            </PageContent>
        );
    }
}

export default KafkaClusterDetails;


