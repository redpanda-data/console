import { Component, ReactNode } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage, Partition, UserDetails, RoleBinding, Subject } from "../../../state/restInterfaces";
import { Table, Tooltip, Row, Statistic, Tabs, Descriptions, Popover, Skeleton, Radio, Checkbox, Button, Select, Input, Form, Divider, Typography, message, Tag, Drawer, Result, Alert, Empty, ConfigProvider, Collapse } from "antd";
import { observer } from "mobx-react";
import { api, } from "../../../state/backendApi";
import { uiSettings, PreviewTag } from "../../../state/ui";
import ReactJson, { CollapsedFieldProps } from 'react-json-view'
import { PageComponent, PageInitHelper } from "../Page";
import topicConfigInfo from '../../../assets/topicConfigInfo.json'
import { sortField, range, makePaginationConfig, Spacer } from "../../misc/common";
import { motion, AnimatePresence } from "framer-motion";
import { observable, computed, transaction } from "mobx";
import { toJson } from "../../../utils/jsonUtils";
import { animProps, MotionAlways, MotionDiv } from "../../../utils/animationProps";
import Paragraph from "antd/lib/typography/Paragraph";
import { ColumnProps } from "antd/lib/table";
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { FilterableDataSource } from "../../../utils/filterableDataSource";
import { numberToThousandsString, QuickTable, ObjToKv, DefaultSkeleton } from "../../../utils/tsxUtils";
import Card from "../../misc/Card";
import { RoleComponent } from "./Admin.Roles";
import Icon from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;

@observer
export class AdminRoleBindings extends Component {

    render() {
        if (!api.adminInfo) return DefaultSkeleton;
        const roleBindings = api.adminInfo.roleBindings;

        return "bindings, along with a listing of all members in each subject group will be added later"

        // const groupMap = api.AdminInfo.groups.toMap(x => x.name, x => x);

        // const table = <Table
        //     size={'middle'} style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }} bordered={false}
        //     showSorterTooltip={false}
        //     dataSource={roleBindings}
        //     rowClassName={() => 'hoverLink'}
        //     rowKey={(x, i) => x.roleName}
        //     columns={[
        //         { title: 'Metadata', dataIndex: 'metadata', render: (t, r) => <code>{ToJson(r.metadata)}</code> },
        //         { width: 2, title: 'Role', dataIndex: 'roleName', sorter: sortField('roleName') },
        //         { width: 1, title: 'Subjects', dataIndex: 'subjects', render: (t, r) => r.subjects?.length ?? 0, sorter: (a, b) => (a.subjects?.length - b.subjects?.length) ?? 0 },
        //     ]}
        //     // expandIconAsCell={false} broken after upgrade to antd4
        //     expandIconColumnIndex={0}
        //     expandRowByClick={true}
        //     expandedRowRender={(rb: RoleBinding) => {
        //         return rb.subjects.map(s => <SubjectComponent key={rb.roleName} subject={s} group={s.kind === 'group' ? groupMap.get(s.name) : undefined} />)
        //     }}
        // />

        /*
        const groupMap = api.AdminInfo.groups.toMap(x => x.name, x => x);

        const table = <Table
            size={'middle'} style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }} bordered={false}
            showSorterTooltip={false}
            dataSource={roleBindings}
            rowClassName={() => 'hoverLink'}
            rowKey={(x, i) => x.roleName}
            columns={[
                { title: 'Metadata', dataIndex: 'metadata', render: (t, r) => <code>{ToJson(r.metadata)}</code> },
                { width: 2, title: 'Role', dataIndex: 'roleName', sorter: sortField('roleName') },
                { width: 1, title: 'Subjects', dataIndex: 'subjects', render: (t, r) => r.subjects?.length ?? 0, sorter: (a, b) => (a.subjects?.length - b.subjects?.length) ?? 0 },
            ]}
            // expandIconAsCell={false} broken after upgrade to antd4
            expandIconColumnIndex={0}
            expandRowByClick={true}
            expandedRowRender={(rb: RoleBinding) => {
                return rb.subjects.map(s => <SubjectComponent key={rb.roleName} subject={s} group={s.kind === 'group' ? groupMap.get(s.name) : undefined} />)
            }}
        />
        */

        // return <MotionAlways>
        //     {table}
        // </MotionAlways>
    }
}

export class RoleBindingComponent extends Component<{ binding: RoleBinding }>{
    render() {
        const binding = this.props.binding;

        const rows: [any, any][] = [
            [<span className='resourceLabel'>Binding</span>, <span className='roleBindingId'>{binding.ephemeralId}</span>],
            [<span className="resourceLabelSub">Metadata</span>, QuickTable(ObjToKv(binding.metadata), { tableStyle: { width: 'auto', fontFamily: 'monospace', fontSize: '80%' }, gapWidth: '6px' })],
            [<span className="resourceLabelSub">Subjects</span>, <Expander title='click to expand' className='subjectListExpander'>{binding.subjects.map(s => <SubjectComponent key={s.name + s.providerName} subject={s} />)}</Expander>]
        ];

        const t = QuickTable(rows, {
            tableClassName: 'permissionTable',
            tableStyle: { width: 'auto' },
            gapWidth: '8px',
            gapHeight: '4px',
            keyStyle: { fontSize: '80%', whiteSpace: 'nowrap', width: '1%', verticalAlign: 'top', padding: '1px 0px' },
            keyAlign: 'right',
        });

        return t;
    }
}

export class Expander extends Component<{ title: ReactNode, className?: string }> {
    render() {
        return <Collapse bordered={false} className={'expander ' + this.props.className}>
            <Collapse.Panel key={0} header={this.props.title}>{this.props.children}</Collapse.Panel>
        </Collapse>
    }
}

export class SubjectComponent extends Component<{ subject: Subject }>{
    render() {
        const s = this.props.subject;
        // todo: this is a placeholder, to be completely replaced...

        return <>
            <div>
                <span>{s.providerName}</span>
                {'-'}
                <span style={{ textTransform: 'capitalize' }}>{s.subjectKindName}</span>
                {': '}
                <span>{s.name}</span>
                <span>{s.organization && ` (Org: ${s.organization})`}</span>
            </div>
        </>
    }
}