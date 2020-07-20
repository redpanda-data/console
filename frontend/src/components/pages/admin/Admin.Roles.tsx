import { Component, ReactNode } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage, Partition, UserDetails, Role } from "../../../state/restInterfaces";
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

export class RoleComponent extends Component<{ role: Role }>{
    render() {
        const r = this.props.role;

        return <Card style={{ display: 'inline-block', marginRight: '1em' }}>
            <div className='roleTitle'>{r.name}</div>
            {r.permissions.filter(p => p != null).map((p, i) =>
                <div key={i} style={{ paddingLeft: '.5rem', marginBottom: '1rem' }}>

                    <div><b>Resource:</b> {p.resource}</div>
                    <b>Actions:</b> {p.allowedActions?.join(", ")}<br />
                    {p.includes && !(p.includes[0] == "*") && (<><b>When:</b> {p.includes.join(" OR ")}<br /></>)}
                    {p.excludes && (<><b>Except:</b> {p.excludes.join(" OR ")}</>)}
                </div>)}
        </Card>
    }
}