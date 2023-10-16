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


import { Alert } from 'antd';
import { observer, useLocalObservable } from 'mobx-react';
import React, { CSSProperties, useRef, useState } from 'react';
import { api } from '../../../state/backendApi';
import { ApiError, ClusterConnectorInfo, ClusterConnectors, ClusterConnectorTaskInfo, ConnectorState, ConnectorStatus } from '../../../state/restInterfaces';
import { ZeroSizeWrapper } from '../../../utils/tsxUtils';
import ElasticLogo from '../../../assets/connectors/elastic.svg';
import MsSqlLogo from '../../../assets/connectors/mssql.png';
import MySqlLogo from '../../../assets/connectors/mysql.svg';
import MongoDBLogo from '../../../assets/connectors/mongodb.png';
import IcebergLogo from '../../../assets/connectors/iceberg.png';
import IbmMqLogo from '../../../assets/connectors/ibm-mq.svg';
import DebeziumLogo from '../../../assets/connectors/debezium.png';
import ConfluentLogo from '../../../assets/connectors/confluent.png';
import ApacheLogo from '../../../assets/connectors/apache.svg';
import HdfsLogo from '../../../assets/connectors/hdfs.png';
import JdbcLogo from '../../../assets/connectors/jdbc.png';
import AmazonS3 from '../../../assets/connectors/amazon-s3.png';
import PostgresqlLogo from '../../../assets/connectors/postgres.png';
import SalesforceLogo from '../../../assets/connectors/salesforce.png';
import ServicenowLogo from '../../../assets/connectors/servicenow.png';
import RedpandaLogo from '../../../assets/connectors/redpanda.svg';
import BigQueryLogo from '../../../assets/connectors/google-bigquery.svg';
import GoogleCloudStorageLogo from '../../../assets/connectors/google-cloud-storage.png';
import PubSubLogo from '../../../assets/connectors/google-pub-sub.svg';
import SnowflakeLogo from '../../../assets/connectors/snowflake.png';
import CassandraLogo from '../../../assets/connectors/cassandra.png';
import DB2Logo from '../../../assets/connectors/db2.png';
import TwitterLogo from '../../../assets/connectors/twitter.svg';
import Neo4jLogo from '../../../assets/connectors/neo4j.svg';
import { action, runInAction } from 'mobx';
import { CheckCircleTwoTone, ExclamationCircleTwoTone, HourglassTwoTone, PauseCircleOutlined, WarningTwoTone } from '@ant-design/icons';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { isEmbedded } from '../../../config';
import { AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, Box, Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Popover, useToast, VStack, Text, Empty } from '@redpanda-data/ui';
import { Statistic } from '../../misc/Statistic';

interface ConnectorMetadata {
    readonly className?: string;         // match by exact match
    readonly classNamePrefix?: string;   // match by prefix

    readonly logo?: JSX.Element,         // img element for the connector
    readonly friendlyName?: string;      // override display name (instead of just 'className without namespace')
    readonly description?: string;
    readonly learnMoreLink?: string;
    readonly author?: string;
}

const fallbackConnector: ConnectorMetadata = { logo: <img src={RedpandaLogo} alt="Redpanda logo" className="connectorLogo" /> };

