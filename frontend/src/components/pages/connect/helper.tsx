

import { Alert, Button, Empty, message, Modal, Popover, Statistic } from 'antd';
import { motion } from 'framer-motion';
import { observer } from 'mobx-react';
import React, { Component, CSSProperties } from 'react';

import { api } from '../../../state/backendApi';
import { ClusterConnectorInfo, ClusterConnectors, ClusterConnectorTaskInfo, ConnectorState } from '../../../state/restInterfaces';
import { animProps } from '../../../utils/animationProps';
import { findPopupContainer, LayoutBypass } from '../../../utils/tsxUtils';
import Card from '../../misc/Card';

import ElasticLogo from '../../../assets/connectors/elastic.png';
import MsSqlLogo from '../../../assets/connectors/mssql.png';
import MongoDBLogo from '../../../assets/connectors/mongodb.png';
import DebeziumLogo from '../../../assets/connectors/debezium.png';
import ConfluentLogo from '../../../assets/connectors/confluent.png';
import HdfsLogo from '../../../assets/connectors/hdfs.png';
import JdbcLogo from '../../../assets/connectors/jdbc.png';
import AmazonS3 from '../../../assets/connectors/amazon-s3.png';
import PostgresqlLogo from '../../../assets/connectors/postgres.png';
import SalesforceLogo from '../../../assets/connectors/salesforce.png';
import ServicenowLogo from '../../../assets/connectors/servicenow.png';
import BigQueryLogo from '../../../assets/connectors/google-bigquery.svg';
import PubSubLogo from '../../../assets/connectors/google-pub-sub.svg';
import SnowflakeLogo from '../../../assets/connectors/snowflake.png';
import CassandraLogo from '../../../assets/connectors/cassandra.png';
import DB2Logo from '../../../assets/connectors/db2.png';
import { action, makeObservable, observable, runInAction } from 'mobx';
import { CheckCircleTwoTone, ExclamationCircleTwoTone, HourglassTwoTone, PauseCircleFilled, PauseCircleOutlined, WarningTwoTone } from '@ant-design/icons';

interface ConnectorMetadata {
    readonly className?: string;         // match by exact match
    readonly classNamePrefix?: string;   // match by prefix

    readonly logo?: JSX.Element,         // img element for the connector
    readonly friendlyName?: string;      // override display name (instead of just 'className without namespace')
}

// Order of entries matters:
// - first step is checking if there is any exact match for 'className'
// - second step is going through the list and taking the first entry where 'classNamePrefix' matches
const connectorMetadata: ConnectorMetadata[] = [
    // Confluent Connectors
    {
        classNamePrefix: "io.confluent.connect.hdfs.",
        logo: <img src={HdfsLogo} alt='HDFS logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.confluent.connect.s3.",
        logo: <img src={AmazonS3} alt='Amazon S3 logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.confluent.connect.jms.",
        logo: <img src={JdbcLogo} alt='JMS logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.confluent.connect.jdbc.",
        logo: <img src={JdbcLogo} alt='JDBC logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.confluent.connect.salesforce.",
        logo: <img src={SalesforceLogo} alt='Salesforce logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.confluent.connect.servicenow.",
        logo: <img src={ServicenowLogo} alt='Servicenow logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.confluent.connect.elasticsearch.",
        logo: <img src={ElasticLogo} alt='Elastic logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.confluent.connect.gcp.pubsub.",
        logo: <img src={PubSubLogo} alt='Google PubSub logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.confluent.connect.cassandra.",
        logo: <img src={CassandraLogo} alt='Cassandra logo' className='connectorLogo' />
    } as const,

    // Debezium Connectors
    {
        classNamePrefix: "io.debezium.connector.sqlserver.",
        logo: <img src={MsSqlLogo} alt='MSSQL logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.debezium.connector.mongodb.",
        logo: <img src={MongoDBLogo} alt='MongoDB logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.debezium.connector.postgresql.",
        logo: <img src={PostgresqlLogo} alt='PostgreSQL logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.debezium.connector.cassandra.",
        logo: <img src={CassandraLogo} alt='Cassandra logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.debezium.connector.db2.",
        logo: <img src={DB2Logo} alt='IBM DB2 logo' className='connectorLogo' />
    } as const,

    // Stream Reactor / Lenses
    {
        classNamePrefix: "com.datamountaineer.streamreactor.connect.cassandra.",
        logo: <img src={CassandraLogo} alt='Cassandra logo' className='connectorLogo' />
    } as const,

    // WePay Connectors
    {
        classNamePrefix: "com.wepay.kafka.connect.bigqueryl.",
        logo: <img src={BigQueryLogo} alt='Google BigQuery logo' className='connectorLogo' />
    } as const,

    // Snowflake Connectors
    {
        classNamePrefix: "com.snowflake.kafka.connector",
        logo: <img src={SnowflakeLogo} alt='Snowflake logo' className='connectorLogo' />
    } as const,

    // Fallbacks with a very generous classname prefix (usually just the maintainers' logo)
    {
        classNamePrefix: "io.debezium.",
        logo: <img src={DebeziumLogo} alt='Debezium logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.confluent.",
        logo: <img src={ConfluentLogo} alt='Confluent logo' className='connectorLogo' />
    } as const,
];

