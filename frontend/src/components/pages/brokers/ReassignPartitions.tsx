import React, { ReactNode, Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox, Steps, Button, message, Select, Tag, Popover } from "antd";
import { ColumnProps } from "antd/lib/table";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { Broker, Partition, PartitionReassignmentRequest, TopicAssignment, TopicDetail } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps, } from "../../../utils/animationProps";
import { observable, computed, autorun, IReactionDisposer, transaction, untracked } from "mobx";
import { prettyBytesOrNA } from "../../../utils/utils";
import { toJson } from "../../../utils/jsonUtils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import Icon, { CheckCircleOutlined, CheckSquareOutlined, ContainerOutlined, CrownOutlined, HddOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { DefaultSkeleton, ObjToKv, OptionGroup, TextInfoIcon } from "../../../utils/tsxUtils";
import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-v2-react";
import { stringify } from "query-string";
import { ElementOf } from "antd/lib/_util/type";
import { computeReassignments, PartitionAssignments, TopicPartitions } from "./reassignLogic";
const { Step } = Steps;

interface PartitionSelection { // Which partitions are selected?
    [topicName: string]: number[] // topicName -> array of partitionIds
}

interface WizardStep {
    step: number;
    title: string;
    icon: React.ReactElement;
    backButton?: string;
    nextButton: { text: string; isEnabled: (c: ReassignPartitions) => boolean | string };
}
const steps: WizardStep[] = [
    {
        step: 0, title: 'Select Partitions',
        icon: <UnorderedListOutlined />,
        nextButton: {
            text: 'Select Target Brokers',
            isEnabled: c => Object.keys(c.partitionSelection).length > 0
        }
    },
    {
        step: 1, title: 'Assign to Brokers',
        icon: <HddOutlined />,
        backButton: 'Select Partitions',
        nextButton: {
            text: 'Review Plan',
            isEnabled: c => {
                const partitions = Object.keys(c.partitionSelection).map(t => ({ topic: api.topics!.first(x => x.topicName == t)!, partitions: api.topicPartitions.get(t)! }));
                const maxRf = partitions.max(p => p.topic.replicationFactor);
                if (c.selectedBrokers.length >= maxRf)
                    return true;
                return `Select at least ${maxRf} brokers`;
            }
        }
    },
    {
        step: 2, title: 'Review and Confirm',
        icon: <CheckCircleOutlined />,
        backButton: 'Select Target Brokers',
        nextButton: {
            text: 'Start Reassignment',
            isEnabled: c => true,
        }
    },
];


// todo:
// - remove "skipping assignment key" in StepReview
// - remove default partition and broker selections

@observer
class ReassignPartitions extends PageComponent {
    pageConfig = makePaginationConfig(15, true);
    autorunHandle: IReactionDisposer | undefined = undefined;

    @observable currentStep = 1; // current page of the wizard

    @observable partitionSelection: PartitionSelection = {
        // "bons": [0, 1, 2, 3, 4, 5, 6, 7],
        // "re-test1-addresses": [0, 1],
        // "owlshop-orders": [0],
        "re-test1-addresses": [0], "re-test1-customers": [1], "re-test1-frontend-events": [2]

    }; // topics/partitions selected by user
    @observable selectedBrokers: number[] = [0, 1, 2]; // brokers selected by user
    @observable reassignmentRequest: PartitionReassignmentRequest | null = null; // request that will be sent

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
        // const partitionChance = 5 / 100;
        // autorun(() => {
        //     if (api.topics != null)
        //         transaction(() => {
        //             untracked(() => {
        //                 // clear
        //                 for (const t in this.partitionSelection)
        //                     delete this.partitionSelection[t];

        //                 // select random partitions
        //                 for (const t of api.topics!)
        //                     for (let p = 0; p < t.partitionCount; p++) {
        //                         if (Math.random() < partitionChance) {
        //                             const partitions = this.partitionSelection[t.topicName] ?? [];
        //                             partitions.push(p);
        //                             this.partitionSelection[t.topicName] = partitions;
        //                         }
        //                     }
        //             });
        //         });
        // }, { delay: 1000 });

        const oriOnNextPage = this.onNextPage.bind(this);
        this.onNextPage = () => transaction(oriOnNextPage);

        const oriOnPrevPage = this.onPreviousPage.bind(this);
        this.onPreviousPage = () => transaction(oriOnPrevPage);
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