// Order of entries matters:
// - first step is checking if there is any exact match for 'className'
// - second step is going through the list and taking the first entry where 'classNamePrefix' matches
const connectorMetadata: ConnectorMetadata[] = [
    // Apache Connectors
    {
        classNamePrefix: 'org.apache.kafka.connect.mirror.MirrorSourceConnector',
        logo: <img src={ApacheLogo} alt="Apache Software Foundation logo" className="connectorLogo" />,
        author: 'Apache Software Foundation',
        friendlyName: 'Kafka cluster topics',
        description: 'Imports messages from another Kafka cluster, using MirrorSourceConnector',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-mmaker-source-connector/',
    } as const,
    {
        classNamePrefix: 'org.apache.kafka.connect.mirror.MirrorCheckpointConnector',
        logo: <img src={ApacheLogo} alt="Apache Software Foundation logo" className="connectorLogo" />,
        author: 'Apache Software Foundation',
        friendlyName: 'Kafka cluster offsets',
        description: 'Imports consumer group offsets from another Kafka cluster, using MirrorCheckpointConnector',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-mmaker-checkpoint-connector/',
    } as const,
    {
        classNamePrefix: 'org.apache.kafka.connect.mirror.MirrorHeartbeatConnector',
        logo: <img src={ApacheLogo} alt="Apache Software Foundation logo" className="connectorLogo" />,
        author: 'Apache Software Foundation',
        friendlyName: 'Heartbeat',
        description: 'Generates heartbeat messages to local heartbeat topic',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-mmaker-heartbeat-connector/',
    } as const,
    // Confluent Connectors
    {
        classNamePrefix: 'io.confluent.connect.hdfs.',
        logo: <img src={HdfsLogo} alt="HDFS logo" className="connectorLogo" />,
        author: 'Confluent'
    } as const,
    {
        classNamePrefix: 'io.confluent.connect.s3.',
        logo: <img src={AmazonS3} alt="Amazon S3 logo" className="connectorLogo" />,
        author: 'Confluent'
    } as const,
    {
        classNamePrefix: 'io.confluent.connect.jms.',
        logo: <img src={JdbcLogo} alt="JMS logo" className="connectorLogo" />,
        author: 'Confluent'
    } as const,
    {
        classNamePrefix: 'io.confluent.connect.jdbc.',
        logo: <img src={JdbcLogo} alt="JDBC logo" className="connectorLogo" />,
        author: 'Confluent'
    } as const,
    {
        classNamePrefix: 'io.confluent.connect.salesforce.',
        logo: <img src={SalesforceLogo} alt="Salesforce logo" className="connectorLogo" />,
        author: 'Confluent'
    } as const,
    {
        classNamePrefix: 'io.confluent.connect.servicenow.',
        logo: <img src={ServicenowLogo} alt="Servicenow logo" className="connectorLogo" />,
        author: 'Confluent'
    } as const,
    {
        classNamePrefix: 'io.confluent.connect.elasticsearch.',
        logo: <img src={ElasticLogo} alt="Elastic logo" className="connectorLogo" />,
        author: 'Confluent'
    } as const,
    {
        classNamePrefix: 'io.confluent.connect.gcp.pubsub.',
        logo: <img src={PubSubLogo} alt="Google PubSub logo" className="connectorLogo" />,
        author: 'Confluent'
    } as const,
    {
        classNamePrefix: 'io.confluent.connect.cassandra.',
        logo: <img src={CassandraLogo} alt="Cassandra logo" className="connectorLogo" />,
        author: 'Confluent'
    } as const,

    // Debezium Connectors
    {
        classNamePrefix: 'io.debezium.connector.sqlserver.',
        logo: <img src={MsSqlLogo} alt="MSSQL logo" className="connectorLogo" />,
        author: 'Debezium'
    } as const,
    {
        classNamePrefix: 'io.debezium.connector.mysql.',
        logo: <img src={MySqlLogo} alt="MySQL logo" className="connectorLogo" />,
        author: 'Debezium',
        friendlyName: 'MySQL (Debezium)',
        description: 'Imports a stream of changes from MySQL, Amazon RDS and Amazon Aurora',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-mysql-source-connector/',
    } as const,
    {
        classNamePrefix: 'io.debezium.connector.mongodb.',
        logo: <img src={MongoDBLogo} alt="MongoDB logo" className="connectorLogo" />,
        author: 'Debezium'
    } as const,
    {
        classNamePrefix: 'io.debezium.connector.postgresql.',
        logo: <img src={PostgresqlLogo} alt="PostgreSQL logo" className="connectorLogo" />,
        author: 'Debezium',
        friendlyName: 'PostgreSQL (Debezium)',
        description: 'Imports a stream of changes from PostgreSQL',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-postgresql-connector/',
    } as const,
    {
        classNamePrefix: 'io.debezium.connector.cassandra.',
        logo: <img src={CassandraLogo} alt="Cassandra logo" className="connectorLogo" />,
        author: 'Debezium'
    } as const,
    {
        classNamePrefix: 'io.debezium.connector.db2.',
        logo: <img src={DB2Logo} alt="IBM DB2 logo" className="connectorLogo" />,
        author: 'Debezium'
    } as const,

    // Redpanda Connectors
    {
        classNamePrefix: 'com.redpanda.kafka.connect.s3.',
        logo: <img src={AmazonS3} alt="Amazon S3 logo" className="connectorLogo" />,
        author: 'Redpanda',
        friendlyName: 'S3',
        description: 'Exports messages to files in S3 buckets',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-s3-sink-connector/'
    } as const,
    {
        classNamePrefix: 'com.redpanda.kafka.connect.gcs.',
        logo: <img src={GoogleCloudStorageLogo} alt="Google Cloud Storage logo" className="connectorLogo" />,
        author: 'Redpanda',
        friendlyName: 'Google Cloud Storage',
        description: 'Exports messages to files in Google Cloud Storage',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-gcs-connector/'
    } as const,
    {
        classNamePrefix: 'com.redpanda.kafka.connect.jdbc.JdbcSourceConnector',
        logo: <img src={RedpandaLogo} alt="Redpanda logo" className="connectorLogo" />,
        author: 'Redpanda',
        friendlyName: 'JDBC',
        description: 'Imports batches of rows from MySQL, PostgreSQL, SQLite and SQL Server',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-jdbc-source-connector/'
    } as const,
    {
        classNamePrefix: 'com.redpanda.kafka.connect.jdbc.JdbcSinkConnector',
        logo: <img src={RedpandaLogo} alt="Redpanda logo" className="connectorLogo" />,
        author: 'Redpanda',
        friendlyName: 'JDBC',
        description: 'Exports messages to tables in MySQL, PostgreSQL, SQLite and SQL Server',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-jdbc-sink-connector/'
    } as const,

    // Stream Reactor / Lenses
    {
        classNamePrefix: 'com.datamountaineer.streamreactor.connect.cassandra.',
        logo: <img src={CassandraLogo} alt="Cassandra logo" className="connectorLogo" />,
        author: 'Lenses'
    } as const,

    // WePay Connectors
    {
        classNamePrefix: 'com.wepay.kafka.connect.bigquery.',
        logo: <img src={BigQueryLogo} alt="Google BigQuery logo" className="connectorLogo" />,
        author: 'WePay',
        friendlyName: 'Google BigQuery',
        description: 'Exports messages to Google BigQuery tables',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-gcp-bigquery-connector/'
    } as const,

    // Snowflake Connectors
    {
        classNamePrefix: 'com.snowflake.kafka.connector',
        logo: <img src={SnowflakeLogo} alt="Snowflake logo" className="connectorLogo" />,
        author: 'Snowflake',
        friendlyName: 'Snowflake',
        description: 'Exports messages to Snowflake tables',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-snowflake-connector/'
    } as const,

    // MongoDB Connectors
    {
        classNamePrefix: 'com.mongodb.kafka.connect.MongoSourceConnector',
        logo: <img src={MongoDBLogo} alt="MongoDB logo" className="connectorLogo" />,
        author: 'MongoDB',
        friendlyName: 'MongoDB',
        description: 'Imports collections from MongoDB',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-mongodb-source-connector/'
    } as const,
    {
        classNamePrefix: 'com.mongodb.kafka.connect.MongoSinkConnector',
        logo: <img src={MongoDBLogo} alt="MongoDB logo" className="connectorLogo" />,
        author: 'MongoDB',
        friendlyName: 'MongoDB',
        description: 'Exports messages to MongoDB collections',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-mongodb-sink-connector/'
    } as const,

    // Iceberg Connectors
    {
        classNamePrefix: 'io.tabular.iceberg.connect.IcebergSinkConnector',
        logo: <img src={IcebergLogo} alt="Iceberg logo" className="connectorLogo" />,
        author: 'Tabular',
        friendlyName: 'Iceberg',
        description: 'Exports messages to Iceberg tables',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-iceberg-sink-connector/'
    } as const,

    // JMS Connectors
    {
        classNamePrefix: 'io.macronova.kafka.connect.jms.JmsSinkConnector',
        logo: <img src={RedpandaLogo} alt="Redpanda Logo" className="connectorLogo" />,
        author: 'MacroNova',
        friendlyName: 'JMS',
        description: 'Exports messages to JMS queue',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-jms-sink-connector/'
    } as const,
    {
        classNamePrefix: 'io.macronova.kafka.connect.jms.JmsSourceConnector',
        logo: <img src={RedpandaLogo} alt="Redpanda Logo" className="connectorLogo" />,
        author: 'MacroNova',
        friendlyName: 'JMS',
        description: 'Imports messages from JMS queue',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-jms-source-connector/'
    } as const,


    // IBM MQ Connectors
    {
        classNamePrefix: 'com.ibm.eventstreams.connect.mqsink.MQSinkConnector',
        logo: <img src={IbmMqLogo} alt="IBM MQ Logo" className="connectorLogo" />,
        author: 'IBM Messaging',
        friendlyName: 'IBM MQ',
        description: 'Exports messages to IBM MQ queue',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-ibmmq-sink-connector/'
    } as const,
    {
        classNamePrefix: 'com.ibm.eventstreams.connect.mqsource.MQSourceConnector',
        logo: <img src={IbmMqLogo} alt="IBM MQ Logo" className="connectorLogo" />,
        author: 'IBM Messaging',
        friendlyName: 'IBM MQ',
        description: 'Imports messages from IBM MQ queue',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-ibmmq-source-connector/'
    } as const,

    // Community Connector
    {
        classNamePrefix: 'com.github.jcustenborder.kafka.connect.twitter',
        logo: <img src={TwitterLogo} alt="Twitter logo" className="connectorLogo" />,
        author: 'Jcustenborder'
    } as const,
    {
        classNamePrefix: 'streams.kafka.connect.sink.Neo4jSinkConnector',
        logo: <img src={Neo4jLogo} alt="Neo4j logo" className="connectorLogo" />,
        author: 'Neo4j Streams'
    } as const,
    {
        classNamePrefix: 'com.github.castorm.kafka.connect.http.HttpSourceConnector',
        logo: <img src={RedpandaLogo} alt="Redpanda Logo" className="connectorLogo" />,
        author: 'Cástor Rodríguez',
        friendlyName: 'HTTP',
        description: 'Imports data from HTTP services as batches or increments',
        learnMoreLink: 'https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/create-http-source-connector/'
    } as const,

    // Fallbacks with a very generous classname prefix (usually just the maintainers' logo)
    {
        classNamePrefix: 'io.debezium.',
        logo: <img src={DebeziumLogo} alt="Debezium logo" className="connectorLogo" />,
        author: 'Debezium',
    } as const,
    {
        classNamePrefix: 'io.confluent.',
        logo: <img src={ConfluentLogo} alt="Confluent logo" className="connectorLogo" />,
        author: 'Confluent',
    } as const,
    {
        classNamePrefix: 'com.redpanda.',
        logo: <img src={RedpandaLogo} alt="Redpanda logo" className="connectorLogo" />,
        author: 'Redpanda',
    } as const,
    {
        classNamePrefix: 'org.apache.kafka.',
        logo: <img src={ApacheLogo} alt="Apache Software Foundation logo" className="connectorLogo" />,
        author: 'Apache Software Foundation'
    } as const,
];

