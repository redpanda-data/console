import React, { ReactNode, Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox, Tooltip, Space, Descriptions, Select, Input } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "../Page";
import { aclRequestToQuery, api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { AclOperation, AclPermissionType, AclRequestDefault, AclResource, AclResourcePatternTypeFilter, AclResourceType, Broker, BrokerConfigEntry } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { observable, computed, autorun, IReactionDisposer } from "mobx";
import prettyBytes from "pretty-bytes";
import { clone, prettyBytesOrNA } from "../../../utils/utils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import Icon, { CrownOutlined } from '@ant-design/icons';
import { DefaultSkeleton, Label, ObjToKv, OptionGroup } from "../../../utils/tsxUtils";
import { DataValue } from "../topics/Tab.Config";
import { uiState } from "../../../state/uiState";
import { ElementOf } from "antd/lib/_util/type";

const InputGroup = Input.Group;

// todo:
// - remove debug code
// - add filter controls
// - make each "resource" row expandable to show all the AclRules that apply

@observer
class AclList extends PageComponent {

    pageConfig = makePaginationConfig(100, true);

    @observable filteredBrokers: Broker[];

    availableResourceTypes: { value: string, label: string }[] = [];
    @observable resourceTypeFilter: string = "";

    initPage(p: PageInitHelper): void {
        p.title = 'ACLs';
        p.addBreadcrumb('ACLs', '/acls');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshAcls(AclRequestDefault, force);
    }

    render() {
        if (!api.ACLs) return DefaultSkeleton;

        // issue: we can't easily filter by 'resourceType' (because it is a string, and we have to use an enum for requests...)
        // so we have to cheat by building our own list of what types are available
        this.availableResourceTypes = api.ACLs.map(res => res.resourceType).distinct().map(str => ({ value: str, label: capitalize(str.toLowerCase()) }));
        this.availableResourceTypes.unshift({ label: 'Any', value: '' });
        const resources = api.ACLs
            .filter(res => (this.resourceTypeFilter == "") || (this.resourceTypeFilter == res.resourceType))
            .map(res => res.acls.map(rule => ({ ...res, ...rule })))
            .flat();

        const columns: ColumnProps<ElementOf<typeof resources>>[] = [
            { width: '120px', title: 'Resource', dataIndex: 'resourceType', sorter: sortField('resourceType'), defaultSortOrder: 'ascend' },
            { width: '120px', title: 'Permission', dataIndex: 'permissionType', sorter: sortField('permissionType') },
            { width: 'auto', title: 'Principal', dataIndex: 'principal', sorter: sortField('principal') },
            { width: '160px', title: 'Operation', dataIndex: 'operation', sorter: sortField('operation') },
            { width: 'auto', title: 'Pattern', dataIndex: 'resourcePatternType', sorter: sortField('resourcePatternType') },
            { width: 'auto', title: 'Name', dataIndex: 'resourceName', sorter: sortField('resourceName') },
            { width: '120px', title: 'Host', dataIndex: 'host', sorter: sortField('host') },
        ];

        return <>
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                {/* <Card>
                    <Row>
                        <Statistic title='ControllerID' value={info.controllerId} />
                        <Statistic title='Broker Count' value={brokers.length} />
                    </Row>
                </Card> */}

                <Card>
                    <this.SearchControls />

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

    SearchControls = observer(() => {
        const state = uiState.aclSearchParams!;

        return (
            <div style={{ margin: '0 1px', marginBottom: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>

                <Label text='Resource Type'>
                    <Select
                        options={this.availableResourceTypes}
                        value={this.resourceTypeFilter}
                        onChange={(val, op) => {
                            this.resourceTypeFilter = val;
                        }}
                        style={{ width: '11em' }}
                        size='middle' />
                </Label>

                {/*
                <Label text='Resource Type'>
                    <Select<AclResourceType> value={state.resourceType} onChange={x => state.resourceType = x} style={{ width: '11em' }} size='middle'>
                        {OptionValues.Types.map(v => <Select.Option key={v.value} value={v.value} >{v.name}</Select.Option>)}
                    </Select>
                </Label>

                <Label text='Resource Name'>
                    <Input placeholder='' allowClear={true}
                        style={{ width: '200px', padding: '2px 8px', whiteSpace: 'nowrap' }}
                        value={state.resourceName} onChange={e => state.resourceName = e.target.value}
                    />
                </Label>

                <Label text='Pattern Type'>
                    <Select<AclResourcePatternTypeFilter> value={state.resourcePatternTypeFilter} onChange={x => state.resourcePatternTypeFilter = x} style={{ width: '11em' }} size='middle'>
                        {OptionValues.PatternTypeFilters.map(v => <Select.Option key={v.value} value={v.value} >{v.name}</Select.Option>)}
                    </Select>
                </Label>

                <Label text='Principal'>
                    <Input placeholder='' allowClear={true}
                        style={{ width: '200px', padding: '2px 8px', whiteSpace: 'nowrap' }}
                        value={state.principal} onChange={e => state.principal = e.target.value}
                    />
                </Label>
                <Label text='Host'>
                    <Input placeholder='' allowClear={true}
                        style={{ width: '200px', padding: '2px 8px', whiteSpace: 'nowrap' }}
                        value={state.host} onChange={e => state.host = e.target.value}
                    />
                </Label>

                <Label text='Operation'>
                    <Select<AclOperation> value={state.operation} onChange={x => state.operation = x} style={{ width: '11em' }} size='middle'>
                        {OptionValues.Operations.map(v => <Select.Option key={v.value} value={v.value} >{v.name}</Select.Option>)}
                    </Select>
                </Label>

                <Label text='Permission'>
                    <Select<AclPermissionType> value={state.permissionType} onChange={x => state.permissionType = x} style={{ width: '11em' }} size='middle'>
                        {OptionValues.Permissions.map(v => <Select.Option key={v.value} value={v.value} >{v.name}</Select.Option>)}
                    </Select>
                </Label>
                */}

            </div>
        );
    })
}

export default AclList;

function capitalize(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function enumEntries(e: any): { name: string, value: number }[] {
    let result = [];
    for (const key in e)
        if (typeof e[key] === 'number')
            result.push({ name: key, value: e[key] });

    result = result.filter(e => e.value != 0);

    for (const e of result)
        e.name = e.name
            .removePrefix('Acl')
            .removePrefix('Resource')
            .removePrefix('Operation')
            .removePrefix('Pattern')
            .removePrefix('Permission');

    return result;
}

const OptionValues = {
    Types: enumEntries(AclResourceType),
    PatternTypeFilters: enumEntries(AclResourcePatternTypeFilter),
    Operations: enumEntries(AclOperation),
    Permissions: enumEntries(AclPermissionType),
} as const;
//console.log('enum entries are:', resourceTypes.map(e => ({ name: e.name.replace(/([A-Z]+)/g, " $1"), value: e.value })));
// console.log('enum entries are:', OptionValues);
