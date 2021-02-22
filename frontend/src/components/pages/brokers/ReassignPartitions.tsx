import React, { ReactNode, Component } from "react";
import { observer } from "mobx-react";
import { Empty, Table, Statistic, Row, Skeleton, Checkbox, Steps, Button, message, Select, Tag, Popover } from "antd";
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
import Icon, { CheckCircleOutlined, CheckSquareOutlined, ContainerOutlined, CrownOutlined, HddOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { DefaultSkeleton, ObjToKv, OptionGroup } from "../../../utils/tsxUtils";
import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-v2-react";
import { stringify } from "query-string";
import { ElementOf } from "antd/lib/_util/type";
const { Step } = Steps;

interface PartitionSelection { // Which partitions are selected?
    [topicName: string]: number[] // topicName -> array of partitionIds
}

interface PartitionAssignments { // Where does each partitions go?
    [topicName: string]: { partition: Partition, broker: Broker }[]
}

interface WizardStep {
    step: number;
    title: string;
    icon: React.ReactElement;
    backButton?: string;
    nextButton: { text: string; isEnabled: (c: ReassignPartitions) => boolean };
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
            isEnabled: c => c.selectedBrokers.length > 0
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

    @observable currentStep = 2; // current page of the wizard

    @observable partitionSelection: PartitionSelection = {
        "bons": [0, 1, 2, 3, 4, 5, 6, 7],
        "owlshop-frontend-events": [3, 4, 5, 6, 7],
    }; // topics/partitions selected by user
    @observable selectedBrokers: number[] = [0, 2]; // brokers selected by user
    @observable assignments: PartitionAssignments = {}; // computed partition to broker assignments


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
                            case 2: return <StepReview partitionSelection={this.partitionSelection} brokers={this.selectedBrokers} assignments={this.assignments} />;
                        }
                    })()} </motion.div>

                    {/* Navigation */}
                    <div style={{ margin: '2.5em 0 1.5em', display: 'flex', height: '2.5em' }}>
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
                        {
                            <Button
                                type='primary'
                                style={{ minWidth: '12em', height: 'auto', marginLeft: 'auto' }}
                                disabled={!step.nextButton.isEnabled(this)}
                                onClick={this.onNextPage}
                            >
                                <span>{step.nextButton.text}</span>
                                <span><ChevronRightIcon /></span>
                            </Button>
                        }
                    </div>
                </Card>

                {/* Debug */}
                {/* <div style={{ margin: '2em 0 1em 0' }}>
                    <h2>Partitions</h2>
                    <div className='codeBox'>{toJson(this.partitionSelection)}</div>
                    <h2>Brokers</h2>
                    <div className='codeBox'>{toJson(this.selectedBrokers)}</div>
                </div> */}
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
        const brokerTooltip = <div style={{ maxWidth: '380px', fontSize: 'smaller' }}>These are the brokerIDs this partition and its replicas are assigned to.<br />The broker highlighted in blue is currently hosting/handling the leading partition, while the brokers shown in grey are hosting the partitions replicas.</div>

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
                            <BrokerList brokerIds={record.replicas} leaderId={record.leader} tooltip={brokerTooltip} />
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
                <p>Choose at least one target broker to move the selected partitions to. This does not necessarily guarantee that all seelcted partitions will be moved to these brokers, but Kowl will consider them as desired targets and distribute partitions across the available racks of the selected target brokers.</p>
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
class StepReview extends Component<{ partitionSelection: PartitionSelection, brokers: number[], assignments: PartitionAssignments }> {
    pageConfig = makePaginationConfig(15, true);