const connectorMetadataMatchCache: {
    [className: string]: ConnectorMetadata
} = {};

export function findConnectorMetadata(className: string): ConnectorMetadata | null {
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

    // use fallback icon
    if (!meta) {
        meta = fallbackConnector;
    }

    // store entry in cache
    connectorMetadataMatchCache[c] = meta;
    return meta;
}



export const ConnectorClass = observer((props: { observable: { class: string; } }) => {
    const c = props.observable.class;
    const meta = findConnectorMetadata(c);
    const displayName = meta?.friendlyName ?? removeNamespace(c);

    return (
        <div style={{ height: '1px', overflow: 'visible', display: 'flex', alignItems: 'center' }}>
            {meta && meta.logo && (
                <span style={{ verticalAlign: 'inherit', marginRight: '5px' }}>
                    <ZeroSizeWrapper width="22px" transform="translateY(-1px)">
                        <div style={{ width: '22px', height: '22px' }}>{meta.logo}</div>
                    </ZeroSizeWrapper>
                </span>
            )}

            <Popover placement="right" size="stretch" hideCloseButton={true} content={<div style={{ maxWidth: '500px', minWidth: 'max-content', whiteSpace: 'pre-wrap' }}>{c}</div>}>
                {displayName}
            </Popover>
        </div>
    );
});

