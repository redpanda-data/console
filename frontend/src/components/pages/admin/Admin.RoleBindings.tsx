import { Component, ReactNode } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage, Partition, UserDetails, RoleBinding, SubjectDefinition } from "../../../state/restInterfaces";
import { Table, Tooltip, Row, Statistic, Tabs, Descriptions, Popover, Skeleton, Radio, Checkbox, Button, Select, Input, Form, Divider, Typography, message, Tag, Drawer, Result, Alert, Empty, ConfigProvider } from "antd";
import { observer } from "mobx-react";
import { api, TopicMessageOffset, TopicMessageSortBy, TopicMessageDirection, TopicMessageSearchParameters } from "../../../state/backendApi";
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
export class AdminRoleBindings extends Component<{}> {

    render() {
        if (!api.AdminInfo) return this.skeleton;
        const roleBindings = api.AdminInfo.roleBindings;

        const table = <Table
            size={'middle'} style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }} bordered={false}
            showSorterTooltip={false}
            dataSource={roleBindings}
            rowClassName={() => 'hoverLink'}
            columns={[
                { width: 1, title: 'Metadata', dataIndex: 'metadata', render: (t, r) => <code>{ToJson(r.metadata)}</code>, sorter: sortField('metadata') },
                { width: 2, title: 'Role', dataIndex: 'roleName', sorter: sortField('roleName') },
                { width: 1, title: 'Subjects', dataIndex: 'subjects', render: (t, r) => r.subjects?.length ?? 0, sorter: (a, b) => (a.subjects?.length - b.subjects?.length) ?? 0 },
            ]}
            // expandIconAsCell={false} broken after upgrade to antd4
            expandIconColumnIndex={-1}
            expandRowByClick={true}
            expandedRowRender={(rb: RoleBinding) => {
                return rb.subjects.map(s => <SubjectComponent subject={s} />)
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

export class SubjectComponent extends Component<{ subject: SubjectDefinition }>{
    render() {
        const s = this.props.subject;
        // todo: this is a placeholder, to be completely replaced...

        const kind = s.provider + "-" + s.kind;
        return <div>
            <div>{kind}: {s.name} {s.organization && <>(Org: {s.organization})</>}</div>
        </div>
    }
}