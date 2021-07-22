

import { Statistic } from 'antd';
import { observer } from 'mobx-react';
import React, { Component, CSSProperties } from 'react';

import DatagenLogo from '../../../assets/connectors/datagen.png';
import { api } from '../../../state/backendApi';
import Card from '../../misc/Card';

interface ConnectorMetadata {
    friendlyName: string;
    logo?: JSX.Element,
}
export const connectorMetadata: {
    [className: string]: ConnectorMetadata | undefined
} = {

    "io.confluent.kafka.connect.datagen.DatagenConnector": {
        friendlyName: 'DatagenConnector',
        logo: <img src={DatagenLogo} alt='datagen logo' className='connectorLogo' />,
    },

} as const;




export const StatisticsCard = observer(() => {
    const totalClusters = api.connectConnectors?.clusters.length ?? '...';
    const totalConnectors = api.connectConnectors?.clusters.sum(c => c.totalConnectors) ?? '...';

    return <Card>
        <div style={{ display: 'flex', gap: '1em' }}>
            <Statistic title="Connect Clusters" value={totalClusters} />
            <Statistic title="Total Connectors" value={totalConnectors} />
        </div>
    </Card>
});