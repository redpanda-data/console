import React, { ReactNode, Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox, Tooltip, Space, Descriptions } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { Broker, BrokerConfigEntry } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { observable, computed } from "mobx";
import { prettyBytesOrNA } from "../../../utils/utils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import Icon, { CrownOutlined } from '@ant-design/icons';
import { DefaultSkeleton, OptionGroup } from "../../../utils/tsxUtils";
import { DataValue } from "../topics/Tab.Config";


@observer
class BrokerList extends PageComponent {

    pageConfig = makePaginationConfig(100, true);

    @observable filteredBrokers: Broker[];
    @computed get hasRack() { return api.clusterInfo?.brokers?.sum(b => b.rack ? 1 : 0) }

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
        api.refreshClusterConfig(force);
    }

    render() {
        if (!api.clusterInfo) return DefaultSkeleton;
        if (api.clusterInfo.brokers.length == 0) return <Empty />

        const info = api.clusterInfo;
        const brokers = info.brokers;

        const renderIdColumn = (text: string, record: Broker) => {
            if (record.brokerId != info.controllerId) return text;
            return <>{text}
                <Tooltip mouseEnterDelay={0} overlay={'This broker is the current controller of the cluster'}>
                    <CrownOutlined style={{ padding: '2px', fontSize: '16px', color: '#0008', float: 'right' }} />
                </Tooltip>
            </>
        };

        const columns: ColumnProps<Broker>[] = [
            { width: '80px', title: 'ID', dataIndex: 'brokerId', render: renderIdColumn, sorter: sortField('brokerId'), defaultSortOrder: 'ascend' },
            { width: 'auto', title: 'Address', dataIndex: 'address', sorter: sortField('address') },
            { width: '120px', title: 'Size', dataIndex: 'logDirSize', render: (t: number) => prettyBytesOrNA(t), sorter: sortField('logDirSize') }
        ]

        if (this.hasRack)
            columns.push({ width: '100px', title: 'Rack', dataIndex: 'rack', sorter: sortField('rack') });

        return <>
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <Card>
                    <Row> {/* type="flex" */}
                        <Statistic title='ControllerID' value={info.controllerId} />
                        <Statistic title='Broker Count' value={brokers.length} />
                        <Statistic title='Kafka Version' value={info.kafkaVersion} />
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
                        columns={columns}
                        expandable={{
                            expandIconColumnIndex: 1,
                            expandedRowRender: record => <BrokerDetails brokerId={record.brokerId} />,
                            expandedRowClassName: r => 'noPadding',
                        }}
                    />
                </Card>
            </motion.div>
        </>
    }

    isMatch(filter: string, item: Broker) {
        if (item.address.includes(filter)) return true;
        if (item.rack.toLowerCase().includes(filter.toLowerCase())) return true;

        return false;
    }

    setResult(filteredData: Broker[]) {
        this.filteredBrokers = filteredData;
    }
}

export default BrokerList;

@observer
class BrokerDetails extends Component<{ brokerId: number }>{
    render() {
        if (!api.clusterConfig) return DefaultSkeleton;
        const id = this.props.brokerId;

        //
        // Normal Display
        const configEntries = api.clusterConfig.brokerConfigs.first(e => e.brokerId == id)?.configEntries;
        if (configEntries) return <BrokerConfigView entries={configEntries} />

        //
        // Error
        const error = api.clusterConfig.requestErrors.first(e => e.brokerId == id);
        if (error) return <>
            <div className='error'>
                <h3>Error</h3>
                <div>
                    <p>
                        The backend encountered an error reading the configuration for this broker.<br />
                    Click the blue reload button at the top of the page to try again.
                </p>
                </div>
                <div className='codeBox'>
                    {error?.errorMessage ?? '(no error message was set)'}
                </div>
            </div>
        </>

        //
        // Mising Entry??
        return <div className='error'>
            <h3>Error</h3>
            <div>
                <p>The backend did not return a response for this broker</p>
            </div>
        </div>
    }

}

@observer
class BrokerConfigView extends Component<{ entries: BrokerConfigEntry[] }> {
    render() {
        const entries = this.props.entries;
        return <div className='brokerConfigView'>
            <DetailsDisplaySettings />
            <Descriptions
                bordered
                size="small"
                colon={true}
                layout="horizontal"
                column={1}
                style={{ display: "inline-block" }}
            >
                {entries.filter(e => uiSettings.brokerList.propsFilter == 'onlyChanged' ? !e.isDefault : true)
                    .sort((a, b) => {
                        if (uiSettings.brokerList.propsOrder == 'default') return 0;
                        if (uiSettings.brokerList.propsOrder == 'alphabetical') return a.name.localeCompare(b.name);
                        const v1 = a.isDefault ? 1 : 0;
                        const v2 = b.isDefault ? 1 : 0;
                        return v1 - v2;
                    })
                    .map(e => (
                        <Descriptions.Item key={e.name} label={e.name}>
                            {DataValue(e.name, e.value, e.isDefault, uiSettings.brokerList.valueDisplay)}
                        </Descriptions.Item>
                    ))}
            </Descriptions>

        </div>
    }
}


const DetailsDisplaySettings = observer(() =>
    <div style={{ marginLeft: '1px', marginBottom: '1em' }} className='brokerConfigViewSettings'>
        <Row>
            <Space size='middle'>

                <OptionGroup label='Formatting'
                    options={{
                        "Friendly": 'friendly',
                        "Raw": 'raw'
                    }}
                    value={uiSettings.brokerList.valueDisplay}
                    onChange={s => uiSettings.brokerList.valueDisplay = s}
                />

                <OptionGroup label='Filter'
                    options={{
                        "Show All": 'all',
                        "Only Changed": 'onlyChanged'
                    }}
                    value={uiSettings.brokerList.propsFilter}
                    onChange={s => uiSettings.brokerList.propsFilter = s}
                />

                <OptionGroup label='Sort'
                    options={{
                        "Changed First": 'changedFirst',
                        "Alphabetical": 'alphabetical',
                        "None": 'default',
                    }}
                    value={uiSettings.brokerList.propsOrder}
                    onChange={s => uiSettings.brokerList.propsOrder = s}
                />
            </Space>
        </Row>
    </div>);