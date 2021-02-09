import React, { ReactNode, Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox, Steps, Button } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { Broker, BrokerConfigEntry, Partition, TopicAction, TopicDetail } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps } from "../../../utils/animationProps";
import { observable, computed, autorun, IReactionDisposer } from "mobx";
import { prettyBytesOrNA, toJson } from "../../../utils/utils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import Icon, { CheckCircleOutlined, CheckSquareOutlined, CrownOutlined, HddOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { DefaultSkeleton, OptionGroup } from "../../../utils/tsxUtils";
import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-v2-react";
const { Step } = Steps;

interface PartitionSelection { // Which partitions are selected?
    [topicName: string]: number[] // topicName -> array of partitionIds
}
interface PartitionTargets { // Where should the partitions be moved to?
    [topicName: string]: { partitionId: number, targetBrokerId?: number };
}

const steps = [
    { step: 0, title: 'Select Partitions', icon: <UnorderedListOutlined /> },
    { step: 1, title: 'Assign to Brokers', icon: <HddOutlined /> },
    { step: 2, title: 'Review and Confirm', icon: <CheckCircleOutlined /> },
];


@observer
class ReassignPartitions extends PageComponent {
    pageConfig = makePaginationConfig(100, true);
    autorunHandle: IReactionDisposer | undefined = undefined;

    @observable partitionSelection: PartitionSelection = {};
    @observable currentStep = 0;


    initPage(p: PageInitHelper): void {
        p.title = 'Reassign Partitions';
        p.addBreadcrumb('Reassign Partitions', '/reassign-partitions');

        appGlobal.onRefresh = () => this.refreshData(true);
        this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshTopics(force);
        if (api.topics)
            for (const topic of api.topics)
                api.refreshTopicPartitions(topic.topicName, force);

        this.autorunHandle = autorun(() => {
            if (api.topics != null)
                for (const topic of api.topics)
                    api.refreshTopicPartitions(topic.topicName, false);
        });
    }
    componentWillUnmount() {
        if (this.autorunHandle) {
            this.autorunHandle();
            this.autorunHandle = undefined;
        }
    }

    render() {
        if (!api.topics) return DefaultSkeleton;
        if (api.topicPartitions.size == 0) return <Empty />

        return <>
            <motion.div {...animProps} style={{ margin: '2px', marginBottom: '16px' }}>
                <Card>
                    <Row> {/* type="flex" */}
                        <Statistic title='Total Partitions' value={123} />
                        <Statistic title='Leader Partitions' value={123} />
                        <Statistic title='Replica Partitions' value={123} />
                        <Statistic title='Broker Count' value={123} />
                    </Row>
                </Card>

                <Card>
                    {/* Steps */}
                    <div style={{ margin: '0 1em 1em 1em' }}>
                        <Steps current={this.currentStep}>
                            {steps.map(item => <Step key={item.title} {...item} />)}
                        </Steps>
                    </div>

                    {/* Content */}
                    {(() => {
                        switch (this.currentStep) {
                            case 0: return <StepSelectPartitions partitionSelection={this.partitionSelection} />;
                            case 1: return "assign to brokers";
                            case 2: return "review";
                        }
                    })()}

                    {/* Navigation */}
                    <div style={{ marginTop: '1em' }}>
                        <Button onClick={() => this.currentStep--}
                            style={{ width: '12em' }}>
                            <span><ChevronLeftIcon /></span>
                            <span>Back</span>
                        </Button>
                        <Button onClick={() => this.currentStep++} type='primary'
                            style={{ width: '12em' }}
                        >
                            <span>Next Step</span>
                            <span><ChevronRightIcon /></span>
                        </Button>
                    </div>

                    {/* Debug */}
                    <div>
                        <h2>Current Selection</h2>
                        <div className='codeBox'>{toJson(this.partitionSelection, 4)}</div>
                    </div>

                </Card>
            </motion.div>
        </>
    }
}

type TopicWithPartitions = TopicDetail & { partitions: Partition[] };

@observer
class StepSelectPartitions extends Component<{ partitionSelection: PartitionSelection }> {
    pageConfig = makePaginationConfig(100, true);
    autorunHandle: IReactionDisposer | undefined = undefined;

    topicPartitions: TopicWithPartitions[] = [];

    constructor(props: any) {
        super(props);
        this.setSelection = this.setSelection.bind(this);
        this.isSelected = this.isSelected.bind(this);
        this.getSelectedPartitions = this.getSelectedPartitions.bind(this);
        this.getTopicCheckState = this.getTopicCheckState.bind(this);
    }

    componentWillUnmount() {
        if (this.autorunHandle) {
            this.autorunHandle();
            this.autorunHandle = undefined;
        }
    }

