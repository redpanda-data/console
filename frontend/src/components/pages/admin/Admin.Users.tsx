import { Component, ReactNode } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage, Partition, UserDetails } from "../../../state/restInterfaces";
import { Table, Tooltip, Icon, Row, Statistic, Tabs, Descriptions, Popover, Skeleton, Radio, Checkbox, Button, Select, Input, Form, Divider, Typography, message, Tag, Drawer, Result, Alert, Empty, ConfigProvider } from "antd";
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
import { findElementDeep, cullText, getAllKeys } from "../../../utils/utils";
import { FormComponentProps } from "antd/lib/form";
import { animProps, MotionAlways, MotionDiv } from "../../../utils/animationProps";
import Paragraph from "antd/lib/typography/Paragraph";
import { ColumnProps } from "antd/lib/table";
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { FilterableDataSource } from "../../../utils/filterableDataSource";
import { numberToThousandsString } from "../../../utils/tsxUtils";
import Card from "../../misc/Card";
import { RoleComponent } from "./Admin.Roles";

const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;




@observer
export class AdminUsers extends Component<{}> {

    render() {
        if (!api.AdminInfo) return this.skeleton;
        const users = api.AdminInfo.users;

        const table = <Table
            size={'middle'} style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }} bordered={false}
            dataSource={users}
            rowKey={x => x.name}
            rowClassName={() => 'hoverLink'}
            columns={[
                { width: 2, title: 'Name', dataIndex: 'name' },
                { width: undefined, title: 'Roles', dataIndex: 'roleNames', render: (t, r, i) => r.roleNames.join(', ') },
                { width: 1, title: 'Login', dataIndex: 'loginProvider' },
            ]}
            expandIconAsCell={false}
            expandIconColumnIndex={-1}
            expandRowByClick={true}
            expandedRowRender={(user: UserDetails) => {
                return user.roles.map(r => <RoleComponent role={r} />)
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
