
import React from "react";
import { observer } from "mobx-react";
import { uiSettings } from "../../state/ui";
import Paragraph from "antd/lib/typography/Paragraph";
import { Button, Card } from "antd";
import { api } from "../../state/backendApi";
import { uiState } from "../../state/uiState";
import Icon from '@ant-design/icons';


const IndexPage = observer(() => {

    uiState.pageBreadcrumbs = [];
    uiState.pageTitle = 'Overview';

    return <>
        <div>
            <Paragraph>
                You have no Kafka clusters set up (or there's no selection)<br />
                todo: Setup instructions here.
			</Paragraph>
            <Paragraph>
                If you have already done the setup you will see all available clusters listed below.
			</Paragraph>

            <div style={{ display: 'flex', margin: '2em 0' }}>
                {api.clusters.map((c, i) => <ClusterCard key={c} cluster={c} />)}
            </div>
            <Button danger onClick={() => uiSettings.selectedClusterIndex = -1}>Debug: Reset cluster selection</Button>
        </div>
    </>
})

const ClusterCard = (p: { cluster: string }) => <>

    <Card
        style={{ width: 300, marginRight: '2em' }}
        onClick={() => uiSettings.selectedClusterIndex = api.clusters.indexOf(p.cluster)}
        hoverable={true}
        title={p.cluster}
        about='about'
        actions={[
            // <Icon type="setting" key="setting" />,
            // <Icon type="edit" key="edit" />,
            // <Icon type="ellipsis" key="ellipsis" />,
        ]}
    >
        Cluster has 12345 brokers, 12345 topics, ...
	</Card>

</>


export default IndexPage;