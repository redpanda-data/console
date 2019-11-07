import React, { ReactNode } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox } from "antd";
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

const statisticStyle: React.CSSProperties = { margin: 0, marginRight: '2em', padding: '.2em' };

@observer
class BrokerList extends PageComponent {

    pageConfig = makePaginationConfig(uiSettings.brokerList.pageSize);

    @observable filteredBrokers: Broker[];


    initPage(p: PageInitHelper): void {
        p.title = 'Brokers';
        p.addBreadcrumb('Brokers', '/brokers');
        p.extraContent = () => <>
            <Checkbox
                checked={uiSettings.brokerList.hideEmptyColumns}
                onChange={e => uiSettings.brokerList.hideEmptyColumns = e.target.checked}
            >Hide empty columns</Checkbox>
        </>;

        api.refreshCluster();

        this.isMatch = this.isMatch.bind(this);
        this.setResult = this.setResult.bind(this);
    }

    render() {
        if (!api.ClusterInfo) return this.skeleton;
        if (api.ClusterInfo.brokers.length == 0) return <Empty />

        const info = api.ClusterInfo;
        const brokers = info.brokers;
        let hasRack = brokers.any(b => b.rack ? true : false);

        const columns: ColumnProps<Broker>[] = [
            { title: 'ID', dataIndex: 'brokerId', width: '100px' },
            { title: 'Address', dataIndex: 'address' },
            { title: 'Size', dataIndex: 'logDirSize', render: (t: number) => prettyBytes(t), width: '140px' },
            (uiSettings.brokerList.hideEmptyColumns && !hasRack) ? null : { title: 'Rack', dataIndex: 'rack', width: '100px' },
        ].filter(c => c != null).map(c => c!);

        return <>
            <motion.div {...animProps}>
                <Row type="flex" style={{ marginBottom: '1em' }}>
                    <Statistic title='ControllerID' value={info.controllerId} style={statisticStyle} />
                    <Statistic title='Broker Count' value={brokers.length} style={statisticStyle} />
                </Row>

                {/* <Row align='middle' style={{ marginBottom: '1em', display: 'flex', alignItems: 'center' }} >
                    <QuickSearch2 data={brokers} isMatch={this.isMatch} setResult={this.setResult} />
                </Row> */}

                <Table
                    style={{ margin: '0', padding: '0' }} bordered={true} size={'middle'}
                    pagination={this.pageConfig}
                    onChange={x => { if (x.pageSize) { uiSettings.brokerList.pageSize = x.pageSize } }}
                    dataSource={brokers}
                    rowKey={x => x.brokerId.toString()}
                    rowClassName={() => 'pureDisplayRow'}
                    columns={columns} />
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
        <motion.div {...animProps} key={'loader'}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}

export default BrokerList;