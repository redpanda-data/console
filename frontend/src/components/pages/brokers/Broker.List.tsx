import React, { Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Tooltip, Space } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { Broker, ConfigEntry } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { observable, computed, makeObservable } from "mobx";
import { prettyBytesOrNA } from "../../../utils/utils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import { CrownOutlined } from '@ant-design/icons';
import { DefaultSkeleton, findPopupContainer, OptionGroup } from "../../../utils/tsxUtils";
import { ConfigList } from "../../misc/ConfigList";
import { KowlTable } from "../../misc/KowlTable";



@observer
class BrokerList extends PageComponent {

    pageConfig = makePaginationConfig(100, true);

    @observable filteredBrokers: Broker[];
    @computed get hasRack() { return api.clusterInfo?.brokers?.sum(b => b.rack ? 1 : 0) }

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

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
        if (!api.clusterInfo) return DefaultSkeleton;
        if (api.clusterInfo.brokers.length == 0) return <Empty />

        const info = api.clusterInfo;
        const brokers = info.brokers;

        const renderIdColumn = (text: string, record: Broker) => {
            if (record.brokerId != info.controllerId) return text;
            return <>{text}
                <Tooltip mouseEnterDelay={0} overlay={'This broker is the current controller of the cluster'} getPopupContainer={findPopupContainer} placement='right'>
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
                    <KowlTable
                        dataSource={brokers}
                        columns={columns}

                        observableSettings={uiSettings.brokerList}

                        rowKey={x => x.brokerId.toString()}
                        rowClassName={() => 'pureDisplayRow'}
                        expandable={{
                            expandIconColumnIndex: 1,
                            expandedRowRender: record => <BrokerDetails brokerId={record.brokerId} />
                        }}
                    />
                </Card>
            </motion.div>
        </>
    }

    isMatch(filter: string, item: Broker) {
        if (item.address.includes(filter)) return true;

        if (item.rack)
            if (item.rack.toLowerCase().includes(filter.toLowerCase())) return true;

        return false;
    }

    setResult(filteredData: Broker[]) {
        this.filteredBrokers = filteredData;
    }
}

export default BrokerList;

const BrokerDetails = observer(({ brokerId }: { brokerId: number }): JSX.Element => {
    const id = brokerId;

    const brokerConfigs = api.brokerConfigs.get(id);
    if (brokerConfigs === undefined || brokerConfigs.length == 0) {
        api.refreshBrokerConfig(id);
        return DefaultSkeleton;
    }

    // Handle error while getting config
    if (typeof brokerConfigs == 'string') return (
        <div className="error">
            <h3>Error</h3>
            <div>
                <p>{brokerConfigs}</p>
            </div>
        </div>
    );

    // Normal Display
    return <BrokerConfigView entries={brokerConfigs} />;
});

@observer
class BrokerConfigView extends Component<{ entries: ConfigEntry[] }> {
    render() {
        const entries = this.props.entries
            .slice()
            .sort((a, b) => {
                switch (uiSettings.brokerList.propsOrder) {
                    case 'default':
                        return 0;
                    case 'alphabetical':
                        return a.name.localeCompare(b.name);
                    case 'changedFirst':
                        if (uiSettings.brokerList.propsOrder != 'changedFirst') return 0;
                        const v1 = a.isExplicitlySet ? 1 : 0;
                        const v2 = b.isExplicitlySet ? 1 : 0;
                        return v2 - v1;
                    default: return 0;
                }
            });

        return (
            <div className="brokerConfigView">
                <DetailsDisplaySettings />
                <ConfigList configEntries={entries} valueDisplay={uiSettings.brokerList.valueDisplay} />
            </div>
        );
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