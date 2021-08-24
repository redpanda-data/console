

import { Popover, Statistic } from 'antd';
import { observer } from 'mobx-react';
import React, { Component, CSSProperties } from 'react';

import DatagenLogo from '../../../assets/connectors/datagen.png';
import { api } from '../../../state/backendApi';
import { ClusterConnectorInfo } from '../../../state/restInterfaces';
import { findPopupContainer, LayoutBypass } from '../../../utils/tsxUtils';
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





export const ConnectorClass = React.memo((props: { connector: ClusterConnectorInfo }) => {
    const c = props.connector;
    const meta = connectorMetadata[c.class];
    if (!meta)
        return <span>{c.class}</span>;

    return <span>
        <Popover placement='rightTop' overlayClassName='popoverSmall'
            getPopupContainer={findPopupContainer}
            content={<div style={{ maxWidth: '500px', whiteSpace: 'pre-wrap' }}>
                {c.class}
            </div>}
        >
            <span style={{ display: 'inline-flex', gap: '.5em', alignItems: 'center' }}>
                {meta.logo &&
                    <LayoutBypass height='0px' width='26px'>
                        {/* <span style={{ display: 'inline-block', maxHeight: '0px' }}> */}
                        {meta.logo}
                        {/* </span> */}
                    </LayoutBypass>
                }
                {meta.friendlyName}
            </span>

        </Popover>
    </span>
})