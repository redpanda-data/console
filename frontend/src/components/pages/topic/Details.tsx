import React from "react";
import { Row, Tabs, Skeleton, Radio, Checkbox, Button, Select, Input, Typography, Result } from "antd";
import { observer } from "mobx-react";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { PageComponent, PageInitHelper } from "../Page";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { TopicQuickInfoStatistic } from "./Topic.QuickInfo";
import { TopicConfiguration } from "./Topic.Config";
import { TopicMessageView } from "./Topic.Messages";
import { appGlobal } from "../../../state/appGlobal";
import { TopicPartitions } from "./Topic.Partitions";

const { Text } = Typography;

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

    get tabPageKey() {
        const tabs = ['partitions', 'messages', 'configuration'];

        // use url anchor if possible
        let key = (appGlobal.history.location.hash).replace("#", "");
        if (tabs.includes(key)) return key;

        // use settings (last visited tab)
        key = uiState.topicDetails.activeTabKey!;
        if (tabs.includes(key)) return key;

        // default to partitions
        return 'partitions'
    }

    componentDidMount() {
        // fix anchor
        const anchor = '#' + this.tabPageKey;
        const location = appGlobal.history.location;
        if (location.hash !== anchor) {
            location.hash = anchor;
            appGlobal.history.replace(location);
        }
    }

    render() {
        const topicName = this.props.topicName;
        // todo: we shouldn't prepare data here. Instead we should create actions that obtain
        // the data and pass those to the components, they should be responsible to handle 'undefined' themselves.
        if (!api.Topics) return this.skeleton;
        const topic = api.Topics.find(e => e.topicName == topicName);
        if (!topic) return this.topicNotFound(topicName);
        const topicConfig = api.TopicConfig.get(topicName);
        if (!topicConfig) return this.skeleton;

        return (
            <motion.div {...animProps} key={'b'}>
                {/* QuickInfo */}
                <TopicQuickInfoStatistic config={topicConfig} />

                {/* Tabs:  Messages, Configuration */}
                <Tabs style={{ overflow: 'visible' }} animated={false}
                    activeKey={this.tabPageKey}
                    onChange={this.setTabPage}
                >
                    <Tabs.TabPane key="partitions" tab="Partitions">
                        <TopicPartitions topic={topic} />
                    </Tabs.TabPane>

                    <Tabs.TabPane key="messages" tab="Messages">
                        <TopicMessageView topic={topic} />
                    </Tabs.TabPane>

                    <Tabs.TabPane key="configuration" tab="Configuration">
                        <ConfigDisplaySettings /> {/* todo: move into TopicConfiguration */}
                        <TopicConfiguration config={topicConfig} />
                    </Tabs.TabPane>
                </Tabs>
            </motion.div>
        );
    }

    setTabPage = (activeKey: string): void => {
        uiState.topicDetails.activeTabKey = activeKey;

        const loc = appGlobal.history.location;
        loc.hash = activeKey;
        appGlobal.history.replace(loc);
    }

    topicNotFound(name: string) {
        return <Result
            status="404"
            title="404"
            subTitle={<>The topic <Text code>{name}</Text> does not exist.</>}
            extra={<Button type="primary" onClick={() => appGlobal.history.goBack()}>Go Back</Button>}
        />
    }

    skeleton = <>
        <motion.div {...animProps} key={'loader'}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}



const ConfigDisplaySettings = observer(() =>
    <div style={{ marginTop: '1em', marginBottom: '1em' }}>

        <Row>
            <Radio.Group value={uiSettings.topicList.valueDisplay} onChange={(e) => uiSettings.topicList.valueDisplay = e.target.value} size='small'>
                <Radio.Button value="friendly">Friendly</Radio.Button>
                <Radio.Button value="raw">Raw</Radio.Button>
                {/* <Radio.Button value="both">Both</Radio.Button> */}
            </Radio.Group>

            <span> </span>

            <Checkbox onChange={(e) => uiSettings.topicList.onlyShowChanged = e.target.checked} checked={uiSettings.topicList.onlyShowChanged}>Only show changed</Checkbox>

        </Row>
    </div>);



export default TopicDetails;
