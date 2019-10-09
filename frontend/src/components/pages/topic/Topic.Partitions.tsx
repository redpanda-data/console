import { Component, ReactNode } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage } from "../../../state/restInterfaces";
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
import { FavoritePopover, FormatValue } from "./Topic.Config";

const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;




@observer
export class TopicPartitions extends Component<{ topic: TopicDetail }> {

    pageConfig = makePaginationConfig(100); // makePaginationConfig(uiSettings.topics.partitionPageSize);

    render() {
        const topic = this.props.topic;

        let warning: JSX.Element = <></>
        if (topic.cleanupPolicy.toLowerCase() == 'compact')
            warning = <Alert type="warning" message="Topic cleanupPolicy is 'compact'. Low Water Mark and Message Count are estimates!" showIcon />

        const table = <Table
            size={'small'} style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }} bordered={true}
            pagination={this.pageConfig}
            onChange={x => { if (x.pageSize) { /* todo    uiSettings.top.pageSize = x.pageSize*/ } }}
            dataSource={topic.partitions}
            rowKey={x => x.id.toString()}
            columns={[
                { width: 1, title: 'Partition ID', dataIndex: 'id', sorter: sortField('id'), defaultSortOrder: 'ascend' },
                { width: 1, title: 'Low Water Mark', dataIndex: 'waterMarkLow' },
                { width: 1, title: 'High Water Mark', dataIndex: 'waterMarkHigh' },
                { width: 1, title: 'Message Count', render: (t, r) => r.waterMarkHigh - r.waterMarkLow, sorter: (p1, p2) => (p1.waterMarkHigh - p1.waterMarkLow) - (p2.waterMarkHigh - p2.waterMarkLow) },
                // todo: lag (sum of lag over all consumer groups)
            ]} />

        return <MotionAlways>
            {warning}
            {table}
        </MotionAlways>
    }
}