const connectorMetadataMatchCache: {
    [className: string]: ConnectorMetadata
} = {};

function findConnectorMetadata(className: string): ConnectorMetadata | null {
    const c = className;

    // Quick and dirty cache
    // If cache has too many entries, remove some
    const cacheKeys = Object.keys(connectorMetadataMatchCache);
    if (cacheKeys.length > 200)
        for (const k of cacheKeys.slice(0, 5))
            delete connectorMetadataMatchCache[k];

    // try find in cache
    let meta = connectorMetadataMatchCache[c];
    if (meta) return meta;

    // look for exact match
    for (const e of connectorMetadata)
        if (e.className)
            if (e.className == c) {
                meta = e;
                break;
            }

    // look for prefix match
    if (!meta)
        for (const e of connectorMetadata)
            if (e.classNamePrefix)
                if (c.startsWith(e.classNamePrefix)) {
                    meta = e;
                    break;
                }

    // store entry in cache (if we found one)
    if (meta) {
        connectorMetadataMatchCache[c] = meta;
        return meta;
    }

    return null;
}



export const ConnectorClass = observer((props: { observable: { class: string; } }) => {
    const c = props.observable.class;
    const meta = findConnectorMetadata(c);
    const displayName = meta?.friendlyName ?? removeNamespace(c);

    return <span>
        {meta && meta.logo &&
            <span style={{ verticalAlign: 'inherit', marginRight: '5px' }}>
                <LayoutBypass height='0px' width='27px' >
                    {meta.logo}
                </LayoutBypass>
            </span>}
        <Popover placement='right' overlayClassName='popoverSmall'
            getPopupContainer={findPopupContainer}
            content={<div style={{ maxWidth: '500px', whiteSpace: 'pre-wrap' }}>
                {c}
            </div>}
        >
            {displayName}
        </Popover>
    </span>
});

export function removeNamespace(className: string): string {
    if (!className) return className;

    const lastDot = className.lastIndexOf('.');
    if (lastDot >= 0)
        return className.substr(lastDot + 1, undefined);

    return className;
}

export const OverviewStatisticsCard = observer(() => {
    const totalClusters = api.connectConnectors?.clusters?.length ?? '...';
    const totalConnectors = api.connectConnectors?.clusters?.sum(c => c.totalConnectors) ?? '...';

    return <Card>
        <div style={{ display: 'flex', gap: '1em' }}>
            <Statistic title="Connect Clusters" value={totalClusters} />
            <Statistic title="Total Connectors" value={totalConnectors} />
        </div>
    </Card>
});

export const ClusterStatisticsCard = observer((p: { clusterName: string }) => {
    const cluster = api.connectConnectors?.clusters?.first(x => x.clusterName == p.clusterName);

    const runningConnectors = cluster?.runningConnectors ?? '...';
    const totalConnectors = cluster?.totalConnectors ?? '...';

    const addr = cluster?.clusterAddress ?? '...';
    const version = cluster?.clusterInfo.version ?? '...';

    return <Card>
        <div style={{ display: 'flex', gap: '1em' }}>
            <Statistic title="Cluster" value={cluster?.clusterName} />

            <Statistic title="Connectors" value={`${runningConnectors} / ${totalConnectors}`} />
            <Statistic title="Address" value={addr} />
            <Statistic title="Version" value={version} />

        </div>
    </Card>
});

export const ConnectorStatisticsCard = observer((p: { clusterName: string, connectorName: string }) => {
    const cluster = api.connectConnectors?.clusters?.first(x => x.clusterName == p.clusterName);
    const connector = cluster?.connectors.first(x => x.name == p.connectorName);

    return <Card>
        <div style={{ display: 'flex', gap: '1em' }}>
            <Statistic title="Cluster" value={cluster?.clusterName} />
            <Statistic title="Connector" value={connector?.name} />

            <Statistic title="Tasks" value={`${connector?.runningTasks} / ${connector?.totalTasks}`} />
        </div>
    </Card>
});




export function NotConfigured() {
    return (
        <motion.div {...animProps} key={'b'} style={{ margin: '0 1rem' }}>
            <Card style={{ padding: '2rem 2rem', paddingBottom: '3rem' }}>
                <Empty description={null}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h2>Not Configured</h2>

                        <p>
                            Kafka Connect is not configured in Kowl.
                            <br />
                            Setup the connection details to your Kafka Connect cluster in your Kowl config, to view and control all your connectors and tasks.
                        </p>
                    </div>

                    <a target="_blank" rel="noopener noreferrer" href="https://github.com/cloudhut/kowl/blob/master/docs/config/kowl.yaml">
                        <Button type="primary">Kowl Config Documentation</Button>
                    </a>
                </Empty>
            </Card>
        </motion.div>
    );
}