    render() {
        if (!api.topics) return DefaultSkeleton;
        if (api.topicPartitions.size == 0) return <Empty />

        this.topicPartitions = api.topics.map(topic => {
            return {
                ...topic,
                partitions: api.topicPartitions.get(topic.topicName)!
            }
        });

        const columns: ColumnProps<TopicWithPartitions>[] = [
            { width: 'auto', title: 'Topic', dataIndex: 'topicName' },
            { width: 'auto', title: 'Partitions', dataIndex: 'partitionCount' },
            { width: 'auto', title: 'Replication Factor', dataIndex: 'replicationFactor' },
            {
                width: 'auto', title: 'Brokers', dataIndex: 'partitions',
                render: (value, record) => record.partitions?.map(p => p.leader).distinct().length ?? 'N/A'
            },
            { width: 'auto', title: 'Size', dataIndex: 'logDirSize', render: v => prettyBytesOrNA(v) },
        ]

        return <>
            <Table
                style={{ margin: '0', }} size={'middle'}
                pagination={this.pageConfig}
                dataSource={this.topicPartitions}
                rowKey={r => r.topicName}
                rowClassName={() => 'pureDisplayRow'}
                rowSelection={{
                    type: 'checkbox',
                    columnTitle: <></>, // don't show "select all" checkbox
                    renderCell: (value: boolean, record, index: number, originNode: React.ReactNode) => {
                        return <IndeterminateCheckbox originalCheckbox={originNode} getCheckState={() => this.getTopicCheckState(record.topicName)} />

                    },
                    onSelect: (record, selected: boolean, selectedRows) => {
                        // Select all partitions in this topic
                        if (record.partitions)
                            for (const p of record.partitions)
                                this.setSelection(record.topicName, p.id, selected);
                    },
                    getCheckboxProps: record => {
                        if (record.partitions) {
                            const selectedPartitions = this.props.partitionSelection[record.topicName];
                            let hasPartialSelection = false;
                            if (selectedPartitions && selectedPartitions.length != 0 && selectedPartitions.length < record.partitionCount)
                                hasPartialSelection = true;

                            return { indeterminate: hasPartialSelection };
                        }
                        return {};
                    },
                    // todo: in setSelected() call, keep track of what the 'topic checkbox state' should be (selected, indeterminate)
                    // selectedRowKeys:
                }}
                columns={columns}
                expandable={{
                    expandIconColumnIndex: 1,
                    expandedRowRender: topic => topic.partitions
                        ? <PartitionTable
                            topic={topic}
                            topicPartitions={topic.partitions}
                            isSelected={this.isSelected}
                            setSelection={this.setSelection}
                            getSelectedPartitions={() => this.getSelectedPartitions(topic.topicName)}
                        />
                        : <>Error loading partitions</>,
                    // expandedRowClassName: r => 'noPadding',
                }}
            />
        </>
    }

    setSelection(topic: string, partition: number, isSelected: boolean) {
        const partitions = this.props.partitionSelection[topic] ?? [];

        if (isSelected) {
            partitions.pushDistinct(partition);
        } else {
            partitions.remove(partition);
        }

        this.props.partitionSelection[topic] = partitions;
    }

    getSelectedPartitions(topic: string) {
        const partitions = this.props.partitionSelection[topic];
        if (!partitions) return [];
        return partitions;
    }

    isSelected(topic: string, partition: number) {
        const partitions = this.props.partitionSelection[topic];
        if (!partitions) return false;
        return partitions.includes(partition);
    }

    getTopicCheckState(topicName: string): { checked: boolean, indeterminate: boolean } {
        const tp = this.topicPartitions.first(t => t.topicName == topicName);
        if (!tp) return { checked: false, indeterminate: false };

        const selected = this.props.partitionSelection[topicName];
        if (!selected) return { checked: false, indeterminate: false };

        if (selected.length == 0)
            return { checked: false, indeterminate: false };

        if (selected.length == tp.partitionCount)
            return { checked: true, indeterminate: false };

        return { checked: false, indeterminate: true };
    }

}

@observer
class IndeterminateCheckbox extends Component<{ originalCheckbox: React.ReactNode, getCheckState: () => { checked: boolean, indeterminate: boolean } }> {

    render() {
        const state = this.props.getCheckState();
        // console.log(`checkbox${index} props: ${(originNode as any).props?.indeterminate}`)
        const clone = React.cloneElement(this.props.originalCheckbox as any, {
            checked: state.checked,
            indeterminate: state.indeterminate,
        });
        return clone;
    }
}

@observer
class PartitionTable extends Component<{
    topic: TopicDetail,
    topicPartitions: Partition[],
    setSelection: (topic: string, partition: number, isSelected: boolean) => void,
    isSelected: (topic: string, partition: number) => boolean,
    getSelectedPartitions: () => number[]
}> {
    partitionsPageConfig = makePaginationConfig(100, true);

    render() {
        return <div style={{ paddingTop: '4px', paddingBottom: '8px' }}>
            <Table size='small'
                dataSource={this.props.topicPartitions}
                pagination={this.partitionsPageConfig}
                scroll={{ y: '300px' }}
                rowKey={r => r.id}
                rowSelection={{
                    type: 'checkbox',
                    columnWidth: '43px',
                    columnTitle: <></>, // don't show "select all" checkbox
                    // onChange: (selected) => console.log('onChange selected=', selected),
                    selectedRowKeys: this.props.getSelectedPartitions().slice(),
                    onSelect: (record, selected: boolean, selectedRows) => {
                        // console.log("SetSelection, now selected: ", { getSelectedPartitions: this.props.getSelectedPartitions() });
                        this.props.setSelection(this.props.topic.topicName, record.id, selected);
                    },
                }}
                columns={[
                    { width: 100, title: 'Partition', dataIndex: 'id', sortOrder: 'ascend', sorter: (a, b) => a.id - b.id },
                    { width: 160, title: 'Leading Broker', dataIndex: 'leader' },
                    { width: undefined, title: 'Brokers', render: (v, record,) => record.replicas.slice().sort((a, b) => a - b).join(", ") },
                ]}
            />
        </div>
    }
}

export default ReassignPartitions;
