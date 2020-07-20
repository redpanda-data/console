import { Component, ReactNode } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage, Partition, UserDetails, RoleBinding, SubjectDefinition, LoginProviderGroup } from "../../../state/restInterfaces";
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
import { ToJson } from "../../../utils/utils";
import { animProps, MotionAlways, MotionDiv } from "../../../utils/animationProps";
import Paragraph from "antd/lib/typography/Paragraph";
import { ColumnProps } from "antd/lib/table";
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { FilterableDataSource } from "../../../utils/filterableDataSource";
import { numberToThousandsString } from "../../../utils/tsxUtils";
import Card from "../../misc/Card";
import { RoleComponent } from "./Admin.Roles";
import Icon from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;

@observer
export class AdminRoleBindings extends Component {

    render() {
        if (!api.AdminInfo) return this.skeleton;
        const roleBindings = api.AdminInfo.roleBindings;

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

export class SubjectComponent extends Component<{ subject: SubjectDefinition, group?: LoginProviderGroup }>{
    render() {
        const s = this.props.subject;
        const group = this.props.group;
        // todo: this is a placeholder, to be completely replaced...

        const kind = s.provider + "-" + s.kind;
        const groupElement = group &&
            (<div>
                <div>&nbsp;</div>
                <div style={{ fontWeight: 600 }}>Members :</div>
                {(group as LoginProviderGroup).userNames.map(userName => (<div key={userName}>{userName}</div>))}
            </div>);

        return <div>
            <div>{kind}: {s.name} {s.organization && <>(Org: {s.organization})</>}</div>
            {groupElement}
        </div>
    }
}