/* eslint-disable no-useless-escape */
import { CheckCircleTwoTone, ExclamationCircleTwoTone, WarningTwoTone } from '@ant-design/icons';
import { Button, message, notification, Popover, Statistic } from 'antd';
import { motion } from 'framer-motion';
import { autorun, IReactionDisposer, makeObservable, observable, untracked } from 'mobx';
import { observer } from 'mobx-react';
import { CSSProperties } from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { ApiError } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { animProps } from '../../../utils/animationProps';
import { Code, findPopupContainer } from '../../../utils/tsxUtils';
import Card from '../../misc/Card';
import { sortField } from '../../misc/common';
import { KowlTable } from '../../misc/KowlTable';
import { PageComponent, PageInitHelper } from '../Page';
import { ClusterStatisticsCard, ConnectorClass, NotConfigured, removeNamespace, TasksColumn, TaskState } from './helper';


@observer
class KafkaClusterDetails extends PageComponent<{ clusterName: string }> {

    @observable placeholder = 5;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        const clusterName = this.props.clusterName;
        p.title = clusterName;
        p.addBreadcrumb("Kafka Connect", `/kafka-connect`);
        p.addBreadcrumb(clusterName, `/kafka-connect/${clusterName}`);

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshConnectClusters(force);
        api.refreshClusterAdditionalInfo(this.props.clusterName, force);
    }

    render() {
        const clusterName = this.props.clusterName;

        if (api.connectConnectors?.isConfigured === false) return <NotConfigured />;

        const cluster = api.connectConnectors?.clusters?.first(c => c.clusterName == clusterName);
        const connectors = cluster?.connectors;

        const additionalInfo = api.connectAdditionalClusterInfo.get(clusterName);

        return (
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <ClusterStatisticsCard clusterName={clusterName} />

                {/* Main Card */}
                <Card>
                    {/* Connectors List */}
                    <div>
                        <h3 style={{ marginLeft: '0.25em', marginBottom: '0.6em' }}>
                            Connectors
                        </h3>
                        <KowlTable
                            key="connectorsList"
                            dataSource={connectors}
                            columns={[
                                {
                                    title: 'Connector', dataIndex: 'name',
                                    width: '35%',
                                    render: (_, r) => (
                                        <span className='hoverLink' style={{ display: 'inline-block', width: '100%' }}
                                            onClick={() => appGlobal.history.push(`/kafka-connect/${clusterName}/${r.name}`)}>
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

                            className='connectorsTable'
                        />
                    </div>

                    {/* Plugin List */}
                    <div style={{ marginTop: '2em' }}>
                        <h3 style={{ marginLeft: '0.25em', marginBottom: '0.6em' }}>Plugins</h3>

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

                            className='pluginsTable'
                        />

                    </div>
                </Card>
            </motion.div>
        );
    }
}

export default KafkaClusterDetails;


