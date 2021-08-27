/* eslint-disable no-useless-escape */
import { CheckCircleTwoTone, ExclamationCircleTwoTone, WarningTwoTone } from '@ant-design/icons';
import { Button, message, notification, Statistic } from 'antd';
import { motion } from 'framer-motion';
import { autorun, IReactionDisposer, makeObservable, observable, untracked } from 'mobx';
import { observer } from 'mobx-react';
import { CSSProperties } from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { ApiError } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { animProps } from '../../../utils/animationProps';
import { Code } from '../../../utils/tsxUtils';
import Card from '../../misc/Card';
import { sortField } from '../../misc/common';
import { KowlTable } from '../../misc/KowlTable';
import { PageComponent, PageInitHelper } from '../Page';
import { ConnectorClass, NotConfigured } from './helper';


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
    }

    render() {
        const clusterName = this.props.clusterName;

        if (api.connectConnectors?.isConfigured === false) return <NotConfigured />;

        const cluster = api.connectConnectors?.clusters?.first(c => c.clusterName == clusterName);
        const connectors = cluster?.connectors;


        return (
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <ClusterStatisticsCard clusterName={clusterName} />

                {/* Main Card */}
                <Card>
                    {/* Title + Pause/Restart */}
                    <div style={{ display: 'flex', alignItems: 'center', margin: '.5em 0', paddingLeft: '2px' }}>
                        {/*
                         <span style={{ display: 'inline-flex', gap: '.5em', alignItems: 'center' }}>
                            <span style={{ fontSize: '17px', display: 'inline-block' }}>{isRunning ? okIcon : warnIcon}</span>
                            <span style={{ fontSize: 'medium', fontWeight: 600, lineHeight: '0px', marginBottom: '1px' }}>{connectorName}</span>
                            <span style={{ fontSize: 'small', opacity: 0.5 }}>({state ?? '<empty>'})</span>
                        </span>
                        */}
                    </div>

                    {/* Connectors List */}
                    <div style={{ marginTop: '1em' }}>
                        <KowlTable
                            dataSource={connectors}
                            columns={[
                                {
                                    title: 'Connector', dataIndex: 'name',
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
                                    render: (_, r) => <ConnectorClass connector={r} />,
                                    sorter: sortField('class')
                                },
                                {
                                    width: 100,
                                    title: 'Type', dataIndex: 'type',
                                    sorter: sortField('type')

                                },
                                {
                                    width: 120,
                                    title: 'State', dataIndex: 'state',
                                    sorter: sortField('type')

                                },
                                {
                                    width: 120,
                                    title: 'Tasks', render: (_, c) => {
                                        return <>
                                            <span style={mr05}>{c.runningTasks} / {c.totalTasks}</span>
                                            {c.runningTasks < c.totalTasks ? warnIcon : okIcon}
                                        </>
                                    }
                                }
                            ]}
                            search={{
                                columnTitle: 'Connector',
                                isRowMatch: (row, regex) => regex.test(row.name)
                                    || regex.test(row.class)
                                    || regex.test(row.type)
                                    || regex.test(row.state)
                            }}
                            rowKey={r => r.name}

                            className='connectorsTable'
                        />
                    </div>
                </Card>
            </motion.div>
        );
    }
}

export default KafkaClusterDetails;

const okIcon = <CheckCircleTwoTone twoToneColor='#52c41a' />;
const warnIcon = <WarningTwoTone twoToneColor='orange' />;
const errIcon = <ExclamationCircleTwoTone twoToneColor='orangered' />;
const mr05: CSSProperties = { marginRight: '.5em' };


export const ClusterStatisticsCard = observer((p: { clusterName: string }) => {
    const cluster = api.connectConnectors?.clusters?.first(x => x.clusterName == p.clusterName);

    const runningConnectors = cluster?.runningConnectors ?? '...';
    const totalConnectors = cluster?.totalConnectors ?? '...';

    const addr = cluster?.clusterAddress ?? '...';
    const version = cluster?.clusterInfo.version ?? '...';

    return <Card>
        <div style={{ display: 'flex', gap: '1em' }}>
            <Statistic title="Connectors" value={`${runningConnectors} / ${totalConnectors}`} />
            <Statistic title="Address" value={addr} />
            <Statistic title="Version" value={version} />

        </div>
    </Card>
});