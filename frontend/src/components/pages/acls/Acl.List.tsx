import React, { ReactNode, Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox, Tooltip, Space, Descriptions } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { AclOperation, AclPermissionType, AclResource, AclResourcePatternTypeFilter, AclResourceType, Broker, BrokerConfigEntry } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { observable, computed } from "mobx";
import prettyBytes from "pretty-bytes";
import { prettyBytesOrNA } from "../../../utils/utils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import Icon, { CrownOutlined } from '@ant-design/icons';
import { DefaultSkeleton, OptionGroup } from "../../../utils/tsxUtils";
import { DataValue } from "../topics/Tab.Config";

// todo:
// - remove debug code
// - add filter controls
// - make each "resource" row expandable to show all the AclRules that apply

@observer
class AclList extends PageComponent {

    pageConfig = makePaginationConfig(100, true);

    @observable filteredBrokers: Broker[];

    initPage(p: PageInitHelper): void {
        p.title = 'ACLs';
        p.addBreadcrumb('ACLs', '/acls');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {

        // debug:
        api.ACLs.clear();

        api.refreshAcls({
            permissionType: AclPermissionType.AclPermissionAny,
            operation: AclOperation.AclOperationAny,
            resourcePatternTypeFilter: AclResourcePatternTypeFilter.AclPatternAny,
            resourceType: AclResourceType.AclResourceAny,
        }, force);
    }

    render() {
        if (!api.ACLs.size) return DefaultSkeleton;

        // debug:
        let temp: AclResource[];
        for (const x of api.ACLs) {
            temp = x[1];
            break;
        }
        const resources = temp!;
        const columns: ColumnProps<AclResource>[] = [
            { width: '80px', title: 'Type', dataIndex: 'resourceType', sorter: sortField('resourceType'), defaultSortOrder: 'ascend' },
            { width: 'auto', title: 'Name', dataIndex: 'resourceName', sorter: sortField('resourceName') },
            { width: '120px', title: 'Pattern', dataIndex: 'resourcePatternType', sorter: sortField('resourcePatternType') }
        ]

        return <>
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                {/* <Card>
                    <Row>
                        <Statistic title='ControllerID' value={info.controllerId} />
                        <Statistic title='Broker Count' value={brokers.length} />
                    </Row>
                </Card> */}

                <Card>
                    <Table
                        style={{ margin: '0', padding: '0' }} size={'middle'}
                        pagination={this.pageConfig}
                        onChange={x => { if (x.pageSize) { this.pageConfig.pageSize = uiSettings.brokerList.pageSize = x.pageSize } }}
                        dataSource={resources}
                        rowKey={x => x.resourceName + x.resourceType}
                        rowClassName={() => 'pureDisplayRow'}
                        columns={columns}
                    // expandable={{
                    //     expandIconColumnIndex: 1,
                    //     expandedRowRender: record => <BrokerDetails brokerId={record.brokerId} />,
                    //     expandedRowClassName: r => 'noPadding',
                    // }}
                    />
                </Card>
            </motion.div>
        </>
    }

}

export default AclList;

@observer
class BrokerDetails extends Component<{ brokerId: number }>{
    render() {
        if (!api.ClusterConfig) return DefaultSkeleton;
        const id = this.props.brokerId;

        //
        // Normal Display
        const configEntries = api.ClusterConfig.brokerConfigs.first(e => e.brokerId == id)?.configEntries;
        if (configEntries) return <BrokerConfigView entries={configEntries} />

        //
        // Error
        const error = api.ClusterConfig.requestErrors.first(e => e.brokerId == id);
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