        const partitionCountLeaders = api.topics.sum(t => t.partitionCount);
        const partitionCountOnlyReplicated = api.topics.sum(t => t.partitionCount * (t.replicationFactor - 1));

        const step = steps[this.currentStep];
        const nextButtonCheck = step.nextButton.isEnabled(this);
        const nextButtonEnabled = nextButtonCheck === true;
        const nextButtonHelp = typeof nextButtonCheck === 'string' ? nextButtonCheck as string : null;

        return <>
            <motion.div className="reassignPartitions" {...animProps} style={{ margin: '0 1rem', paddingBottom: '12em' }}>
                {/* Statistics */}
                <Card>
                    <Row>
                        <Statistic title='Broker Count' value={api.clusterInfo?.brokers.length} />
                        <Statistic title='Leader Partitions' value={partitionCountLeaders} />
                        <Statistic title='Replica Partitions' value={partitionCountOnlyReplicated} />
                        <Statistic title='Total Partitions' value={partitionCountLeaders + partitionCountOnlyReplicated} />
                    </Row>
                </Card>

                {/* Content */}
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
                            case 1: return <StepSelectBrokers brokers={this.selectedBrokers} />;
                            case 2: return <StepReview partitionSelection={this.partitionSelection} brokers={this.selectedBrokers} assignments={this.reassignmentRequest!} />;
                        }
                    })()} </motion.div>

                    {/* Navigation */}
                    <div style={{ margin: '2.5em 0 1.5em', display: 'flex', alignItems: 'center', height: '2.5em' }}>
                        {/* Back */}
                        {step.backButton &&
                            <Button
                                onClick={this.onPreviousPage}
                                disabled={this.currentStep <= 0}
                                style={{ minWidth: '12em', height: 'auto' }}
                            >
                                <span><ChevronLeftIcon /></span>
                                <span>{step.backButton}</span>
                            </Button>
                        }

                        {/* Next */}
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2em' }}>
                            <div>{nextButtonHelp}</div>
                            <Button
                                type='primary'
                                style={{ minWidth: '12em', height: 'auto', marginLeft: 'auto' }}
                                disabled={!nextButtonEnabled}
                                onClick={this.onNextPage}
                            >
                                <span>{step.nextButton.text}</span>
                                <span><ChevronRightIcon /></span>
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Debug */}
                <div style={{ margin: '2em 0 1em 0' }}>
                    <h2>Partition Selection</h2>
                    <div className='codeBox'>{toJson(this.partitionSelection)}</div>
                    <h2>Broker Selection</h2>
                    <div className='codeBox'>{toJson(this.selectedBrokers)}</div>
                    <h2>New Assignments</h2>
                    <div className='codeBox'>{toJson(this.reassignmentRequest, 4)}</div>
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
            const topicPartitions: TopicPartitions[] = this.selectedTopicPartitions;
            const targetBrokers = this.selectedBrokers.map(id => api.clusterInfo?.brokers.first(b => b.brokerId == id)!);
            if (targetBrokers.any(b => b == null))
                throw new Error('one or more broker ids could not be mapped to broker entries');

            const topicAssignments = computeReassignments(topicPartitions, api.clusterInfo!.brokers, targetBrokers);

            const topics = [];
            for (const t in topicAssignments) {
                const topicAssignment = topicAssignments[t];
                const partitions: { partitionId: number, replicas: number[] | null }[] = [];
                for (const partitionId in topicAssignment)
                    partitions.push({
                        partitionId: Number(partitionId),
                        replicas: topicAssignment[partitionId].brokers.map(b => b.brokerId)
                    });

                topics.push({ topicName: t, partitions: partitions });
            }
            this.reassignmentRequest = { topics: topics };
        }

        if (this.currentStep == 2) {
            // Review -> Start
            if (this.reassignmentRequest == null) {
                message.error('reassignment request was null', 3);
                return;
            }

            const msgKey = 'startingMessage';
            const hideMessage = message.loading({ content: 'Starting reassignment...', key: msgKey }, 1);

            api.startPartitionReassignment(this.reassignmentRequest).then(r => { }, err => { });

            return;
        }


        this.currentStep++;
    }

    @computed get selectedTopicPartitions(): TopicPartitions[] {
        const ar: TopicPartitions[] = [];
        for (const [topicName, partitions] of api.topicPartitions) {
            if (partitions == null) continue;
            if (this.partitionSelection[topicName] == null) continue;
            const topic = api.topics?.first(t => t.topicName == topicName);
            if (topic == null) continue;

            const relevantPartitions = partitions.filter(p => this.partitionSelection[topicName].includes(p.id));
            ar.push({ topic: topic, partitions: relevantPartitions }); // , allPartitions: partitions
        }
        return ar;
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

            <SelectedPartitionsInfo partitionSelection={this.props.partitionSelection} />

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
                        ? <SelectPartitionTable
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

        if (partitions.length == 0)
            delete this.props.partitionSelection[topic];
        else
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
class SelectPartitionTable extends Component<{
    topic: TopicDetail,
    topicPartitions: Partition[],
    setSelection: (topic: string, partition: number, isSelected: boolean) => void,
    isSelected: (topic: string, partition: number) => boolean,
    getSelectedPartitions: () => number[]
}> {
    partitionsPageConfig = makePaginationConfig(100, true);

    render() {
        const brokerTooltip = <div style={{ maxWidth: '380px', fontSize: 'smaller' }}>These are the brokerIDs this partitions replicas are assigned to.<br />The broker highlighted in blue is currently hosting/handling the leading partition, while the brokers shown in grey are hosting the partitions replicas.</div>

        return <div style={{ paddingTop: '4px', paddingBottom: '8px', width: 0, minWidth: '100%' }}>
            <Table size='small' className='nestedTable'
                dataSource={this.props.topicPartitions}
                pagination={this.partitionsPageConfig}
                scroll={{ y: '300px' }}
                rowKey={r => r.id}
                rowSelection={{
                    type: 'checkbox',
                    columnWidth: '43px',
                    columnTitle: <></>, // don't show "select all" checkbox
                    selectedRowKeys: this.props.getSelectedPartitions().slice(),
                    onSelect: (record, selected: boolean, selectedRows) => {
                        this.props.setSelection(this.props.topic.topicName, record.id, selected);
                    },
                }}
                columns={[
                    { width: 100, title: 'Partition', dataIndex: 'id', sortOrder: 'ascend', sorter: (a, b) => a.id - b.id },
                    {
                        width: undefined, title: 'Brokers', render: (v, record,) =>
                            <BrokerList brokerIds={record.replicas} leaderId={record.leader} />
                    },
                ]}
            />
        </div>
    }
}



@observer
class StepSelectBrokers extends Component<{ brokers: number[] }> {
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
                <p>Choose the target brokers to move the selected partitions to. Some brokers might not get any current assignments  Some brokers might  some partitions will be moved to these brokers, but Kowl will consider them as desired targets and distribute partitions across the available racks of the selected target brokers.</p>
            </div>

            <Table
                style={{ margin: '0', }} size='middle'
                dataSource={this.brokers}
                columns={columns}
                pagination={this.pageConfig}
                rowKey='brokerId'
                rowClassName={() => 'pureDisplayRow'}
                rowSelection={{
                    type: 'checkbox',
                    selectedRowKeys: this.props.brokers.slice(),
                    onChange: (keys, values) => {
                        transaction(() => {
                            this.props.brokers.splice(0);
                            for (const broker of values)
                                this.props.brokers.push(broker.brokerId);
                        })
                    }
                }}
            />
        </>
    }


}



