import { observer } from "mobx-react";
import { PureComponent } from "react";

import React from "react";
import { PageComponent, PageInitHelper } from "./Page";
import { api } from "../../state/backendApi";
import { uiState, uiSettings } from "../../state/ui";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox } from "antd";
import { makePaginationConfig } from "../common";
import { ColumnProps } from "antd/lib/table";
import { Broker } from "../../models/ServiceModels";
import { motion } from "framer-motion";
import { animProps } from "../../utils/animationProps";

const statisticStyle: React.CSSProperties = { margin: 0, marginRight: '2em', padding: '.2em' };

@observer
class BrokerList extends PageComponent {

    initPage(p: PageInitHelper): void {
        p.title = 'Brokers';
        p.addBreadcrumb('Brokers', '/brokers');
        p.extraContent = () => <>
            <Checkbox
                checked={uiSettings.brokers.hideEmptyColumns}
                onChange={e => uiSettings.brokers.hideEmptyColumns = e.target.checked}
            >Hide empty columns</Checkbox>
        </>;

        api.refreshCluster();
    }

    render() {
        if (!api.ClusterInfo) return this.skeleton;
        if (api.ClusterInfo.brokers.length == 0) return <Empty />

        const info = api.ClusterInfo;
        const brokers = info.brokers;
        let hasRack = brokers.any(b => b.rack ? true : false);

        const pageConfig = makePaginationConfig();
        pageConfig.total = brokers.length;


        const columns: ColumnProps<Broker>[] = [
            { title: 'ID', dataIndex: 'brokerId' },
            { title: 'Address', dataIndex: 'address' },
            (uiSettings.brokers.hideEmptyColumns && !hasRack) ? null : { title: 'Rack', dataIndex: 'rack', width: 1 },
        ].filter(c => c != null).map(c => c!);

        return <>
            <motion.div {...animProps}>
                <Row type="flex" style={{ marginBottom: '1em' }}>
                    <Statistic title='ControllerID' value={info.controllerId} style={statisticStyle} />
                    <Statistic title='Broker Count' value={brokers.length} style={statisticStyle} />
                </Row>

                <Table
                    style={{ margin: '0', padding: '0' }} bordered={true} size={'middle'}
                    pagination={pageConfig}
                    dataSource={brokers}
                    rowKey={x => x.brokerId.toString()}
                    rowClassName={() => 'pureDisplayRow'}
                    columns={columns} />
            </motion.div>
        </>
    }


    skeleton = <>
        <motion.div {...animProps} key={'loader'}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}

export default BrokerList;