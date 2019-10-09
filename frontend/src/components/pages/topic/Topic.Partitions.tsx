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
class TopicPartitions extends Component<{ topic: TopicDetail }> {

    pageConfig = makePaginationConfig(100); // makePaginationConfig(uiSettings.topics.partitionPageSize);

    render() {

        /*
        const table = <Table
            size={'small'} style={{ margin: '0', padding: '0' }} bordered={true}
            pagination={this.pageConfig}
            onChange={x => { if (x.pageSize) { uiSettings.consumerGroupList.pageSize = x.pageSize } }}
            // dataSource={groups}
            rowKey={x => x.id}
            columns={[
                { title: 'ID', dataIndex: 'groupId', sorter: sortField('groupId') },
                { title: 'State', dataIndex: 'state', width: 1, sorter: sortField('state') },
                { title: 'Members', dataIndex: 'members', width: 1, render: (t: GroupMemberDescription[]) => t.length, sorter: sortField('members') },
            ]} />

        */

        return <>asd</>

        //return <MotionAlways>{table}</MotionAlways>
    }
}
