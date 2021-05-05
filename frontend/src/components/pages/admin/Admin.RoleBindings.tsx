import { Component, ReactNode } from "react";
import React from "react";
import { RoleBinding, Subject } from "../../../state/restInterfaces";
import { Collapse } from "antd";
import { observer } from "mobx-react";
import { api, } from "../../../state/backendApi";
import '../../../utils/arrayExtensions';
import { QuickTable, ObjToKv, DefaultSkeleton } from "../../../utils/tsxUtils";
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