

import { Button, Empty, Popover, Statistic } from 'antd';
import { m, motion } from 'framer-motion';
import { observer } from 'mobx-react';
import React, { Component, CSSProperties } from 'react';

import { api } from '../../../state/backendApi';
import { ClusterConnectorInfo } from '../../../state/restInterfaces';
import { animProps } from '../../../utils/animationProps';
import { findPopupContainer, LayoutBypass } from '../../../utils/tsxUtils';
import Card from '../../misc/Card';

import DatagenLogo from '../../../assets/connectors/datagen.png';
import MsSqlLogo from '../../../assets/connectors/mssql.png';
import MongoDBLogo from '../../../assets/connectors/mongodb.png';
import DebeziumLogo from '../../../assets/connectors/debezium.png';

interface ConnectorMetadata {
    readonly className?: string;         // match by exact match
    readonly classNamePrefix?: string;   // match by prefix

    readonly logo?: JSX.Element,         // img element for the connector
    readonly friendlyName?: string;      // override display name (instead of just 'className without namespace')
}
export const connectorMetadata: ConnectorMetadata[] = [
    {
        className: "io.confluent.kafka.connect.datagen.DatagenConnector",
        logo: <img src={DatagenLogo} alt='datagen logo' className='connectorLogo' />
    } as const,
    {
        className: "io.debezium.connector.sqlserver.SqlServerConnector",
        logo: <img src={MsSqlLogo} alt='mssql logo' className='connectorLogo' />
    } as const,
    {
        className: "io.debezium.connector.sqlserver.MongoDBConnector",
        logo: <img src={MongoDBLogo} alt='mongo db logo' className='connectorLogo' />
    } as const,
    {
        classNamePrefix: "io.debezium.",
        logo: <img src={DebeziumLogo} alt='debezium logo' className='connectorLogo' />
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