import { Component, ReactNode } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage, Partition, UserDetails, Role, RoleBinding, Permission } from "../../../state/restInterfaces";
import { Table, Tooltip, Row, Statistic, Tabs, Descriptions, Popover, Skeleton, Radio, Checkbox, Button, Select, Input, Form, Divider, Typography, message, Tag, Drawer, Result, Alert, Empty, ConfigProvider } from "antd";
import { observer } from "mobx-react";
import { api, } from "../../../state/backendApi";
import { uiSettings, PreviewTag } from "../../../state/ui";
import ReactJson, { CollapsedFieldProps } from 'react-json-view'
import { PageComponent, PageInitHelper } from "../Page";
import prettyMilliseconds from 'pretty-ms';
import prettyBytes from 'pretty-bytes';
import topicConfigInfo from '../../../assets/topicConfigInfo.json'
import { sortField, range, makePaginationConfig, Spacer } from "../../misc/common";
import { motion, AnimatePresence } from "framer-motion";
import { observable, computed, transaction } from "mobx";
import { findElementDeep, cullText, getAllKeys } from "../../../utils/utils";
import { animProps, MotionAlways, MotionDiv } from "../../../utils/animationProps";
import Paragraph from "antd/lib/typography/Paragraph";
import { ColumnProps } from "antd/lib/table";
import '../../../utils/arrayExtensions';
import Card from "../../misc/Card";
import Icon from '@ant-design/icons';
import { QuickTable } from "../../../utils/tsxUtils";
import { RoleBindingComponent } from "./Admin.RoleBindings";


const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;



@observer
export class AdminRoles extends Component<{}> {

    render() {
        if (!api.AdminInfo) return this.skeleton;
        const roles = api.AdminInfo.roles;

        const table = <Table
            size={'middle'} style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }} bordered={false}
            showSorterTooltip={false}
            dataSource={roles}
            rowClassName={() => 'hoverLink'}
            rowKey={(x, i) => x.name}
            columns={[
                { width: 1, title: 'Role Name', dataIndex: 'name', sorter: sortField('name') },
                { title: '', render: r => (<span></span>) },
            ]}
            // expandIconAsCell={false} broken after upgrade to antd4
            expandIconColumnIndex={0}
            expandRowByClick={true}
            expandedRowRender={(r: Role) => <RoleComponent key={r.name} role={r} />}
        />

        return <MotionAlways>
            {table}
        </MotionAlways>
    }

    skeleton = <>
        <motion.div {...animProps} key={'loader'} style={{ margin: '2rem' }}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}

export class RoleComponent extends Component<{ role: Role, grantedBy?: RoleBinding[] }>{
    render() {
        const { role, grantedBy } = this.props;

        return <div style={{ display: 'grid', gridTemplateColumns: '50% 1px 50%', gridColumnGap: '4px' }}>

            <div>
                <div className='roleTitle'>Role Permissions</div>
                <div style={{ paddingLeft: '.5rem', display: 'grid', gridAutoFlow: 'row', gridGap: '20px' }}>
                    {role.permissions.map((p, index) => <PermissionComponent key={index} permission={p} />)}
                </div>
            </div>

            {grantedBy && <>
                <div style={{ background: '#dcdcdc' }} /> {/* seperator */}
                <div style={{ paddingLeft: '1em' }}>
                    <div className='roleTitle'>Granted By</div>
                    <div style={{ paddingLeft: '.5rem', display: 'grid', gridAutoFlow: 'row', gridGap: '20px' }}>
                        {this.props.grantedBy?.map(x => <RoleBindingComponent key={x.ephemeralId} binding={x} />)}
                    </div>
                </div>
            </>}
        </div>
    }
}

const joinerOr = <span className='joinerOr'>or</span>;

export class PermissionComponent extends Component<{ permission: Permission }>{
    render() {
        const p = this.props.permission;
        const rows: [any, any][] = [
            [<span className='resourceLabel'>Resource</span>, <span className='codeBox resourceName'>{p.resourceName}</span>],
        ];
        if (p.allowedActions.length > 0)
            rows.push([<span className="resourceLabelSub">Actions</span>, stringsToBoxes(p.allowedActions, null, 'permissionsList')]);
        if (p.includes.length > 0 && !(p.includes[0] == "*") && !(p.includes[0] == "^*$") && !(p.includes[0] == "^.*$"))
            rows.push([<span className="resourceLabelSub">When</span>, stringsToBoxes(p.includes, joinerOr, 'permissionRegex')]);
        if (p.excludes.length > 0)
            rows.push([<span className="resourceLabelSub">Except</span>, stringsToBoxes(p.excludes, joinerOr, 'permissionRegex')]);

        const t = QuickTable(rows, {
            tableClassName: 'permissionTable',
            tableStyle: { width: 'auto' },
            gapWidth: '8px',
            keyStyle: { fontSize: '80%', whiteSpace: 'nowrap', width: '1%' },
            keyAlign: 'right',
        });

        return t;
    }
}


function stringsToBoxes(ar: string[], joiner?: ReactNode, wrapperClass?: string): ReactNode {
    let r = ar.map<ReactNode>((str, index) => <span key={index} className='codeBox'>{str}</span>);
    if (joiner) r = r.genericJoin(() => joiner);

    return <div className={wrapperClass}>{r}</div>;
}
