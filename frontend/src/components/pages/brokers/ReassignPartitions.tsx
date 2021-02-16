import React, { ReactNode, Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox, Steps, Button, message, Select, Tag } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { Broker, BrokerConfigEntry, Partition, TopicAction, TopicDetail } from "../../../state/restInterfaces";
import { AnimatePresence, motion } from "framer-motion";
import { animProps, MotionAlways } from "../../../utils/animationProps";
import { observable, computed, autorun, IReactionDisposer, transaction, untracked } from "mobx";
import { prettyBytesOrNA, toJson } from "../../../utils/utils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import Icon, { CheckCircleOutlined, CheckSquareOutlined, CrownOutlined, HddOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { DefaultSkeleton, ObjToKv, OptionGroup } from "../../../utils/tsxUtils";
import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-v2-react";
const { Step } = Steps;

interface PartitionSelection { // Which partitions are selected?
    [topicName: string]: number[] // topicName -> array of partitionIds
}

const steps = [
    { step: 0, title: 'Select Partitions', icon: <UnorderedListOutlined />, nextButton: 'Select Target Brokers' },
    { step: 1, title: 'Assign to Brokers', icon: <HddOutlined />, backButton: 'Select Partitions', nextButton: 'Review Plan' },
    { step: 2, title: 'Review and Confirm', icon: <CheckCircleOutlined />, backButton: 'Select Target Brokers', nextButton: 'Start Reassignment' },
] as { step: number, title: string, icon: React.ReactElement, backButton?: string, nextButton?: string }[];


@observer
class ReassignPartitions extends PageComponent {
    pageConfig = makePaginationConfig(15, true);
    autorunHandle: IReactionDisposer | undefined = undefined;

    @observable currentStep = 0; // current page of the wizard
    @observable partitionSelection: PartitionSelection = {}; // topics/partitions selected by user
    @observable selectedBrokers: number[] = [];


    initPage(p: PageInitHelper): void {
        p.title = 'Reassign Partitions';
        p.addBreadcrumb('Reassign Partitions', '/reassign-partitions');

        appGlobal.onRefresh = () => this.refreshData(true);
        this.refreshData(true);

        this.autorunHandle = autorun(() => {
            if (api.topics != null)
                for (const topic of api.topics)
                    api.refreshTopicPartitions(topic.topicName, false);
        });

        // Debug
        autorun(() => {
            if (api.topics != null)
                transaction(() => {
                    untracked(() => {
                        // clear
                        for (const t in this.partitionSelection)
                            delete this.partitionSelection[t];

                        // select random partitions
                        const percent = 10 / 100;
                        for (const t of api.topics!)
                            for (let p = 0; p < t.partitionCount; p++) {
                                if (Math.random() < percent) {
                                    const partitions = this.partitionSelection[t.topicName] ?? [];
                                    partitions.push(p);
                                    this.partitionSelection[t.topicName] = partitions;
                                }
                            }
                    });
                });
        }, { delay: 1000 });

        const oriOnNextPage = this.onNextPage.bind(this);
        this.onNextPage = () => transaction(oriOnNextPage);
    }

    refreshData(force: boolean) {
        api.refreshTopics(force);
        if (api.topics)
            for (const topic of api.topics)
                api.refreshTopicPartitions(topic.topicName, force);

        api.refreshCluster(force);
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
            <motion.div className="reassignPartitions" {...animProps} style={{ margin: '0 1rem' }}>
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
                    <div style={{ margin: '.75em 1em 1em 1em' }}>
                        <Steps current={this.currentStep}>
                            {steps.map(item => <Step key={item.title} title={item.title} icon={item.icon} />)}
                        </Steps>
                    </div>

                    {/* Content */}
                    <motion.div {...animProps} key={"step" + this.currentStep}> {(() => {
                        switch (this.currentStep) {
                            case 0: return <StepSelectPartitions partitionSelection={this.partitionSelection} />;
                            case 1: return <StepAssignPartitions brokers={this.selectedBrokers} />;
                            case 2: return "review";
                        }
                    })()} </motion.div>

                    {/* Navigation */}
                    <div style={{ margin: '2.5em 0 1.5em', display: 'flex', height: '2.5em' }}>
                        {/* Back */}
                        {steps[this.currentStep].backButton &&
                            <Button
                                onClick={() => this.currentStep--}
                                disabled={this.currentStep <= 0}
                                style={{ minWidth: '12em', height: 'auto' }}
                            >
                                <span><ChevronLeftIcon /></span>
                                <span>{steps[this.currentStep].backButton}</span>
                            </Button>
                        }

                        {/* Next */}
                        {steps[this.currentStep].nextButton &&
                            <Button
                                type='primary'
                                style={{ minWidth: '12em', height: 'auto', marginLeft: 'auto' }}
                                onClick={this.onNextPage}
                            >
                                <span>{steps[this.currentStep].nextButton}</span>
                                <span><ChevronRightIcon /></span>
                            </Button>
                        }
                    </div>
                </Card>

                {/* Debug */}
                <div style={{ margin: '2em 0 1em 0' }}>
                    <h2>Partitions</h2>
                    <div className='codeBox'>{toJson(this.partitionSelection)}</div>
                    <h2>Brokers</h2>
                    <div className='codeBox'>{toJson(this.selectedBrokers)}</div>
                </div>
            </motion.div>
        </>
    }

