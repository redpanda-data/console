import { Component, ReactNode } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage, Partition } from "../../../state/restInterfaces";
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
import { findElementDeep, cullText, getAllKeys } from "../../../utils/utils";
import { animProps, MotionAlways, MotionDiv } from "../../../utils/animationProps";
import Paragraph from "antd/lib/typography/Paragraph";
import { ColumnProps } from "antd/lib/table";
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { FilterableDataSource } from "../../../utils/filterableDataSource";
import { FavoritePopover, FormatValue } from "./Tab.Config";
import { numberToThousandsString } from "../../../utils/tsxUtils";

const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;




@observer
export class TopicPartitions extends Component<{ topic: TopicDetail }> {

    pageConfig = makePaginationConfig(100); // makePaginationConfig(uiSettings.topics.partitionPageSize);

    constructor(p: any) {
        super(p);
        api.refreshTopicPartitions(this.props.topic.topicName);
    }

    render() {
        const topic = this.props.topic;
        let partitions = api.TopicPartitions.get(topic.topicName);
        if (!partitions) {
            return this.skeleton;
        }

        let warning: JSX.Element = <></>
        if (topic.cleanupPolicy.toLowerCase() == 'compact')
            warning = <Alert type="warning" message="Topic cleanupPolicy is 'compact'. Message Count is an estimate!" showIcon style={{ marginBottom: '1em' }} />

        const table = <Table
            size={'middle'} style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }} bordered={false}
            pagination={this.pageConfig}
            onChange={(pagination, filter, sorter) => {
                if (pagination.pageSize) { /* todo    uiSettings.top.pageSize = x.pageSize*/ }
                console.dir({ pagination, sorter });
            }}
            dataSource={partitions}
            rowKey={x => x.id.toString()}
            columns={[
                { width: 1, title: 'Partition ID', dataIndex: 'id', sorter: sortField('id'), defaultSortOrder: 'ascend' },
                { width: 1, title: 'Low Water Mark', dataIndex: 'waterMarkLow', render: (t) => numberToThousandsString(t), sorter: sortField('waterMarkLow') },
                { width: 1, title: 'High Water Mark', dataIndex: 'waterMarkHigh', render: (t) => numberToThousandsString(t), sorter: sortField('waterMarkHigh') },
                {
                    width: 1, title: 'Message Count', key: 'msgCount', render: (t, r) => numberToThousandsString(r.waterMarkHigh - r.waterMarkLow),
                    sorter: (p1, p2) => (p1.waterMarkHigh - p1.waterMarkLow) - (p2.waterMarkHigh - p2.waterMarkLow)
                },
                // todo: lag (sum of lag over all consumer groups)
            ]} />

        return <MotionAlways>
            {warning}
            {table}
        </MotionAlways>
    }

    skeleton = <>
        <motion.div {...animProps} key={'loader'} style={{ margin: '2rem' }}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}
