import React, { Component } from "react";
import { TopicConfigEntry, TopicDetail } from "../../../state/restInterfaces";
import {
    Tooltip,
    Icon,
    Descriptions,
    Popover,
    Checkbox,
    Select,
    Input,
    Typography,
    Table,
    Skeleton
} from "antd";
import { observer } from "mobx-react";
import { uiSettings } from "../../../state/ui";
import prettyMilliseconds from "pretty-ms";
import prettyBytes from "pretty-bytes";
import topicConfigInfo from "../../../assets/topicConfigInfo.json";
import Paragraph from "antd/lib/typography/Paragraph";
import "../../../utils/arrayExtensions";
import { uiState } from "../../../state/uiState";
import { api } from "../../../state/backendApi";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { appGlobal } from "../../../state/appGlobal";
import { sortField, makePaginationConfig } from "../../misc/common";
import { PaginationConfig } from "antd/lib/table";

const { Text } = Typography;


@observer
export class TopicConsumers extends Component<{ topic: TopicDetail }> {

    constructor(p: any) {
        super(p);
        api.refreshTopicConsumers(this.props.topic.topicName);
    }

    pageConfig = makePaginationConfig(20);

    render() {
        const consumers = api.TopicConsumers.get(this.props.topic.topicName);
        if (!consumers) return this.skeleton;

        return <div>
            <Table
                style={{ margin: '0', padding: '0' }} size='middle'
                onRow={(record) =>
                    ({
                        onClick: () => appGlobal.history.push('/groups/' + record.groupId),
                    })}
                pagination={this.pageConfig}
                rowClassName={() => 'hoverLink'}
                dataSource={consumers}
                rowKey={x => x.groupId}
                columns={[
                    { width: 1, title: 'Group', dataIndex: 'groupId', sorter: sortField('groupId'), defaultSortOrder: 'ascend' },
                    { title: 'Lag', dataIndex: 'summedLag', sorter: sortField('summedLag') },
                ]} />
        </div>
    }

    skeleton = <>
        <motion.div {...animProps} key={'loader'} style={{ margin: '2rem' }}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}