    // will be wrapped in a 'transaction' since we're modifying multiple observables
    onNextPage() {
        if (this.currentStep == 0) {
            // Select -> Assign
            // prepare data for the next step
            /*
            this.partitionAssignments = ObjToKv(this.partitionSelection)
                .map(kv => {
                    const topicName = kv.key;
                    const partitionIds = kv.value as number[];

                    if (partitionIds.length == 0) return null; // skip topics when no partitions are selected

                    const partitions = api.topicPartitions.get(topicName)!;
                    const selection = partitions
                        .filter(p => partitionIds.includes(p.id))
                        .map(p => ({
                            ...p,
                            targetBroker: undefined as number | undefined
                        }));

                    return {
                        topic: api.topics!.first(t => t.topicName == topicName)!,
                        allPartitions: partitions,
                        selectedPartitions: selection,
                        topicName: topicName,
                        partitionCount: partitions.length,
                        selectedPartitionCount: selection.length,
                    } as PartitionAssignemnt;
                })
                .filterNull();

            if (this.partitionAssignments.length == 0) {
                message.warn('You need to select at least one partition to continue.', 4);
                return;
            }
            */
        }

        if (this.currentStep == 1) {
            // Assign -> Review
        }

        if (this.currentStep == 2) {
            // Review -> Start
            message.loading('Starting reassignment...', 5);
            return;
        }


        this.currentStep++;
    }

    onPreviousPage() {
        this.currentStep--;
    }
}



type TopicWithPartitions = TopicDetail & { partitions: Partition[] };

@observer
class StepSelectPartitions extends Component<{ partitionSelection: PartitionSelection }> {
    pageConfig = makePaginationConfig(100, true);
    autorunHandle: IReactionDisposer | undefined = undefined;

    topicPartitions: TopicWithPartitions[] = [];
    filterQuery: string = "";

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
            {
                width: 'auto', title: 'Topic', dataIndex: 'topicName', sorter: sortField('topicName'), defaultSortOrder: 'ascend',
                // filtered: true, filteredValue: ['owlshop'], onFilter: (value, record) => record.topicName.toLowerCase().includes(String(value).toLowerCase()),
            },
            { width: 'auto', title: 'Partitions', dataIndex: 'partitionCount', sorter: sortField('partitionCount') },
            { width: 'auto', title: 'Replication Factor', dataIndex: 'replicationFactor', sorter: sortField('replicationFactor') },
            {
                width: 'auto', title: 'Brokers', dataIndex: 'partitions',
                render: (value, record) => record.partitions?.map(p => p.leader).distinct().length ?? 'N/A'
            },
            { width: 'auto', title: 'Size', dataIndex: 'logDirSize', render: v => prettyBytesOrNA(v), sorter: sortField('logDirSize') },
        ]

        return <>
            <div style={{ margin: '2em 1em' }}>
                <h2>Select Partitions</h2>
                <p>Choose which partitions you want to reassign to different brokers. Selecting a topic will select all its partitions.</p>
            </div>

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
            <Table size='small' className='nestedTable'
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



@observer
class StepAssignPartitions extends Component<{ brokers: number[] }> {
    pageConfig = makePaginationConfig(15, true);

    brokers: Broker[];

    constructor(props: any) {
        super(props);
        this.brokers = api.clusterInfo!.brokers;
    }