export function removeNamespace(className: string): string {
    if (!className) return className;

    const lastDot = className.lastIndexOf('.');
    if (lastDot >= 0)
        return className.slice(lastDot + 1, undefined);

    return className;
}

export const OverviewStatisticsCard = observer(() => {
    const totalClusters = api.connectConnectors?.clusters?.length ?? '...';
    const totalConnectors = api.connectConnectors?.clusters?.sum(c => c.totalConnectors) ?? '...';

    return <Section py={4}>
        <div style={{ display: 'flex', gap: '1em' }}>
            <Statistic title="Connect Clusters" value={totalClusters} />
            <Statistic title="Total Connectors" value={totalConnectors} />
        </div>
    </Section>
});

export const ClusterStatisticsCard = observer((p: { clusterName: string }) => {

    if (isEmbedded())
        return null;

    const cluster = api.connectConnectors?.clusters?.first(x => x.clusterName == p.clusterName);

    const runningConnectors = cluster?.runningConnectors ?? '...';
    const totalConnectors = cluster?.totalConnectors ?? '...';

    const addr = cluster?.clusterAddress ?? '...';
    const version = cluster?.clusterInfo.version ?? '...';

    return <Section py={4}>
        <div style={{ display: 'flex', gap: '1em' }}>
            <Statistic title="Cluster" value={cluster?.clusterName} />

            <Statistic title="Connectors" value={`${runningConnectors} / ${totalConnectors}`} />
            <Statistic title="Address" value={addr} />
            <Statistic title="Version" value={version} />

        </div>
    </Section>
});

