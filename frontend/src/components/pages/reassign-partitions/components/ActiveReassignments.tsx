/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import React, { Component, FC, useRef } from 'react';
import { ConfigEntry } from '../../../../state/restInterfaces';
import { api } from '../../../../state/backendApi';
import { computed, makeObservable, observable } from 'mobx';
import { QuickTable } from '../../../../utils/tsxUtils';
import { prettyBytesOrNA, prettyMilliseconds } from '../../../../utils/utils';
import { ReassignmentState } from '../logic/reassignmentTracker';
import { observer, useLocalObservable } from 'mobx-react';
import { reassignmentTracker } from '../ReassignPartitions';
import { BandwidthSlider } from './BandwidthSlider';
import { BrokerList } from '../../../misc/BrokerList';
import { Box, Button, ButtonGroup, Checkbox, createStandaloneToast, DataTable, Flex, ListItem, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Popover, PopoverArrow, PopoverBody, PopoverCloseButton, PopoverContent, PopoverFooter, PopoverHeader, PopoverTrigger, Progress, redpandaTheme, redpandaToastOptions, Skeleton, Text, ToastId, UnorderedList, useDisclosure, useToast } from '@redpanda-data/ui';

// TODO - once ActiveReassignments is migrated to FC, we could should move this code to use useToast()
const { ToastContainer, toast } = createStandaloneToast({
    theme: redpandaTheme,
    defaultOptions: {
        ...redpandaToastOptions.defaultOptions,
        isClosable: false,
        duration: 2000
    }
})

@observer
export class ActiveReassignments extends Component<{ throttledTopics: string[], onRemoveThrottleFromTopics: () => void }> {
    pageConfig = { defaultPageSize: 5 };

    // When set, a modal will be shown for the reassignment state
    @observable reassignmentDetails: ReassignmentState | null = null;
    @observable showThrottleDialog = false;

    constructor(p: any) {
        super(p);
        api.refreshCluster(true);
        makeObservable(this);
    }

    render() {
        const minThrottle = this.minThrottle;
        const throttleText = minThrottle === undefined
            ? <>Throttle: Not set (unlimited)</>
            : <>Throttle: {prettyBytesOrNA(minThrottle)}/s</>

        const currentReassignments = reassignmentTracker.trackingReassignments ?? [];

        return <>
            <ToastContainer />
            {/* Title */}
            <div className="currentReassignments" style={{ display: 'flex', placeItems: 'center', marginBottom: '.5em' }}>
                <span className="title">Current Reassignments</span>

                <Button variant="link" size="sm" style={{ fontSize: 'smaller', padding: '0px 8px' }}
                    onClick={() => this.showThrottleDialog = true}
                >{throttleText}</Button>
            </div>

            {/* Table */}
            <DataTable<ReassignmentState>
                data={currentReassignments}
                defaultPageSize={5}
                enableSorting={false}
                size="sm"
                onRow={(row) => {
                    this.reassignmentDetails = row.original
                }}
                columns={[
                    {
                        header: 'Topic',
                        size: 1,
                        cell: ({ row: { original } }) => <TopicNameCol state={original} />
                    },
                    {
                        header: 'Progress',
                        size: Infinity,
                        cell: ({ row: { original } }) => <ProgressCol state={original} />
                    },
                    {
                        header: 'ETA',
                        size: 100,
                        cell: ({ row: { original } }) => <ETACol state={original} />
                    },
                    {
                        header: 'Brokers',
                        size: 1,
                        cell: ({ row: { original } }) => <BrokersCol state={original} />
                    }
                ]}
                emptyText="No reassignments currently in progress"
            />

            <ReassignmentDetailsDialog state={this.reassignmentDetails} onClose={() => this.reassignmentDetails = null} />
            <ThrottleDialog visible={this.showThrottleDialog} lastKnownMinThrottle={minThrottle} onClose={() => this.showThrottleDialog = false} />

            {this.props.throttledTopics.length > 0 &&
                <Button variant="link" size="sm" style={{ fontSize: 'smaller', padding: '0px 8px' }}
                    onClick={this.props.onRemoveThrottleFromTopics}
                >
                    <span>There are <b>{this.props.throttledTopics.length}</b> throttled topics - click here to fix</span>
                </Button>
            }
        </>
    }