    render() {
        if (!this.brokers || this.brokers.length == 0) {
            console.log('brokers', { brokers: this.brokers, apiClusterInfo: api.clusterInfo })
            return <div>Error: no brokers available</div>
        }

        const columns: ColumnProps<Broker>[] = [
            { width: undefined, title: 'Broker Address', dataIndex: 'address' },
            { width: '130px', title: 'Broker ID', dataIndex: 'brokerId' },
            { width: undefined, title: 'Rack', dataIndex: 'rack' },
            { width: '150px', title: 'Used Space', dataIndex: 'logDirSize', render: (value) => prettyBytesOrNA(value) },
        ]

        return <>
            <div style={{ margin: '2em 1em' }}>
                <h2>Target Brokers</h2>
                <p>Choose at least one target broker to move the selected partitions to. This does not necessarily guarantee that all seelcted partitions will be moved to these brokers, but Kowl will consider them as desired targets and distribute partitions across the available racks of the selected target brokers.</p>
            </div>

            <Table
                style={{ margin: '0', }} size={'middle'}
                dataSource={this.brokers}
                columns={columns}
                pagination={this.pageConfig}
                rowKey={r => r.brokerId}
                rowClassName={() => 'pureDisplayRow'}
                rowSelection={{
                    type: 'checkbox',
                    onChange: (keys, values) => {
                        this.props.brokers.splice(0);
                        for (const broker of values)
                            this.props.brokers.push(broker.brokerId);
                    }
                }}
            />
        </>
    }


}

type PartitionAssignemnt = {
    topicName: string;
    partitionCount: number;
    selectedPartitionCount: number;
    topic: TopicDetail;
    allPartitions: Partition[];
    selectedPartitions: (Partition & {
        // after the 'assign' step, all partitions must have a number set
        targetBroker: number | undefined,
        // true when the user has selected 'Auto' for this partition
        automatic: boolean
    })[];
};

@observer
class StepAssignPartitionsOld extends Component<{ assignments: PartitionAssignemnt[] }> {
    pageConfig = makePaginationConfig(15, true);

    brokers: { label: React.ReactElement, value: number, broker: Broker | null }[];

    componentDidMount() {
        this.brokers = api.clusterInfo!.brokers.map(b => ({
            label: <span style={{ marginRight: '20px' }}>
                <Tag color='default' style={{ marginRight: '8px', padding: '0 8px', pointerEvents: 'none' }}>{b.brokerId}</Tag>
                <code style={{ fontSize: 'small' }}>{b.address}</code>
                <span style={{ color: '#888', fontSize: 'smaller', marginLeft: '8px' }}>#{b.rack}</span>
            </span>,
            value: b.brokerId,
            broker: b,
        }));
        this.brokers.unshift({
            label: <span>
                <Tag color='default' style={{ marginRight: '8px', padding: '0 8px', pointerEvents: 'none' }}>*</Tag>
                <code style={{ fontSize: 'small' }}>Automatic</code>
            </span>,
            value: -1,
            broker: null,
        })

    }

    // Dropdown for a row (can be either a topicRow, or a partitionRow)
    brokerSelect(topicName: string, partitionId?: number) {
        return <Select
            style={{ width: '100%' }} placeholder="Select a broker"
            showSearch={true}
            mode="multiple"
            onChange={(value, option) => {
                console.log('on change broker: ', value, option);
                if (Array.isArray(value)) {
                    if ((value as any[]).includes(-1)) {
                        // automatic was selected,
                    }
                }
            }}
            onSelect={(value, option) => {

            }}
            filterOption={(input, option) => {
                const query = input.toLowerCase();
                const broker = (option as any)['broker'] as Broker | undefined;
                if (!broker) return true; // 'Automatic' entry

                if (broker.address)
                    if (broker.address.toLowerCase().includes(query)) return true;

                if (broker.rack)
                    if (('#' + String(broker.rack)).toLowerCase().includes(query)) return true;

                if (broker.brokerId == Number(query)) return true;

                return false;
            }}
            options={this.brokers}
        />
    }

    render() {
        if (!api.topics) return DefaultSkeleton;
        if (api.topicPartitions.size == 0) return <Empty />

        const columns: ColumnProps<PartitionAssignemnt>[] = [
            { width: undefined, title: 'Topic', dataIndex: 'topicName' },
            { width: '500px', title: 'Target Brokers', render: (_, record) => this.brokerSelect(record.topicName) },
            { width: '120px', title: 'Selected Partitions', render: (_, record) => `${record.selectedPartitionCount} / ${record.partitionCount}` },
        ]

        return <>
            <Table
                style={{ margin: '0', }} size={'middle'}
                dataSource={this.props.assignments}
                pagination={this.pageConfig}
                rowKey={r => r.topic.topicName}
                rowClassName={() => 'pureDisplayRow'}

                columns={columns}
            // expandable={{
            //     expandIconColumnIndex: 1,
            //     expandedRowRender: topic => topic.partitions
            //         ? 'todo'
            //         : <>Error loading partitions</>,
            //     // expandedRowClassName: r => 'noPadding',
            // }}
            />
        </>
    }


}


export default ReassignPartitions;