@observer
class StepReview extends Component<{ partitionSelection: PartitionSelection, brokers: number[], assignments: PartitionReassignmentRequest }> {
    pageConfig = makePaginationConfig(15, true);

    render() {
        if (!api.topics) return DefaultSkeleton;
        if (api.topicPartitions.size == 0) return <Empty />

        const selectedPartitions = this.selectedPartitions;
        if (selectedPartitions == null) return <>topics not loaded</>;

        const columns: ColumnProps<ElementOf<typeof selectedPartitions>>[] = [
            {
                width: undefined, title: 'Topic', dataIndex: 'topicName', defaultSortOrder: 'ascend',
                // filtered: true, filteredValue: ['owlshop'], onFilter: (value, record) => record.topicName.toLowerCase().includes(String(value).toLowerCase()),
            },
            {
                width: '50%', title: 'Brokers Before',
                render: (v, r) => <BrokerList brokerIds={r.selectedPartitions.flatMap(p => p.replicas)} />
            },
            {
                width: '50%', title: 'Brokers After',
                render: (v, r) => <BrokerList brokerIds={this.props.assignments.topics.first(t => t.topicName == r.topicName)!.partitions.flatMap(p => p.replicas!) ?? []} />
            },
            {
                width: 100, title: (p) => <TextInfoIcon text="Moves" info="The number of replicas that will be moved to a different broker." maxWidth='200px' />,
                render: (v, r) => {
                    // How many replicas are actually moved?
                    // 1. assume all replicas are moved
                    let moves = r.selectedPartitions.sum(p => p.replicas.length);

                    // 2. go through each partition, subtract replicas that stay on their broker
                    for (const p of r.selectedPartitions) {
                        const newAssignments = this.props.assignments.topics.first(t => t.topicName == r.topicName);
                        const newBrokers = newAssignments?.partitions.first(p => p.partitionId == p.partitionId);
                        if (newBrokers?.replicas)
                            moves -= p.replicas.intersection(newBrokers.replicas).length;
                    }
                    return moves;
                },
            },
            {
                width: 120, title: 'Estimated Traffic', dataIndex: 'logDirSize',
                render: (v, r) => {
                    // 1. assume all replicas are moved
                    let size = r.selectedPartitions.sum(p => p.replicaSize * p.replicas.length);
                    if (size == 0) return 0;

                    // 2. go through each partition, subtract replicas that stay on their broker
                    for (const p of r.selectedPartitions) {
                        const newAssignments = this.props.assignments.topics.first(t => t.topicName == r.topicName);
                        const newBrokers = newAssignments?.partitions.first(p => p.partitionId == p.partitionId);
                        if (newBrokers?.replicas) {
                            const unmovedReplicas = p.replicas.intersection(newBrokers.replicas).length;
                            size -= p.replicaSize * unmovedReplicas;
                        }
                    }
                    return prettyBytesOrNA(size);
                }
            },
        ]

        return <>
            <div style={{ margin: '2em 1em' }}>
                <h2>Review</h2>
                <p>Review the plan Kowl computed to distribute the selected partitions onto the selected brokers.</p>
            </div>

            <SelectedPartitionsInfo partitionSelection={this.props.partitionSelection} />

            <Table
                style={{ margin: '0', }} size={'middle'}
                pagination={this.pageConfig}
                dataSource={selectedPartitions}
                rowKey={r => r.topicName}
                rowClassName={() => 'pureDisplayRow'}
                columns={columns}
                expandable={{
                    expandIconColumnIndex: 0,
                    expandRowByClick: true,
                    expandedRowRender: topic => topic.selectedPartitions
                        ? <ReviewPartitionTable
                            topic={topic.topic}
                            topicPartitions={topic.selectedPartitions}
                            assignments={this.props.assignments.topics.first(t => t.topicName == topic.topicName)!}
                        />
                        : <>Error loading partitions</>,
                    // expandedRowClassName: r => 'noPadding',
                }}
            />
        </>
    }