export const ConnectorStatisticsCard = observer((p: { clusterName: string, connectorName: string }) => {
    const cluster = api.connectConnectors?.clusters?.first(x => x.clusterName == p.clusterName);
    const connector = cluster?.connectors.first(x => x.name == p.connectorName);

    return <Section py={4}>
        <div style={{ display: 'flex', gap: '1em' }}>
            <Statistic title="Cluster" value={cluster?.clusterName} />
            <Statistic title="Connector" value={connector?.name} />

            <Statistic title="Tasks" value={`${connector?.runningTasks} / ${connector?.totalTasks}`} />
        </div>
    </Section>
});




export function NotConfigured() {
    return (
        <PageContent key="b">
            <Section>
                <VStack gap={4}>
                    <Empty description="Not Configured" />
                    <Text textAlign="center">
                        Kafka Connect is not configured in Redpanda Console.
                        <br />
                        Setup the connection details to your Kafka Connect cluster in your Redpanda Console config, to view and control all your connectors and tasks.
                    </Text>
                    <a target="_blank" rel="noopener noreferrer" href="https://docs.redpanda.com/docs/manage/console/">
                        <Button variant="solid">Redpanda Console Config Documentation</Button>
                    </a>
                </VStack>
            </Section>
        </PageContent>
    );
}

type ConfirmModalProps<T> = {
    target: () => T | null, // when set, dialog is shown
    clearTarget: () => void, // called when the dialog is done

    content: (target: T) => JSX.Element, // "are you sure you want to ..."
    successMessage: (target: T) => JSX.Element, // "x done successfully"

    onOk: (target: T) => Promise<void>,
}

export const ConfirmModal = observer(<T,>(props: ConfirmModalProps<T>) => {
    const $state = useLocalObservable<{isPending: boolean; error: string | Error | null}>(() => ({
        isPending: false,
        error: null
    }))
    const cancelRef = useRef<HTMLButtonElement | null>(null)

    const toast = useToast()

    const renderError: () => { title: string, content: string } | undefined = () => {
        if (!$state.error)
            return undefined;

        const txt = typeof $state.error == 'string'
            ? $state.error
            : $state.error.message;

        // try parsing as json
        let apiErr: ApiError | undefined;
        try {
            apiErr = JSON.parse(txt) as ApiError;
            if (!apiErr || !apiErr.message || !apiErr.statusCode)
                apiErr = undefined;
        } catch {
            apiErr = undefined;
        }

        // return text only
        if (!apiErr)
            return {
                title: 'Error',
                content: txt
            };

        // render error object
        return {
            title: `${apiErr.statusCode}`,
            content: apiErr.message
        };
    }

    const cancel = action(() => {
        runInAction(() => {
            $state.isPending = false;
            $state.error = null;
            props.clearTarget();
        })
    })

    const success = action((target: T) => {
        const messageContent = props.successMessage(target);
        toast({
            status: 'success',
            description: messageContent,
        });

        cancel();
    })

    const onOk = action(async () => {
        $state.isPending = true;
        const target = props.target()!;
        try {
            await props.onOk(target);
            success(target);
        } catch (err) {
            $state.error = err as any;
        } finally {
            $state.isPending = false;
        }
    })

    const target = props.target();
    const err = renderError();

    const content = target && props.content(target);

    return <AlertDialog
        isOpen={target != null}
        leastDestructiveRef={cancelRef}
        onClose={cancel}
    >
        <AlertDialogOverlay>
        <AlertDialogContent>
            <AlertDialogHeader>Confirm</AlertDialogHeader>
            <AlertDialogBody>
                {content}
                {err && <Box mt={4}><Alert
                    type="error"
                    message={err.title}
                    description={err.content}
                /></Box>}
            </AlertDialogBody>
            <AlertDialogFooter gap={2}>
                <Button onClick={cancel} ref={cancelRef} variant="outline">No</Button>
                <Button onClick={onOk} isLoading={$state.isPending}>{$state.error ? 'Retry' : 'Yes'}</Button>
            </AlertDialogFooter>
        </AlertDialogContent>
        </AlertDialogOverlay>
    </AlertDialog>
})

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