@observer
export class ConfirmModal<T> extends Component<{
    target: () => T | null, // when set, dialog is shown
    clearTarget: () => void, // called when the dialog is done

    content: (target: T) => JSX.Element, // "are you sure you want to ..."
    successMessage: (target: T) => JSX.Element, // "x done successfully"

    onOk: (target: T) => Promise<void>,
}> {
    @observable isPending = false;
    @observable error: string | Error | null = null;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    @action.bound async onOk() {
        this.isPending = true;
        const target = this.props.target()!;
        try {
            await this.props.onOk(target);
            this.success(target);
        } catch (err) {
            this.error = err as any;
        } finally {
            this.isPending = false;
        }
    }

    @action.bound success(target: T) {
        const messageContent = this.props.successMessage(target);
        message.success({ content: messageContent });

        this.cancel();
    }

    @action.bound cancel() {
        runInAction(() => {
            this.isPending = false;
            this.error = null;
            this.props.clearTarget();
        })

    }

    render() {
        const target = this.props.target();
        const error = this.error;
        const content = target && this.props.content(target);

        return <Modal
            className="confirmModal"
            visible={target != null}
            centered closable={false} maskClosable={!this.isPending} keyboard={!this.isPending}
            okText={this.error ? 'Retry' : 'Yes'}
            confirmLoading={this.isPending}
            okType="danger"
            cancelText="No"
            cancelButtonProps={{ disabled: this.isPending }}
            onCancel={this.cancel}
            onOk={this.onOk}
        >
            <>
                {error && <Alert type="error"
                    message={`Error`}
                    description={typeof error == 'string' ? error : error.message} />
                }
                <p>
                    {content}
                </p>
            </>
        </Modal>
    }
}

// Takes an observable object that is either a single connector (runningTasks and totalTasks properties)
// or an array of connectors (in which case it will show the sum)

export const TasksColumn = observer((props: { observable: ClusterConnectors | ClusterConnectorInfo }) => {
    const obs = props.observable;

    let running = 0;
    let total = 0;

    if ('error' in obs && obs.error != null)
        return null;

    if ('clusterName' in obs) {
        // ClusterConnectors
        if (obs.error) return null;
        running = obs.connectors.sum(x => x.runningTasks);
        total = obs.connectors.sum(x => x.totalTasks);
    } else if ('name' in obs) {
        // ClusterConnectorInfo
        running = obs.runningTasks;
        total = obs.totalTasks;
    }

    return <>
        {running < total ? <span style={mr05}>{warnIcon}</span> : null}
        <span>{running} / {total}</span>
    </>
});

type ConnectorInfo = { runningConnectors: number, totalConnectors: number, error?: string };
export const ConnectorsColumn = observer((props: { observable: ConnectorInfo | ConnectorInfo[] }) => {

    let running = 0;
    let total = 0;
    let error: string | undefined = undefined;
    if ('runningConnectors' in props.observable) {
        running = props.observable.runningConnectors;
        total = props.observable.totalConnectors;
        error = props.observable.error;
    } else {
        if (props.observable.length == 0)
            return null;
        error = props.observable[0].error;
        running = props.observable.sum(x => x.runningConnectors);
        total = props.observable.sum(x => x.totalConnectors);
    }

    if (error)
        return null;

    return <>
        {running < total ? <span style={mr05}>{warnIcon}</span> : null}
        <span>{running} / {total}</span>
    </>
});

export const TaskState = observer((p: { state: ClusterConnectorTaskInfo['state'] }) => {
    const state = p.state;
    const iconWrapper = (icon: JSX.Element) => <span style={{ display: 'inline-flex', fontSize: '17px', verticalAlign: 'middle' }}>
        <LayoutBypass width='17px'>
            {icon}
        </LayoutBypass>
    </span>

    let icon: JSX.Element = <></>;
    if (state == ConnectorState.Running) icon = iconWrapper(okIcon);
    if (state == ConnectorState.Failed) icon = iconWrapper(errIcon);
    if (state == ConnectorState.Paused) icon = iconWrapper(pauseIcon);
    if (state == ConnectorState.Unassigned) icon = iconWrapper(waitIcon);

    return <span style={{ display: 'flex', alignItems: 'center', gap: '4px', height: 'auto' }} className='capitalize'>
        {icon}
        {String(state).toLowerCase()}
    </span>
});


const okIcon = <CheckCircleTwoTone />;
const warnIcon = <WarningTwoTone twoToneColor='orange' />;
export const errIcon = <ExclamationCircleTwoTone twoToneColor='orangered' />;
const waitIcon = <HourglassTwoTone twoToneColor='#888' />;
const pauseIcon = <span style={{ color: '#555' }}><PauseCircleOutlined /></span>;

export const mr05: CSSProperties = { marginRight: '.5em' };
const ml05: CSSProperties = { marginLeft: '.5em' };