    @computed get selectedPartitions(): { topicName: string; topic: TopicDetail, allPartitions: Partition[], selectedPartitions: Partition[] }[] {
        const ar = [];
        for (const [topicName, partitions] of api.topicPartitions) {
            if (partitions == null) continue;
            if (this.props.partitionSelection[topicName] == null) continue;
            const topic = api.topics?.first(t => t.topicName == topicName);
            if (topic == null) continue;

            const relevantPartitions = partitions.filter(p => this.props.partitionSelection[topicName].includes(p.id));
            ar.push({ topicName: topicName, topic: topic, selectedPartitions: relevantPartitions, allPartitions: partitions });
        }
        return ar;
    }
}

@observer
class ReviewPartitionTable extends Component<{ topic: TopicDetail, topicPartitions: Partition[], assignments: TopicAssignment }> {
    partitionsPageConfig = makePaginationConfig(100, true);
    brokerTooltip = <div style={{ maxWidth: '380px', fontSize: 'smaller' }}>
        These are the brokers this partitions replicas are assigned to.<br />
        The broker highlighted in blue is currently hosting/handling the leading partition, while the brokers shown in grey are hosting the partitions replicas.
        </div>;

    render() {

        return <div style={{ paddingTop: '4px', paddingBottom: '8px', width: 0, minWidth: '100%' }}>
            <Table size='small' className='nestedTable'
                dataSource={this.props.topicPartitions}
                pagination={this.partitionsPageConfig}
                scroll={{ y: '300px' }}
                rowKey={r => r.id}
                columns={[
                    { width: 120, title: 'Partition', dataIndex: 'id' },
                    {
                        width: undefined, title: 'Brokers Before',
                        render: (v, record) => <BrokerList brokerIds={record.replicas} leaderId={record.leader} />
                    },
                    {
                        width: undefined, title: 'Brokers After',
                        render: (v, record) => {
                            const partitionAssignments = this.props.assignments.partitions.first(p => p.partitionId == record.id);
                            if (partitionAssignments == null || partitionAssignments.replicas == null) return '??';
                            return <BrokerList brokerIds={partitionAssignments.replicas} />
                        }
                    },
                ]}
            />
        </div>
    }
}