export const TaskState = observer((p: { observable: { state: ClusterConnectorTaskInfo['state'], trace?: string, taskId?: number } }) => {
    const [err, showErr] = useState(undefined as string | undefined);

    const task = p.observable;
    const state = task.state;

    const iconWrapper = (icon: JSX.Element) =>
        <span style={{ fontSize: '17px' }}>
            {icon}
        </span>

    let icon: JSX.Element = <></>;
    if (state == ConnectorState.Running) icon = iconWrapper(okIcon);
    if (state == ConnectorState.Failed) icon = iconWrapper(errIcon);
    if (state == ConnectorState.Paused) icon = iconWrapper(pauseIcon);
    if (state == ConnectorState.Unassigned) icon = iconWrapper(waitIcon);

    let stateContent = <span style={{ display: 'flex', alignItems: 'center', gap: '4px', height: 'auto' }} className="capitalize">
        {icon}
        {String(state).toLowerCase()}
    </span>;


    let errBtn: JSX.Element | undefined = undefined;
    let errModal: JSX.Element | undefined = undefined;
    if (task.trace) {
        errBtn = <Button colorScheme="red" variant="outline" onClick={() => showErr(task.trace)} style={{ padding: '0px 12px', display: 'inline-flex', alignItems: 'center', height: '30px', gap: '5px' }}>
            {stateContent}
            <span>(Show Error)</span>
        </Button>

        const close = () => showErr(undefined);
        errModal = (
            <Modal
                isOpen={err != null}
                onClose={close}
            >
                <ModalOverlay />
                <ModalContent minW="5xl">
                    <ModalHeader>
                        {
                            task.taskId == null
                                ? 'Error in Connector'
                                : `Error trace of task ${task.taskId}`
                        }
                    </ModalHeader>
                    <ModalBody>
                        <Box px={2} py={3} w="full" className="codeBox" style={{whiteSpace: 'pre', overflow: 'scroll'}}>{err}</Box>
                    </ModalBody>
                    <ModalFooter gap={2}>
                        <Button onClick={close}>Close</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        );

        stateContent = errBtn;
    }

    return <div>{stateContent}{errModal}</div>
});


export const okIcon = <CheckCircleTwoTone twoToneColor="#52c41a" />;
export const warnIcon = <WarningTwoTone twoToneColor="orange" />;
export const errIcon = <ExclamationCircleTwoTone twoToneColor="orangered" />;
const waitIcon = <HourglassTwoTone twoToneColor="#888" />;
const pauseIcon = <span style={{ color: '#555' }}><PauseCircleOutlined /></span>;

export const mr05: CSSProperties = { marginRight: '.5em' };
export const ml05: CSSProperties = { marginLeft: '.5em' };


// Mapping from health status to chakra color variables
export const statusColors = {
    'HEALTHY': 'green.500',
    'UNHEALTHY': 'red.500',
    'DEGRADED': 'orange.500',
    'PAUSED': 'gray.500',
    'RESTARTING': 'blue.500',
    'UNASSIGNED': 'gray.500',
    'DESTROYED': 'red.500',
    'UNKNOWN': 'gray.500',
} as Record<ConnectorStatus, string>;