    @computed get throttleSettings(): ({ followerThrottle: number | undefined, leaderThrottle: number | undefined }) {
        const leaderThrottle = [...api.brokerConfigs.values()]
            .filter(c => typeof c != 'string')
            .flatMap(c => c as ConfigEntry[])
            .first(e => e.name == 'leader.replication.throttled.rate');
        const followerThrottle = [...api.brokerConfigs.values()]
            .filter(c => typeof c != 'string')
            .flatMap(c => c as ConfigEntry[])
            .first(e => e.name == 'follower.replication.throttled.rate');

        const result = {
            leaderThrottle: leaderThrottle ? Number(leaderThrottle.value) : undefined,
            followerThrottle: followerThrottle ? Number(followerThrottle.value) : undefined
        };

        return result;
    }

    @computed get minThrottle(): number | undefined {
        const t = this.throttleSettings;
        if (t.followerThrottle !== undefined || t.leaderThrottle !== undefined)
            return Math.min(
                t.followerThrottle ?? Number.POSITIVE_INFINITY,
                t.leaderThrottle ?? Number.POSITIVE_INFINITY
            );

        return undefined;
    }
}


export const ThrottleDialog: FC<{ visible: boolean, lastKnownMinThrottle: number | undefined, onClose: () => void }> = observer(({visible, lastKnownMinThrottle, onClose}) => {
    const $state = useLocalObservable<{
        newThrottleValue: number | null;
    }>(() => ({
        newThrottleValue: lastKnownMinThrottle ?? null
    }))

    const toast = useToast()
    const toastRef = useRef<ToastId>()

    const throttleValue = $state.newThrottleValue ?? 0;
    const noChange = ($state.newThrottleValue === lastKnownMinThrottle)
        || ($state.newThrottleValue == null);


    const applyBandwidthThrottle = async () => {
        toastRef.current = toast({
            status: 'loading',
            description: 'Setting throttle rate...'
        })
        try {
            const allBrokers = api.clusterInfo?.brokers.map(b => b.brokerId);
            if (!allBrokers) {
                toast({
                    status: 'error',
                    title: 'Error',
                    description: 'Cluster info not available'
                });
                return;
            }

            if ($state.newThrottleValue && $state.newThrottleValue > 0) {
                await api.setReplicationThrottleRate(allBrokers, $state.newThrottleValue);
            }
            else {
                await api.resetReplicationThrottleRate(allBrokers);
            }

            setTimeout(() => {
                // need to update actual value after changing
                api.refreshCluster(true);
            });

            toast.update(toastRef.current, {
                status: 'success',
                description: 'Setting throttle rate... done'
            })

        }
        catch (err) {
            console.error('error in applyBandwidthThrottle: ' + err);
            toast.update(toastRef.current, {
                status: 'error',
                description: 'Setting throttle rate... error'
            })
        }

        onClose();
    }


    return (
        <Modal
            isOpen={visible}
            onClose={onClose}
        >
            <ModalOverlay/>
            <ModalContent minW="3xl">
                <ModalHeader>Throttle Settings</ModalHeader>
                <ModalBody>
                    <Flex flexDirection="column" gap={4}>
                        <Box mx={4}>
                            <Text>Using throttling you can limit the network traffic for reassignments.</Text>
                            <UnorderedList mt={2} px={6}>
                                <ListItem>Throttling applies to all replication traffic, not just to active reassignments.</ListItem>
                                <ListItem>Once the reassignment completes you'll have to remove the throttling configuration. <br/>
                                    Console will show a warning below the "Current Reassignments" table when there are throttled topics that are no longer being reassigned.
                                </ListItem>
                            </UnorderedList>
                        </Box>
                        <BandwidthSlider value={throttleValue} onChange={x => $state.newThrottleValue = x}/>
                    </Flex>
                </ModalBody>
                <ModalFooter justifyContent="space-between">
                    <Button
                        variant="outline"
                        colorScheme="red"
                        onClick={() => {
                            $state.newThrottleValue = null;
                            void applyBandwidthThrottle();
                        }}
                    >Remove throttle</Button>

                    <Flex gap={2}>
                        <Button
                            style={{marginLeft: 'auto'}}
                            onClick={onClose}
                        >Close</Button>
                        <Button
                            disabled={noChange}
                            variant="solid"
                            onClick={() => {
                                void applyBandwidthThrottle();
                            }}
                        >Apply</Button>
                    </Flex>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
})

const CancelReassignmentButton: FC<{ onConfirm: () => void }> = ({onConfirm}) => {
    const { isOpen, onToggle, onClose } = useDisclosure()

    return (
        <Popover
            returnFocusOnClose={false}
            isOpen={isOpen}
            onClose={onClose}
            closeOnBlur={false}
        >
            <PopoverTrigger>
                <Button onClick={onToggle} variant="outline" colorScheme="red">Cancel Reassignment</Button>
            </PopoverTrigger>
            <PopoverContent>
                <PopoverHeader fontWeight="semibold">Confirmation</PopoverHeader>
                <PopoverArrow/>
                <PopoverCloseButton/>
                <PopoverBody>
                    Are you sure you want to stop the reassignment?
                </PopoverBody>
                <PopoverFooter display="flex" justifyContent="flex-end">
                    <ButtonGroup size="sm">
                        <Button variant="ghost">No</Button>
                        <Button colorScheme="red" onClick={onConfirm}>Yes</Button>
                    </ButtonGroup>
                </PopoverFooter>
            </PopoverContent>
        </Popover>
    )
};

@observer
export class ReassignmentDetailsDialog extends Component<{ state: ReassignmentState | null, onClose: () => void }> {
    lastState: ReassignmentState | null;
    @observable shouldThrottle = false;
    wasVisible = false;


    constructor(p: any) {
        super(p);
        makeObservable(this);
    }


    render() {
        if (this.props.state == null) return null;

        const state = this.props.state;
        if (this.lastState != state)
            this.lastState = state;

        const visible = this.props.state != null;
        if (this.wasVisible != visible) {
            // became visible or invisible
            // force update of topic config, so isThrottle has up to date information
            setTimeout(async () => {
                api.topicConfig.delete(state.topicName);
                await api.refreshTopicConfig(state.topicName, true);
                this.shouldThrottle = this.isThrottled();
            });
        }
        this.wasVisible = visible;

        const topicConfig = api.topicConfig.get(state.topicName);
        if (!topicConfig) setTimeout(() => { api.refreshTopicConfig(state.topicName); });

        const replicas = state.partitions.flatMap(p => p.replicas).distinct();
        const addingReplicas = state.partitions.flatMap(p => p.addingReplicas).distinct();
        const removingReplicas = state.partitions.flatMap(p => p.removingReplicas).distinct();


        const modalContent = Boolean(topicConfig) ? (
            <Flex flexDirection="column" gap={12}>

                {/* Info */}
                <Flex flexDirection="column" gap={4}>
                    <div>
                        {QuickTable([
                            ['Replicas', replicas],
                            ['Adding', addingReplicas],
                            ['Removing', removingReplicas],
                        ])}
                    </div>
                </Flex>

                {/* Throttle */}
                <Flex gap={4}>
                    <Checkbox isChecked={this.shouldThrottle} onChange={e => this.shouldThrottle = e.target.checked}>
                        <span>
                            <span>Throttle Reassignment</span><br />
                            <span style={{ fontSize: 'smaller', opacity: '0.6', marginLeft: '2em' }}>Using global throttle limit for all replication traffic</span>
                        </span>
                    </Checkbox>
                </Flex>

                {/* Cancel */}
                <CancelReassignmentButton onConfirm={() => this.cancelReassignment()}/>
            </Flex>
        ) : <Skeleton mt={5} noOfLines={5} height={4} />

        return (
            <Modal isOpen={visible} onClose={this.props.onClose}>
                <ModalOverlay/>
                <ModalContent minW="3xl">
                    <ModalHeader>
                        Reassignment: {state.topicName}
                    </ModalHeader>
                    <ModalBody>{modalContent}</ModalBody>
                    <ModalFooter gap={2}>
                        <Button variant="outline" onClick={this.props.onClose}>Close</Button>
                        <Button variant="solid" isDisabled={!topicConfig} onClick={() => {
                            this.applyBandwidthThrottle();
                            this.props.onClose();
                        }}>Apply &amp; Close</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        )
    }

    isThrottled(): boolean {
        // Reassignment is throttled when the topic contains any partition/broker pair that is currently being reassigned
        if (!this.lastState) {
            return false;
        }
        const config = api.topicConfig.get(this.lastState.topicName);
        if (!config) {
            return false;
        }

        // partitionId:brokerId, ...
        const leaderThrottleValue = config.configEntries.first(e => e.name == 'leader.replication.throttled.replicas');
        const leaderThrottleEntries = leaderThrottleValue?.value?.split(',').map(e => {
            const ar = e.split(':');
            if (ar.length != 2) return null;
            return { partitionId: Number(ar[0]), brokerId: Number(ar[1]) };
        }).filterNull();

        if (leaderThrottleEntries) {
            // Go through all partitions that are being reassigned
            for (const p of this.lastState.partitions) {
                const sourceBrokers = p.replicas;

                // ...and check if this broker-partition combo is being throttled
                const hasThrottle = leaderThrottleEntries.any(e =>
                    e.partitionId == p.partitionId && sourceBrokers.includes(e.brokerId)
                );

                if (hasThrottle) return true;
            }
        }

        // partitionId:brokerId, ...
        const followerThrottleValue = config.configEntries.first(e => e.name == 'follower.replication.throttled.replicas');
        const followerThrottleEntries = followerThrottleValue?.value?.split(',').map(e => {
            const ar = e.split(':');
            if (ar.length != 2) return null;
            return { partitionId: Number(ar[0]), brokerId: Number(ar[1]) };
        }).filterNull();

        if (followerThrottleEntries) {
            // Go through all partitions that are being reassigned
            for (const p of this.lastState.partitions) {
                const targetBrokers = p.addingReplicas;

                // ...and check if this broker-partition combo is being throttled
                const hasThrottle = followerThrottleEntries.any(e =>
                    e.partitionId == p.partitionId && targetBrokers.includes(e.brokerId)
                );

                if (hasThrottle) return true;
            }
        }

        return false;
    }

    applyBandwidthThrottle() {
        const state = this.props.state;
        if (state == null) {
            console.error('apply bandwidth throttle: this.props.state is null');
            return;
        }

        if (this.shouldThrottle) {
            const leaderReplicas: { partitionId: number, brokerId: number }[] = [];
            const followerReplicas: { partitionId: number, brokerId: number }[] = [];
            for (const p of state.partitions) {
                const partitionId = p.partitionId;
                const brokersOld = p.replicas;
                const brokersNew = p.addingReplicas;

                if (brokersOld == null || brokersNew == null) {
                    console.warn('active reassignments, traffic limit: skipping partition because old or new brokers can\'t be found', { state: state });
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

            api.setThrottledReplicas([{
                topicName: state.topicName,
                leaderReplicas: leaderReplicas,
                followerReplicas: followerReplicas,
            }]);
        }
        else {
            api.resetThrottledReplicas([state.topicName]);
        }

    }

    async cancelReassignment() {
        const state = this.props.state;
        if (state == null) {
            console.error('cancel reassignment: this.props.state is null');
            return;
        }

        const partitions = state.partitions.map(p => p.partitionId);

        const toastRef = toast({
            status: 'loading',
            description: `Cancelling reassignment of '${state.topicName}'...`
        })

        try {
            const cancelRequest = {
                topics: [
                    {
                        topicName: state.topicName,
                        partitions: partitions.map(p => ({
                            partitionId: p,
                            replicas: null, // cancel
                        })),
                    }
                ]
            };
            const response = await api.startPartitionReassignment(cancelRequest);

            console.log('cancel reassignment result', { request: cancelRequest, response: response });

            toast.update(toastRef, {
                status: 'success',
                description: `Cancelling reassignment of '${state.topicName}': Done`,
                duration: 1000,
            })
            this.props.onClose();
        }
        catch (err) {
            console.error('cancel reassignment: ' + String(err));
            toast.update(toastRef, {
                status: 'error',
                description: `Cancelling reassignment of '${state.topicName}': Error`,
                duration: 1000,
            })
        }
    }
}

@observer
export class TopicNameCol extends Component<{ state: ReassignmentState }> {
    render() {
        const { state } = this.props;
        return <span style={{ paddingRight: '2em' }}>{state.topicName}</span>;
        // return <><span className='partitionReassignmentSpinner' style={{ marginRight: '6px' }} />{state.topicName}</>;
    }
}


@observer
export class ProgressCol extends Component<{ state: ReassignmentState }> {
    render() {
        const { state } = this.props;

        if (state.remaining == null) return '...';
        const transferred = state.totalTransferSize - state.remaining.value;

        let progressBar: JSX.Element;

        if (state.progressPercent === null) {
            // Starting
            progressBar = <ProgressBar percent={0} state="active"
                left="Starting..."
                right={prettyBytesOrNA(state.totalTransferSize)} />

        } else if (state.progressPercent < 100) {
            // Progressing
            progressBar = <ProgressBar percent={state.progressPercent} state="active"
                left={<span>{state.progressPercent.toFixed(1) + '%'}</span>}
                right={<>
                    {state.estimateSpeed != null &&
                        <span style={{ paddingRight: '1em', opacity: '0.6' }}>({prettyBytesOrNA(state.estimateSpeed)}/s)</span>
                    }
                    <span>
                        {prettyBytesOrNA(transferred)} / {prettyBytesOrNA(state.totalTransferSize)}
                    </span>
                </>} />
        } else {
            // Completed
            progressBar = <ProgressBar percent={100} state="success"
                left="Complete"
                right={prettyBytesOrNA(state.totalTransferSize)} />
        }


        return <div style={{ marginBottom: '-6px' }}>
            {progressBar}
        </div>

    }
}


@observer
export class ETACol extends Component<{ state: ReassignmentState }> {
    render() {
        const { state } = this.props;


        if (state.estimateSpeed == null || state.estimateCompletionTime == null) return '...';

        const remainingMs = (state.estimateCompletionTime.getTime() - new Date().getTime()).clamp(0, undefined);

        return <span >
            {prettyMilliseconds(remainingMs, { secondsDecimalDigits: 0, unitCount: 2 })}
        </span>

    }
}


@observer
export class BrokersCol extends Component<{ state: ReassignmentState }> {
    render() {
        const { state } = this.props;

        const allBrokerIds = state.partitions.map(p => [p.addingReplicas, p.removingReplicas, p.replicas]).flat(2).distinct();

        return <BrokerList brokerIds={allBrokerIds} />
    }
}


const ProgressBar = function (p: { percent: number, state: 'active' | 'success', left?: React.ReactNode, right?: React.ReactNode }) {
    const { percent, state, left, right } = p;
    return <>
        <Progress value={percent} colorScheme={{
            'success': 'success',
            'active': 'brand'
        }[state]} />
        <div style={{
            display: 'flex', marginTop: '1px',
            fontFamily: '"Open Sans", sans-serif', fontWeight: 600, fontSize: '75%'
        }}>
            {left && <div>{left}</div>}
            {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
        </div>
    </>
}
