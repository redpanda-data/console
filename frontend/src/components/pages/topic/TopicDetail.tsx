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
import { TopicQuickInfoStatistic } from "./Topic.QuickInfo";
import { TopicConfiguration } from "./Topic.Config";
import { TopicMessageView } from "./Topic.Messages";

const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;

@observer
class TopicDetails extends PageComponent<{ topicName: string }> {

    initPage(p: PageInitHelper): void {
        const topicName = this.props.topicName;
        uiState.currentTopicName = topicName;
        api.clearMessageCache();
        api.refreshTopics();
        api.refreshTopicConfig(topicName);


        p.title = topicName;
        p.addBreadcrumb('Topics', '/topics');
        p.addBreadcrumb(topicName, '/topics/' + topicName);
    }

    render() {
        const topicName = this.props.topicName;

        if (!api.Topics) return skeleton;
        const topic = api.Topics.find(e => e.topicName == topicName);
        if (!topic) return skeleton;
        const topicConfig = api.TopicConfig.get(topicName);
        if (!topicConfig) return skeleton;

        return (
            <motion.div {...animProps} key={'b'}>
                {/* QuickInfo */}
                <TopicQuickInfoStatistic config={topicConfig} />

                {/* Tabs:  Messages, Configuration */}
                <Tabs style={{ overflow: 'visible' }} animated={false}
                    activeKey={uiState.topicDetails.activeTabKey || '1'}
                    onChange={e => uiState.topicDetails.activeTabKey = e}
                >
                    <Tabs.TabPane key="1" tab="Messages">
                        <TopicMessageView topic={topic} />
                    </Tabs.TabPane>

                    <Tabs.TabPane key="2" tab="Configuration">
                        <ConfigDisplaySettings />
                        <TopicConfiguration config={topicConfig} />
                    </Tabs.TabPane>
                </Tabs>
            </motion.div>
        );
    }

}

const skeleton = <>
    <motion.div {...animProps} key={'loader'}>
        <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
    </motion.div>
</>



const ConfigDisplaySettings = observer(() =>
    <div style={{ marginTop: '1em', marginBottom: '1em' }}>

        <Row>
            <Radio.Group value={uiSettings.topics.valueDisplay} onChange={(e) => uiSettings.topics.valueDisplay = e.target.value} size='small'>
                <Radio.Button value="friendly">Friendly</Radio.Button>
                <Radio.Button value="raw">Raw</Radio.Button>
                {/* <Radio.Button value="both">Both</Radio.Button> */}
            </Radio.Group>

            <span> </span>

            <Checkbox onChange={(e) => uiSettings.topics.onlyShowChanged = e.target.checked} checked={uiSettings.topics.onlyShowChanged}>Only show changed</Checkbox>

        </Row>
    </div>);



export default TopicDetails;
