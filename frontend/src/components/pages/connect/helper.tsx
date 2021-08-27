

import { Button, Empty, Popover, Statistic } from 'antd';
import { motion } from 'framer-motion';
import { observer } from 'mobx-react';
import React, { Component, CSSProperties } from 'react';

import DatagenLogo from '../../../assets/connectors/datagen.png';
import { api } from '../../../state/backendApi';
import { ClusterConnectorInfo } from '../../../state/restInterfaces';
import { animProps } from '../../../utils/animationProps';
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
    const totalClusters = api.connectConnectors?.clusters?.length ?? '...';
    const totalConnectors = api.connectConnectors?.clusters?.sum(c => c.totalConnectors) ?? '...';

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