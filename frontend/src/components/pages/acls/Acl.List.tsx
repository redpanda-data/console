import React, { } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Select, Input, Button } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { AclRequestDefault, AclResource, AclRule, Broker } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { observable } from "mobx";
import { containsIgnoreCase } from "../../../utils/utils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import { DefaultSkeleton, Label } from "../../../utils/tsxUtils";
import { LockIcon } from "@primer/octicons-v2-react";


type AclRuleFlat = AclResource & AclRule

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

    @observable filterText = "";

    initPage(p: PageInitHelper): void {
        p.title = 'ACLs';
        p.addBreadcrumb('ACLs', '/acls');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        if (api.userData != null && !api.userData.canListAcls) return;
        api.refreshAcls(AclRequestDefault, force);
    }

    render() {
        if (api.userData != null && !api.userData.canListAcls) return PermissionDenied;
        if (!api.ACLs) return DefaultSkeleton;

        // issue: we can't easily filter by 'resourceType' (because it is a string, and we have to use an enum for requests...)
        // so we have to cheat by building our own list of what types are available
        this.availableResourceTypes = api.ACLs.map(res => res.resourceType).distinct().map(str => ({ value: str, label: capitalize(str.toLowerCase()) }));
        this.availableResourceTypes.unshift({ label: 'Any', value: '' });
        const resources = api.ACLs
            .filter(res => (this.resourceTypeFilter == "") || (this.resourceTypeFilter == res.resourceType))
            .map(res => res.acls.map(rule => ({ ...res, ...rule })))
            .flat()
            .filter(this.isFilterMatch); // quick search

        const columns: ColumnProps<AclRuleFlat>[] = [
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

    isFilterMatch = (item: AclRuleFlat) => {
        const text = this.filterText;
        if (containsIgnoreCase(item.host, text)) return true;
        if (containsIgnoreCase(item.operation, text)) return true;
        if (containsIgnoreCase(item.permissionType, text)) return true;
        if (containsIgnoreCase(item.principal, text)) return true;
        if (containsIgnoreCase(item.resourceName, text)) return true;
        if (containsIgnoreCase(item.resourcePatternType, text)) return true;
        if (containsIgnoreCase(item.resourceType, text)) return true;

        return false;
    };

    SearchControls = observer(() => {
        //const state = uiState.aclSearchParams!;

        return (
            <div style={{ margin: '0 1px', marginBottom: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Label text='Resource Type'>
                    <Select
                        options={this.availableResourceTypes}
                        value={this.resourceTypeFilter}
                        onChange={(val) => {
                            this.resourceTypeFilter = val;
                        }}
                        style={{ width: '11em' }}
                        size='middle' />
                </Label>

                <Input allowClear={true} placeholder='Quick Search' style={{ width: '250px', marginLeft: 'auto' }}
                    onChange={x => this.filterText = x.target.value}
                    value={this.filterText}
                />
            </div>
        );
    })
}

export default AclList;

function capitalize(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}


//console.log('enum entries are:', resourceTypes.map(e => ({ name: e.name.replace(/([A-Z]+)/g, " $1"), value: e.value })));
// console.log('enum entries are:', OptionValues);

const PermissionDenied = <>
    <motion.div {...animProps} key={'aclNoPerms'} style={{ margin: '0 1rem' }}>
        <Card style={{ padding: '2rem 2rem', paddingBottom: '3rem' }}>
            <Empty description={null}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <h2><span><LockIcon verticalAlign='middle' size={20} /></span> Permission Denied</h2>
                    <p>
                        You are not allowed to view this page.
                            <br />
                            Contact the administrator if you think this is an error.
                        </p>
                </div>

                <a target="_blank" rel="noopener noreferrer" href="https://github.com/cloudhut/kowl/blob/master/docs/authorization/roles.md">
                    <Button type="primary">Kowl documentation for roles and permissions</Button>
                </a>
            </Empty>
        </Card>
    </motion.div>
</>