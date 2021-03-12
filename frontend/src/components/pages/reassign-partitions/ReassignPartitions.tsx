import React, { ReactNode, Component } from "react";
import { observer } from "mobx-react";
import { Table, Statistic, Row, Skeleton, Checkbox, Steps, Button, message, Select, notification } from "antd";
import { PageComponent, PageInitHelper } from "../Page";
import { api } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { Broker, Partition, PartitionReassignmentRequest, TopicAssignment, Topic, ConfigResourceType, AlterConfigOperation } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps, } from "../../../utils/animationProps";
import { observable, computed, autorun, IReactionDisposer, transaction, untracked } from "mobx";
import { toJson } from "../../../utils/jsonUtils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import Icon, { CheckCircleOutlined, CheckSquareOutlined, ContainerOutlined, CrownOutlined, HddOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { DefaultSkeleton, ObjToKv, OptionGroup } from "../../../utils/tsxUtils";
import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-v2-react";
import { stringify } from "query-string";
import { StepSelectBrokers } from "./Step2.Brokers";
import { BrokerList } from "./components/BrokerList";
import { IndeterminateCheckbox } from "./components/IndeterminateCheckbox";
import { SelectPartitionTable, StepSelectPartitions } from "./Step1.Partitions";
import { PartitionWithMoves, StepReview, TopicWithMoves } from "./Step3.Review";
import { ApiData, computeReassignments, TopicPartitions } from "./logic/reassignLogic";
import { computeMovedReplicas, partitionSelectionToTopicPartitions } from "./logic/utils";
const { Step } = Steps;

export interface PartitionSelection { // Which partitions are selected?
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
                if (partitions.any(p => p.partitions == null || p.topic == null)) return false;
                const maxRf = partitions.max(p => p.topic.replicationFactor);
                if (c.selectedBrokerIds.length >= maxRf)
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

    // topics/partitions selected by user
    @observable partitionSelection: PartitionSelection = {
        // "bons": [0, 1, 2, 3, 4, 5, 6, 7],
        // "re-test1-addresses": [0, 1],
        // "owlshop-orders": [0],
        "re-test1-frontend-events": [0, 1, 2, 3, 4, 5] // 117MB
    };
    // brokers selected by user
    @observable selectedBrokerIds: number[] = [0, 1, 2];
    // computed reassignments
    @observable reassignmentRequest: PartitionReassignmentRequest | null = null; // request that will be sent

    @observable _debug_apiData: ApiData | null = null;
    @observable _debug_topicPartitions: TopicPartitions[] | null = null;
    @observable _debug_brokers: Broker[] | null = null;

    maxReplicaTraffic: number = 1000 * 1000 * 10;


