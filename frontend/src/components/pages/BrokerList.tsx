import React, { ReactNode } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox, Tooltip } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "./Page";
import { api } from "../../state/backendApi";
import { uiSettings } from "../../state/ui";
import { makePaginationConfig } from "../misc/common";
import { Broker } from "../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../utils/animationProps";
import { observable } from "mobx";
import prettyBytes from "pretty-bytes";
import { prettyBytesOrNA } from "../../utils/utils";
import { appGlobal } from "../../state/appGlobal";
import Card from "../misc/Card";
import Icon, { CrownOutlined } from '@ant-design/icons';


@observer
class BrokerList extends PageComponent {

    pageConfig = makePaginationConfig(uiSettings.brokerList.pageSize);

    @observable filteredBrokers: Broker[];


    initPage(p: PageInitHelper): void {
        p.title = 'Brokers';
        p.addBreadcrumb('Brokers', '/brokers');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);

        this.isMatch = this.isMatch.bind(this);
        this.setResult = this.setResult.bind(this);
    }

    refreshData(force: boolean) {
        api.refreshCluster(force);
    }

    render() {
        if (!api.ClusterInfo) return this.skeleton;
        if (api.ClusterInfo.brokers.length == 0) return <Empty />

        const info = api.ClusterInfo;
        const brokers = info.brokers;
        let hasRack = brokers.any(b => b.rack ? true : false);

        const renderIdColumn = (text: string, record: Broker) => {
            if (record.brokerId != info.controllerId) return text;
            return <>{text}
                <Tooltip mouseEnterDelay={0} overlay={'This broker is the current controller of the cluster'}>
                    <CrownOutlined style={{ padding: '2px', fontSize: '16px', color: '#0008', float: 'right' }} />
                </Tooltip>
            </>
        };

        const columns: ColumnProps<Broker>[] = [
            { title: 'ID', dataIndex: 'brokerId', width: '100px', render: renderIdColumn },
            { title: 'Address', dataIndex: 'address' },
            { title: 'Size', dataIndex: 'logDirSize', render: (t: number) => prettyBytesOrNA(t), width: '140px' },
            !hasRack ? null : { title: 'Rack', dataIndex: 'rack', width: '100px' },
        ].filter(c => c != null).map(c => c!);

        return <>
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <Card>
                    <Row> {/* type="flex" */}
                        <Statistic title='ControllerID' value={info.controllerId} />
                        <Statistic title='Broker Count' value={brokers.length} />
                    </Row>
                </Card>

                <Card>
                    <Table
                        style={{ margin: '0', padding: '0' }} size={'middle'}
                        pagination={this.pageConfig}
                        onChange={x => { if (x.pageSize) { this.pageConfig.pageSize = uiSettings.brokerList.pageSize = x.pageSize } }}
                        dataSource={brokers}
                        rowKey={x => x.brokerId.toString()}
                        rowClassName={() => 'pureDisplayRow'}
                        columns={columns} />
                </Card>
            </motion.div>
        </>
    }

    isMatch(filter: string, item: Broker) {
        if (item.address.includes(filter)) return true;
        if (item.rack.includes(filter)) return true;

        return false;
    }

    setResult(filteredData: Broker[]) {
        this.filteredBrokers = filteredData;
    }


    skeleton = <>
        <motion.div {...animProps} key={'loader'} style={{ margin: '2rem' }}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}

export default BrokerList;