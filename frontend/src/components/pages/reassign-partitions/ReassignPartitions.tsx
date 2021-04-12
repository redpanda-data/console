import React, { ReactNode, Component } from "react";
import { observer } from "mobx-react";
import { Table, Statistic, Row, Skeleton, Checkbox, Steps, Button, message, Select, notification, ConfigProvider, Modal } from "antd";
import { PageComponent, PageInitHelper } from "../Page";
import { api, partialTopicConfigs } from "../../../state/backendApi";
import { uiSettings } from "../../../state/ui";
import { makePaginationConfig, sortField } from "../../misc/common";
import { Broker, Partition, PartitionReassignmentRequest, TopicAssignment, Topic, ConfigResourceType, AlterConfigOperation, PatchConfigsRequest, ResourceConfig } from "../../../state/restInterfaces";
import { motion } from "framer-motion";
import { animProps, } from "../../../utils/animationProps";
import { observable, computed, autorun, IReactionDisposer, transaction, untracked } from "mobx";
import { clone, toJson } from "../../../utils/jsonUtils";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import Icon, { CheckCircleOutlined, CheckSquareOutlined, ContainerOutlined, CrownOutlined, ExclamationCircleOutlined, HddOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { DefaultSkeleton, ObjToKv, OptionGroup } from "../../../utils/tsxUtils";
import { ChevronLeftIcon, ChevronRightIcon } from "@primer/octicons-v2-react";
import { stringify } from "query-string";
import { StepSelectBrokers } from "./Step2.Brokers";
import { BrokerList } from "./components/BrokerList";
import { IndeterminateCheckbox } from "./components/IndeterminateCheckbox";
import { SelectPartitionTable, StepSelectPartitions } from "./Step1.Partitions";
import { PartitionWithMoves, StepReview, TopicWithMoves } from "./Step3.Review";
import { ApiData, computeReassignments, TopicPartitions } from "./logic/reassignLogic";
import { computeMovedReplicas, partitionSelectionToTopicPartitions, removeRedundantReassignments, topicAssignmentsToReassignmentRequest } from "./logic/utils";
import { IsDev } from "../../../utils/env";
import { Message } from "../../../utils/utils";
import { ActiveReassignments } from "./components/ActiveReassignments";
import { ReassignmentTracker } from "./logic/reassignmentTracker";
const { Step } = Steps;

export interface PartitionSelection { // Which partitions are selected?
    [topicName: string]: number[] // topicName -> array of partitionIds
}


const reassignmentTracker = new ReassignmentTracker();
export { reassignmentTracker };


@observer
class ReassignPartitions extends PageComponent {
    pageConfig = makePaginationConfig(15, true);

    @observable currentStep = 0; // current page of the wizard

    // topics/partitions selected by user
    @observable partitionSelection: PartitionSelection = {
        // "weeco-frontend-events": [0, 1, 2, 3, 4, 5] // 3.56gb
    };
    // brokers selected by user
    @observable selectedBrokerIds: number[] = [];
    // computed reassignments
    @observable reassignmentRequest: PartitionReassignmentRequest | null = null; // request as returned by the computation
    // @observable optimizedReassignmentRequest: PartitionReassignmentRequest | null = null; // optimized request that will be sent

    @observable _debug_apiData: ApiData | null = null;
    @observable _debug_topicPartitions: TopicPartitions[] | null = null;
    @observable _debug_brokers: Broker[] | null = null;

    refreshTopicConfigsTimer: NodeJS.Timer | null = null;
    refreshTopicConfigsRequestsInProgress: number = 0;

    @observable topicsWithThrottle: string[] = [];

    @observable requestInProgress = false;

    initPage(p: PageInitHelper): void {
        p.title = 'Reassign Partitions';
        p.addBreadcrumb('Reassign Partitions', '/reassign-partitions');

        appGlobal.onRefresh = () => this.refreshData(true);
        this.refreshData(true);
    }

    componentDidMount() {
        this.removeThrottleFromTopics = this.removeThrottleFromTopics.bind(this);

        const oriOnNextPage = this.onNextPage.bind(this);
        this.onNextPage = () => transaction(oriOnNextPage);

        const oriOnPrevPage = this.onPreviousPage.bind(this);
        this.onPreviousPage = () => transaction(oriOnPrevPage);

        this.startRefreshingTopicConfigs = this.startRefreshingTopicConfigs.bind(this);
        this.stopRefreshingTopicConfigs = this.stopRefreshingTopicConfigs.bind(this);

        this.refreshTopicConfigs = this.refreshTopicConfigs.bind(this);
        this.refreshTopicConfigs();
        this.startRefreshingTopicConfigs();


        reassignmentTracker.start();
    }

    refreshData(force: boolean) {
        api.refreshCluster(force); // need to know brokers for reassignment calculation
        api.refreshClusterConfig(force); // used to display throttle traffic limit
        api.refreshTopics(force);
        api.refreshPartitions('all', force);
        api.refreshPartitionReassignments(force);
    }

    componentWillUnmount() {
        reassignmentTracker.stop();

        this.stopRefreshingTopicConfigs();
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

                {/* Active Reassignments */}
                <Card>
                    <ActiveReassignments
                        throttledTopics={this.topicsWithThrottle}
                        onRemoveThrottleFromTopics={this.removeThrottleFromTopics}
                    />
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
                                partitionSelection={this.partitionSelection}
                                throttledTopics={this.topicsWithThrottle}
                            />;
                            case 1: return <StepSelectBrokers
                                partitionSelection={this.partitionSelection}
                                selectedBrokerIds={this.selectedBrokerIds} />;
                            case 2: return <StepReview
                                partitionSelection={this.partitionSelection}
                                topicsWithMoves={this.topicsWithMoves}
                                assignments={this.reassignmentRequest!}
                                reassignPartitions={this} />;
                        }
                    })()} </motion.div>

                    {/* Navigation */}
                    <div style={{ margin: '2.5em 0 1.5em', display: 'flex', alignItems: 'center', height: '2.5em' }}>
                        {/* Back */}
                        {step.backButton &&
                            <Button
                                onClick={this.onPreviousPage}
                                disabled={this.currentStep <= 0 || this.requestInProgress}
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
                                disabled={!nextButtonEnabled || this.requestInProgress}
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


            this.reassignmentRequest = topicAssignmentsToReassignmentRequest(topicAssignments);
            // const optimizedAssignments = removeRedundantReassignments(topicAssignments, apiData);
            // this.optimizedReassignmentRequest = topicAssignmentsToReassignmentRequest(optimizedAssignments);
        }

        if (this.currentStep == 2) {
            // Review -> Start
            const request = this.reassignmentRequest;
            if (request == null) {
                message.error('reassignment request was null', 3);
                return;
            }

            setImmediate(async () => {
                try {
                    this.requestInProgress = true;
                    // todo: Don't use returns and execeptions for control flow
                    const success = await this.startReassignment(request);
                    if (success) {
                        // Reset settings, go back to first page
                        transaction(() => {
                            this.refreshData(true);
                            this.partitionSelection = {};
                            this.selectedBrokerIds = [];
                            this.reassignmentRequest = null;
                            this.currentStep = 0;
                        });
                    }
                }
                catch (err) {
                    message.error('Error starting partition reassignment.\nSee console for more information.', 3);
                    console.log("error starting partition reassignment", { error: err });
                }
                finally {
                    this.requestInProgress = false;
                }
            });

            return;
        }


        this.currentStep++;
    }
    onPreviousPage() { this.currentStep--; }


    async startReassignment(request: PartitionReassignmentRequest): Promise<boolean> {
        if (uiSettings.reassignment.maxReplicationTraffic > 0) {
            const success = await this.setTrafficLimit(request);
            if (!success) return false;
        }

        const msg = new Message('Starting reassignment');
        try {
            const response = await api.startPartitionReassignment(request);

            const errors = response.reassignPartitionsResponses.map(e => {
                const partErrors = e.partitions.filter(p => p.errorMessage != null);
                if (partErrors.length == 0) return null;
                return { topicName: e.topicName, partitions: partErrors };
            }).filterNull();

            if (errors.length > 0) {
                console.error("error starting partition reassignment.", errors);
                throw new Error();
            }
            msg.setSuccess();

        } catch (err) {
            msg.hide();
            notification.error({ message: "Error starting partition reassignment.\nSee console for details.", duration: 0 });
            return false;
        }

        return true;
    }

    async setTrafficLimit(request: PartitionReassignmentRequest): Promise<boolean> {
        const maxBytesPerSecond = Math.round(uiSettings.reassignment.maxReplicationTraffic);

        const topicReplicas: {
            topicName: string,
            leaderReplicas: { brokerId: number, partitionId: number }[],
            followerReplicas: { brokerId: number, partitionId: number }[]
        }[] = [];

        for (const t of request.topics) {
            const topicName = t.topicName;
            const leaderReplicas: { partitionId: number, brokerId: number }[] = [];
            const followerReplicas: { partitionId: number, brokerId: number }[] = [];
            for (const p of t.partitions) {
                const partitionId = p.partitionId;
                const brokersOld = api.topicPartitions?.get(t.topicName)?.first(p => p.id == partitionId)?.replicas;
                const brokersNew = p.replicas;

                if (brokersOld == null || brokersNew == null) {
                    console.log("traffic limit: skipping partition because old or new brokers can't be found", { topicName, partitionId, brokersOld, brokersNew, });
                    continue;
                }

                // leader throttling is applied to all sources (all brokers that have a replica of this partition)
                for (const sourceBroker of brokersOld)
                    leaderReplicas.push({ partitionId: partitionId, brokerId: sourceBroker });

                // follower throttling is applied only to target brokers that do not yet have a copy
                const newBrokers = brokersNew.except(brokersOld);
                for (const targetBroker of newBrokers)
                    followerReplicas.push({ partitionId: partitionId, brokerId: targetBroker });
            }

            topicReplicas.push({
                topicName: t.topicName,
                leaderReplicas: leaderReplicas,
                followerReplicas: followerReplicas,
            })
        }

        const msg = new Message("Setting bandwidth throttle... 1/2");
        try {
            let response = await api.setReplicationThrottleRate(api.clusterInfo!.brokers.map(b => b.brokerId), maxBytesPerSecond);
            let errors = response.patchedConfigs.filter(c => c.error);
            if (errors.length > 0)
                throw new Error(toJson(errors));

            msg.setLoading("Setting bandwidth throttle... 2/2");

            response = await api.setThrottledReplicas(topicReplicas);
            errors = response.patchedConfigs.filter(c => c.error);
            if (errors.length > 0)
                throw new Error(toJson(errors));

            msg.setSuccess("Setting bandwidth throttle... done");
            return true;
        } catch (err) {
            msg.hide();
            console.error("error setting throttle", err);
            return false;
        }
    }

    async resetTrafficLimit(topicNames: string[], brokerIds: number[]): Promise<boolean> {
        const configRequest: PatchConfigsRequest = { resources: [] };

        for (const b of brokerIds) {
            configRequest.resources.push({
                resourceType: ConfigResourceType.Broker,
                resourceName: String(b),
                configs: [
                    { name: 'leader.replication.throttled.rate', op: AlterConfigOperation.Delete },
                    { name: 'follower.replication.throttled.rate', op: AlterConfigOperation.Delete },
                ]
            });
        }

        // reset throttled replicas for those topics
        for (const t of topicNames) {
            configRequest.resources.push({
                resourceType: ConfigResourceType.Topic,
                resourceName: t,
                configs: [
                    { name: 'leader.replication.throttled.replicas', op: AlterConfigOperation.Delete },
                    { name: 'follower.replication.throttled.replicas', op: AlterConfigOperation.Delete }
                ],
            });
        }

        const msg = new Message("Resetting bandwidth throttle... 1/2");
        try {

            let response = await api.resetThrottledReplicas(topicNames);
            let errors = response.patchedConfigs.filter(c => c.error);
            if (errors.length > 0)
                throw new Error(toJson(errors));

            msg.setLoading("Resetting bandwidth throttle... 2/2");

            response = await api.resetReplicationThrottleRate(brokerIds);
            errors = response.patchedConfigs.filter(c => c.error);
            if (errors.length > 0)
                throw new Error(toJson(errors));

            msg.setSuccess("Resetting bandwidth throttle... done");
            return true;
        } catch (err) {
            msg.hide();
            console.error("error resetting throttle", err);
            return false;
        }
    }

    startRefreshingTopicConfigs() {
        if (IsDev) console.log('starting refreshTopicConfigs', { stack: new Error().stack });
        if (this.refreshTopicConfigsTimer == null)
            this.refreshTopicConfigsTimer = setInterval(this.refreshTopicConfigs, 6000);
    }
    stopRefreshingTopicConfigs() {
        if (IsDev) console.log('stopping refreshTopicConfigs', { stack: new Error().stack });
        if (this.refreshTopicConfigsTimer) {
            clearInterval(this.refreshTopicConfigsTimer);
            this.refreshTopicConfigsTimer = null;
        }
    }

    async refreshTopicConfigs() {
        try {
            if (this.refreshTopicConfigsRequestsInProgress > 0) return;
            this.refreshTopicConfigsRequestsInProgress++;
            const topicConfigs = await partialTopicConfigs([
                "follower.replication.throttled.replicas",
                "leader.replication.throttled.replicas"
            ]);

            const newThrottledTopics = topicConfigs.topicDescriptions
                .filter(t => t.configEntries.any(x => Boolean(x.value)))
                .map(t => t.topicName).sort();;

            const changes = this.topicsWithThrottle.updateWith(newThrottledTopics);
            if (changes.added || changes.removed)
                if (IsDev) console.log('refreshTopicConfigs updated', changes);

        } catch (err) {
            console.error("error while refreshing topic configs, stopping auto refresh", { error: err });
            this.stopRefreshingTopicConfigs();
        } finally {
            this.refreshTopicConfigsRequestsInProgress--;
        }
    }

    async removeThrottleFromTopics() {
        const throttledTopics = clone(this.topicsWithThrottle);
        const refreshTopicConfigs = this.refreshTopicConfigs;

        Modal.confirm({
            title: 'Remove throttle config from topics',
            icon: <ExclamationCircleOutlined />,
            width: 'auto',
            style: { maxWidth: '66%' },
            content:
                <div>
                    <div>
                        There are {this.topicsWithThrottle.length} topics with throttling applied to their replicas.<br />
                        Kowl implements throttling of reassignments by
                        setting{' '}
                        <span className='tooltip' style={{ textDecoration: 'dotted underline' }}>
                            two configuration values
                            <span className='tooltiptext' style={{ textAlign: 'left', width: '500px' }}>
                                Kowl sets those two configuration entries when throttling a topic reassignment:
                                <div style={{ marginTop: '.5em' }}>
                                    <code>leader.replication.throttled.replicas</code><br />
                                    <code>follower.replication.throttled.replicas</code>
                                </div>
                            </span>
                        </span>{' '}
                        in a topics configuration.<br />
                        So if you previously used Kowl to reassign any of the partitions of the following topics, the throttling config might still be active.
                    </div>
                    <div style={{ margin: '1em 0' }}>
                        <h4>Throttled Topics</h4>
                        <ul style={{ maxHeight: '145px', overflowY: 'scroll' }}>
                            {throttledTopics.map(t => <li key={t}>{t}</li>)}
                        </ul>
                    </div>
                    <div>
                        Do you want to remove the throttle config from those topics?
                    </div>
                </div>,

            okText: 'Remove throttle',
            okButtonProps: { danger: true, autoFocus: false, },
            async onOk() {
                const baseText = 'Removing throttle config from topics';
                const msg = new Message(baseText + '...');

                const result = await api.resetThrottledReplicas(throttledTopics);
                const errors = result.patchedConfigs.filter(r => r.error);

                if (errors.length == 0) {
                    msg.setSuccess(baseText + " - Done");
                }
                else {
                    msg.setError(baseText + ": " + errors.length + " errors");
                    console.error("errors in removeThrottleFromTopics", errors);
                }

                refreshTopicConfigs();
            },

            maskClosable: true,
            cancelButtonProps: { autoFocus: true },
        })


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



