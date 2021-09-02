

import { Button, Empty, Popover, Statistic } from 'antd';
import { m, motion } from 'framer-motion';
import { observer } from 'mobx-react';
import React, { Component, CSSProperties } from 'react';

import { api } from '../../../state/backendApi';
import { ClusterConnectorInfo } from '../../../state/restInterfaces';
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

interface ConnectorMetadata {
    readonly className?: string;         // match by exact match
    readonly classNamePrefix?: string;   // match by prefix

    readonly logo?: JSX.Element,         // img element for the connector
    readonly friendlyName?: string;      // override display name (instead of just 'className without namespace')
}
export const connectorMetadata: ConnectorMetadata[] = [
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


export const ConnectorClass = React.memo((props: { connector: ClusterConnectorInfo }) => {
    const c = props.connector;
    let meta: ConnectorMetadata | null = null;

    for (const m of connectorMetadata) {
        if ((m.className && m.className == c.class) ||
            (m.classNamePrefix && c.class.startsWith(m.classNamePrefix))) {
            meta = m;
            break;
        }
    }

    const displayName = meta?.friendlyName ?? removeNamespace(c.class);

    let content: JSX.Element;
    if (!meta) {
        // No additional information available
        // Default: simple display
        content = <span>{displayName}</span>
    }
    else {
        // We found custom metadata
        // Show connector logo
        content = <span style={{ display: 'inline-flex', gap: '.5em', alignItems: 'center' }}>
            {meta.logo &&
                <LayoutBypass height='0px' width='26px'>
                    {/* <span style={{ display: 'inline-block', maxHeight: '0px' }}> */}
                    {meta.logo}
                    {/* </span> */}
                </LayoutBypass>
            }
            {displayName}
        </span>
    }

    return <span>
        <Popover placement='right' overlayClassName='popoverSmall'
            getPopupContainer={findPopupContainer}
            content={<div style={{ maxWidth: '500px', whiteSpace: 'pre-wrap' }}>
                {c.class}
            </div>}
        >
            {content}
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

export const StatisticsCard = observer(() => {
    const totalClusters = api.connectConnectors?.clusters?.length ?? '...';
    const totalConnectors = api.connectConnectors?.clusters?.sum(c => c.totalConnectors) ?? '...';

    return <Card>
        <div style={{ display: 'flex', gap: '1em' }}>
            <Statistic title="Connect Clusters" value={totalClusters} />
            <Statistic title="Total Connectors" value={totalConnectors} />
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