    initPage(p: PageInitHelper): void {
        p.title = 'Reassign Partitions';
        p.addBreadcrumb('Reassign Partitions', '/reassign-partitions');

        appGlobal.onRefresh = () => this.refreshData(true);
        this.refreshData(true);

        this.autorunHandle = autorun(() => {
            if (api.topics != null)
                api.refreshPartitionsForAllTopics(false);
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
        api.refreshCluster(force);
        api.refreshClusterConfig(force);
        api.refreshTopics(force);
        api.refreshPartitionsForAllTopics(force);
        api.refreshPartitionReassignments(force);
    }

    componentWillUnmount() {
        if (this.autorunHandle) {
            this.autorunHandle();
            this.autorunHandle = undefined;
        }
    }

    render() {
        if (!api.clusterInfo) return DefaultSkeleton;
        if (api.clusterConfig === undefined) return DefaultSkeleton;
        if (!api.topics) return DefaultSkeleton;
        if (api.topicPartitions.size < api.topics.length) return DefaultSkeleton;
        if (api.partitionReassignments === undefined) return DefaultSkeleton;

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
                            case 0: return <StepSelectPartitions
                                partitionSelection={this.partitionSelection} />;
                            case 1: return <StepSelectBrokers
                                partitionSelection={this.partitionSelection}
                                selectedBrokerIds={this.selectedBrokerIds} />;
                            case 2: return <StepReview
                                partitionSelection={this.partitionSelection}
                                topicsWithMoves={this.topicsWithMoves}
                                assignments={this.reassignmentRequest!}
                                setMaxReplicaTraffic={(limit) => this.maxReplicaTraffic = limit} />;
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
                {/* <div style={{ margin: '2em 0 1em 0', display: 'flex', flexWrap: 'wrap', gap: '3em' }}>
                    <div>
                        <h2>Partition Selection</h2>
                        <div className='codeBox'>{toJson(this.partitionSelection, 4)}</div>
                    </div>

                    <div>
                        <h2>Broker Selection</h2>
                        <div className='codeBox'>{toJson(this.selectedBrokerIds)}</div>
                    </div>

                    {
                    // <div>
                    //    <h2>Api Data</h2>
                    //    <div className='codeBox'>{toJson(this._debug_apiData, 4)}</div>
                    //</div>
                    }

                    <div>
                        <h2>Computed Assignments</h2>
                        <div className='codeBox'>{toJson(this.reassignmentRequest, 4)}</div>
                    </div>
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
            const topicPartitions: TopicPartitions[] = this.selectedTopicPartitions;
            const targetBrokers = this.selectedBrokerIds.map(id => api.clusterInfo?.brokers.first(b => b.brokerId == id)!);
            if (targetBrokers.any(b => b == null))
                throw new Error('one or more broker ids could not be mapped to broker entries');

            // error checking will happen inside computeReassignments
            const apiData = {
                brokers: api.clusterInfo!.brokers,
                topics: api.topics as Topic[],
                topicPartitions: api.topicPartitions as Map<string, Partition[]>
            };

            const topicAssignments = computeReassignments(
                apiData,
                topicPartitions,
                targetBrokers
            );

            this._debug_apiData = apiData;
            this._debug_topicPartitions = topicPartitions;
            this._debug_brokers = targetBrokers;

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
            const request = this.reassignmentRequest;
            if (request == null) {
                message.error('reassignment request was null', 3);
                return;
            }

            setImmediate(async () => {
                const configKey = 'msgConfig';
                const raKey = 'msgReassignment';

                if (this.maxReplicaTraffic > 0) {
                    const hideMessage = message.loading({ content: 'Setting broker configuration...', key: configKey }, 0);
                    try {
                        const changeConfigResponse = await api.changeConfig({
                            resources: [
                                {
                                    // Set throttle value
                                    resourceType: ConfigResourceType.Broker,
                                    resourceName: "", // String(brokerId) // omit = all brokers
                                    configs: [
                                        { name: 'leader.replication.throttled.rate', op: AlterConfigOperation.Set, value: String(this.maxReplicaTraffic) },
                                        { name: 'follower.replication.throttled.rate', op: AlterConfigOperation.Set, value: String(this.maxReplicaTraffic) },
                                    ]
                                },
                                {
                                    // Set which topics to throttle
                                    resourceType: ConfigResourceType.Topic,
                                    resourceName: "re-test1-frontend-events",
                                    configs: [
                                        // [partitionId]-[replicaId],[partitionId]-[replica-id]...
                                        { name: 'leader.replication.throttled.replicas', op: AlterConfigOperation.Set, value: "*" },
                                        { name: 'follower.replication.throttled.replicas', op: AlterConfigOperation.Set, value: "*" },
                                        // { name: 'leader.replication.throttled.replicas', op: AlterConfigOperation.Append, value: "*" },
                                        // { name: 'follower.replication.throttled.replicas', op: AlterConfigOperation.Append, value: "*" },
                                    ]
                                },
                            ]
                        });

                        if (changeConfigResponse.patchedConfigs.any(r => r.error != null))
                            throw new Error("Errors while setting config: " + toJson(changeConfigResponse.patchedConfigs.filter(r => r.error != null)));

                        message.success({
                            content: "Bandwidth limit set successfully",
                            key: configKey,
                            duration: 3,
                        })
                    } catch (err) {
                        hideMessage();
                        notification.error({
                            message: "Error setting broker configuration:\n" + String(err),
                            duration: 0, // don't close automatically
                        });
                        return;
                    }
                }


                const hideMessage = message.loading({ content: 'Starting reassignment...', key: raKey }, 0);
                try {
                    await api.startPartitionReassignment(request);
                    message.success({
                        content: "Reassignment started successfully",
                        key: raKey,
                        duration: 3,
                    })
                } catch (err) {
                    hideMessage();
                    notification.error({
                        message: "Error starting partition reassignment:\n" + String(err),
                        duration: 0, // don't close automatically
                    });
                }
            })

            return;
        }


        this.currentStep++;
    }

    onPreviousPage() {
        this.currentStep--;
    }

    @computed get selectedTopicPartitions(): TopicPartitions[] {
        return partitionSelectionToTopicPartitions(
            this.partitionSelection,
            api.topicPartitions,
            api.topics!
        );
    }
    @computed get topicsWithMoves(): TopicWithMoves[] {
        if (this.reassignmentRequest == null) return [];
        if (api.topics == null) return [];
        return computeMovedReplicas(
            this.partitionSelection,
            this.reassignmentRequest,
            api.topics,
            api.topicPartitions,
        );
    }

}
export default ReassignPartitions;