    constructor(props: any) {
        super(props);

        if (api.clusterInfo == null) {
            console.log('cannot recompute assignments, clusterInfo is not available');
            return;
        }

        // Questions:
        // - primaries and replicas must not be assigned to same broker
        //   but how can i control what broker a replica is assigned to at all??
        //      -> erster eintrag ausm array ist der leader
        //      -> aber komplett egal wo primary landet, kafka rebalanced die leader alle 5min sowieso selber
        // - how to distribute across racks?
        //   just take different racks, all the time, and when we find a broker in the same rack again,
        //   try using a different broker within the same rack (if there is one)?
        //
        // - rewrite: "target brokers" info text, it means: "not all brokers will neccesarily be used", not "kowl might use brokers that were not selected"

        // - 1. optimize: racks first!
        // - 2. optimize: anzahl der partitions auf dem broker (need to get all topics, all their partitions to even know what broker has how many partitions)
        // - 3. optimize: used disk space

        // -  . optimize: network traffic optimization as well? how?
        //                that means optmizing to "inter rack" (bc that traffic is mostly free)
        //   - "unassign" all replicas, subtracing used disk space from that broker
        //   - assign from a fresh start: assign (preferably) to the original broker, or to a broker in the same rack, or

        /* Example for traffic cost
            topicA: replicationFactor=3

            # BD PRD
            rackA: 0, 1
            rackB:  2, 3

            # Cluster expanded with more brokers:
            rackA: 4
            rackB: 5
            rackC: 6

            replicas should end up evenly distributed across all racks
            BUT:
                0 -> 4
                2 -> 5
                1 -> 6 (unavoidable, )



            Example 2:
            bd prd
            Topic A: replicationFactor=2 (currently on brokers 0,2)
            rackA: 0, 1
            rackB: 2, 3

            move to new brokers
            rackA: 4   (10k partitions)
            rackB: 5   (0 partitions)
            rackC: 6   (0 partitions)
            - 2 to 5


            Unit Tests:
            - convert the examples above, because every replica is assigned to one broker
        */


        console.log('recomputing assignments...');
        const { partitionSelection, assignments, brokers: selectedBrokers } = this.props;

        // Clear current assignments
        for (const k in assignments)
            if (typeof assignments[k] === 'object' && Array.isArray(assignments[k])) {
                console.log('deleting assignment key', { key: k, value: assignments[k] });
                delete assignments[k];
            }
            else {
                console.log('skipping assignment key', { key: k, value: assignments[k] })
            }

        // Go through each topic, get "relevant" brokers (those that were selected),
        // distribute partitions across those brokers (trying to use the available racks as evenly as possible?)
        for (const topicName in partitionSelection) {
            const partitionIds = partitionSelection[topicName];
            const brokers = api.clusterInfo.brokers.filter(b => selectedBrokers.includes(b.brokerId));
            if (brokers.length == 0) {
                console.log('no brokers available (after filtering all unselected brokers), skipping assignemnts for this topic', { topic: topicName, allBrokers: api.clusterInfo.brokers, selectedBrokers: selectedBrokers });
                continue;
            }

            const topicPartitions = api.topicPartitions.get(topicName);
            if (topicPartitions == null) {
                console.log('topic partitions are missing, skipping partitions assignemnts for this topic', { topic: topicName });
                continue;
            }

            for (const partitionId of partitionIds) {
                const partition = topicPartitions.first(p => p.id == partitionId);
                if (partition == null) {
                    console.log('partition not found, skipping assignment', { topic: topicName, partitionId: partitionId, topicPartitions: topicPartitions });
                    continue;
                }

                // todo: this should be a function that returns the "best" broker from 'brokers'
                //       it should try filtering more and more (by rack, logDirSize, estimated traffic, ...).
                //       when a filter
                // const broker = ;

                // assignments[topicName].push({ partition: partition, broker: broker });
            }

        }

        console.log('recomputing assignments done', { topics: Object.keys(assignments).length });
    }

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
                width: 100, title: 'Partitions', dataIndex: 'selectedPartitions',
                render: (v) => v.length
            },
            {
                width: '50%', title: 'Brokers Before',
                render: (v, r) => <BrokerList brokerIds={r.allPartitions.flatMap(p => p.replicas)} />
            },
            {
                width: '50%', title: 'Brokers After',
                render: (v, r) => <BrokerList brokerIds={this.props.assignments[r.topicName]?.map(a => a.broker.brokerId) ?? []} />
            },
            {
                width: 120, title: 'Estimated Traffic', dataIndex: 'logDirSize',
                render: v => '?'
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
                    expandedRowRender: topic => topic.selectedPartitions
                        ? <ReviewPartitionTable
                            topic={topic.topic}
                            topicPartitions={topic.selectedPartitions}
                            assignments={this.props.assignments}
                        />
                        : <>Error loading partitions</>,
                    // expandedRowClassName: r => 'noPadding',
                }}
            />
        </>
    }

    @computed get selectedPartitions(): { topicName: string; topic: TopicDetail, selectedPartitions: Partition[], allPartitions: Partition[] }[] {
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

    // @computed get finalAssignments(): PartitionAssignments {
    //     return this.props.assignments;
    // }
}

@observer
class ReviewPartitionTable extends Component<{ topic: TopicDetail, topicPartitions: Partition[], assignments: PartitionAssignments }> {
    partitionsPageConfig = makePaginationConfig(100, true);
    brokerTooltip = <div style={{ maxWidth: '380px', fontSize: 'smaller' }}>
        These are the brokers this partition and its replicas are assigned to.<br />
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
                    { width: 100, title: 'Partition', dataIndex: 'id', sorter: (a, b) => a.id - b.id, defaultSortOrder: 'ascend', },
                    {
                        width: undefined, title: 'Brokers Before',
                        render: (v, record) => <BrokerList brokerIds={record.replicas} leaderId={record.leader} />
                    },
                    {
                        width: undefined, title: 'Brokers After',
                        render: (v, record) => {
                            const brokersForPartition = this.props.assignments[this.props.topic.topicName];
                            if (brokersForPartition == null) return '??';
                            return <BrokerList brokerIds={[]} />
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
            if (id === leaderId) color = "hsl(209deg, 50%, 60%)";
            else if (addedIds?.includes(id)) color = "green";
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