class BrokerList extends Component<{ brokerIds: number[], leaderId?: number, addedIds?: number[], removedIds?: number[], tooltip?: JSX.Element }> {
    render() {
        const { leaderId, addedIds, removedIds } = this.props;
        const ids = this.props.brokerIds.distinct().sort((a, b) => a - b);

        const tags = ids.map(id => {
            let color = undefined;
            // if (id === leaderId) color = "hsl(209deg, 50%, 60%)";
            if (addedIds?.includes(id)) color = "green";
            else if (removedIds?.includes(id)) color = "red";

            return <Tag key={id} color={color} >{id.toString()}</Tag>
        });

        if (this.props.tooltip == null) return <span className='brokerTagList'>{tags}</span>

        return (
            <Popover title="Brokers" content={this.props.tooltip} placement="right" trigger="click">
                <span style={{ cursor: 'pointer' }}>
                    <span className='brokerTagList' style={{ pointerEvents: 'none' }} >{tags}</span>
                </span>
            </Popover>
        )
    }
}

@observer
class SelectedPartitionsInfo extends Component<{ partitionSelection: PartitionSelection }> {

    render() {
        if (api.topicPartitions == null) return null;

        const allPartitions = this.selectedPartitions.flatMap(p => p.partitions);
        const partitionCountLeaders = allPartitions.length;
        const partitionCountOnlyReplicated = allPartitions.sum(t => t.replicas.length);

        const brokers = this.involvedBrokers;

        const data = [
            { title: 'Leader Partitions', value: partitionCountLeaders },
            { title: 'Replica Partitions', value: partitionCountOnlyReplicated },
            { title: 'Involved Topics', value: this.selectedPartitions.length },
            { title: 'Involved Brokers', value: brokers?.length ?? '...' },
            { title: 'Involved Racks', value: brokers?.map(b => b.rack).distinct().length ?? '...' },
            { title: 'Size', value: "TODO" }, // allPartitions.sum(p => p.id)
        ];

        return <div style={{ margin: '2em 1em 1em 1em' }}>
            <h3>Current Selection</h3>
            <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '3em', fontFamily: 'Open Sans', color: 'hsl(0deg, 0%, 30%)', fontSize: '1.1em' }}>
                {data.map(item => <div key={item.title}>
                    <div style={{ fontSize: '.8em', opacity: 0.6, paddingBottom: '.5em' }}>{item.title}</div>
                    <div style={{}}>{item.value}</div>
                </div>)}
            </div>
        </div>
    }

    @computed get selectedPartitions(): { topic: string; partitions: Partition[]; }[] {
        const ar = [];
        for (const [topic, partitions] of api.topicPartitions) {
            if (partitions == null) continue;
            if (this.props.partitionSelection[topic] == null) continue;

            const relevantPartitions = partitions.filter(p => this.props.partitionSelection[topic].includes(p.id));
            ar.push({ topic: topic, partitions: relevantPartitions });
        }
        return ar;
    }

    @computed get involvedBrokers(): Broker[] | null {
        if (api.clusterInfo == null) return null;
        const brokerIds = new Set<number>();

        // Find IDs of all involved brokers
        for (const t of this.selectedPartitions) {
            for (const p of t.partitions) {
                brokerIds.add(p.leader);
                for (const id of p.replicas)
                    brokerIds.add(id);
            }
        }

        // Translate to Broker info
        return api.clusterInfo.brokers.filter(b => brokerIds.has(b.brokerId));
    }
}

export default ReassignPartitions;
