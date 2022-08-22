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

import React, { Component } from 'react';
import { Progress, Button, Modal, Popconfirm, Checkbox, Skeleton, message } from 'antd';
import { ConfigEntry } from '../../../../state/restInterfaces';
import { api } from '../../../../state/backendApi';
import { computed, makeObservable, observable } from 'mobx';
import { QuickTable } from '../../../../utils/tsxUtils';
import { sortField } from '../../../misc/common';
import { uiSettings } from '../../../../state/ui';
import { ColumnProps } from 'antd/lib/table';
import { Message, prettyBytesOrNA, prettyMilliseconds } from '../../../../utils/utils';
import { ReassignmentState } from '../logic/reassignmentTracker';
import { observer } from 'mobx-react';
import { reassignmentTracker } from '../ReassignPartitions';
import { BandwidthSlider } from './BandwidthSlider';
import { KowlTable } from '../../../misc/KowlTable';
import { BrokerList } from '../../../misc/BrokerList';


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
        const columnsActiveReassignments: ColumnProps<ReassignmentState>[] = [
            {
                title: 'Topic', width: '1%',
                render: (v, t) => <TopicNameCol state={t} />,
                sorter: sortField('topicName')
            },
            {
                title: 'Progress', // ProgressBar, Percent, ETA
                render: (v, t) => <ProgressCol state={t} />,
                sorter: (a, b) => {
                    if (a.progressPercent == null && b.progressPercent != null) return 1;
                    if (a.progressPercent != null && b.progressPercent == null) return -1;
                    if (a.progressPercent == null || b.progressPercent == null) return 0;
                    return a.progressPercent - b.progressPercent;
                }
            },
            {
                title: 'ETA', width: '100px', align: 'right',
                render: (v, t) => <ETACol state={t} />,
                sorter: (a, b) => {
                    if (a.estimateCompletionTime == null && b.estimateCompletionTime != null) return 1;
                    if (a.estimateCompletionTime != null && b.estimateCompletionTime == null) return -1;
                    if (a.estimateCompletionTime == null || b.estimateCompletionTime == null) return 0;
                    return a.estimateCompletionTime.getTime() - b.estimateCompletionTime.getTime();
                },
                defaultSortOrder: 'ascend'
            },
            {
                title: 'Brokers', width: '0.1%',
                render: (v, t) => <BrokersCol state={t} />,
            },
        ];

        const minThrottle = this.minThrottle;
        const throttleText = minThrottle === undefined
            ? <>Throttle: Not set (unlimited)</>
            : <>Throttle: {prettyBytesOrNA(minThrottle)}/s</>

        const currentReassignments = reassignmentTracker.trackingReassignments ?? [];

        return <>
            {/* Title */}
            <div className="currentReassignments" style={{ display: 'flex', placeItems: 'center', marginBottom: '.5em' }}>
                <span className="title">Current Reassignments</span>

                <Button type="link" size="small" style={{ fontSize: 'smaller', padding: '0px 8px' }}
                    onClick={() => this.showThrottleDialog = true}
                >{throttleText}</Button>
            </div>

            {/* Table */}
            <KowlTable
                className="activeReassignments"

                dataSource={currentReassignments}
                columns={columnsActiveReassignments}

                rowKey={r => r.topicName}
                onRow={(state) => {
                    return {
                        onClick: _e => this.reassignmentDetails = state,
                    };
                }}
                pagination={this.pageConfig}
                observableSettings={uiSettings.reassignment.activeReassignments}

                emptyText={<div style={{ color: '#00000059', margin: '.4em 0' }}>No reassignments currently in progress</div>}
            />

            <ReassignmentDetailsDialog state={this.reassignmentDetails} onClose={() => this.reassignmentDetails = null} />
            <ThrottleDialog visible={this.showThrottleDialog} lastKnownMinThrottle={minThrottle} onClose={() => this.showThrottleDialog = false} />

            {this.props.throttledTopics.length > 0 &&
                <Button type="link" size="small" style={{ fontSize: 'smaller', padding: '0px 8px' }}
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


@observer
export class ThrottleDialog extends Component<{ visible: boolean, lastKnownMinThrottle: number | undefined, onClose: () => void }> {
    @observable newThrottleValue: number | null = null;

    constructor(p: any) {
        super(p);
        this.newThrottleValue = this.props.lastKnownMinThrottle ?? null;
        makeObservable(this);
    }

    render() {
        const throttleValue = this.newThrottleValue ?? 0;
        const noChange = (this.newThrottleValue === this.props.lastKnownMinThrottle)
            || (this.newThrottleValue == null);

        // console.log('nochange:', { noChange, newVal: this.newThrottleValue, lastKnown: this.props.lastKnownMinThrottle })

        return <Modal
            title="Throttle Settings"
            visible={this.props.visible} maskClosable={true} closeIcon={<></>}
            width="700px"

            onCancel={this.props.onClose}

            footer={<div style={{ display: 'flex' }}>
                <Button
                    danger
                    onClick={() => {
                        this.newThrottleValue = null;
                        this.applyBandwidthThrottle();
                    }}
                >Remove throttle</Button>

                <Button
                    style={{ marginLeft: 'auto' }}
                    onClick={this.props.onClose}
                >Close</Button>

                <Button
                    disabled={noChange}
                    type="primary"
                    onClick={() => this.applyBandwidthThrottle()}
                >Apply</Button>
            </div>}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1em', }}>
                <div style={{ margin: '0 1em' }}>
                    <p style={{ margin: 0 }}>Using throttling you can limit the network traffic for reassignments.</p>
                    <ul style={{ marginTop: '0.5em', padding: '0 1.5em' }}>
                        <li>Throttling applies to all replication traffic, not just to active reassignments.</li>
                        <li>Once the reassignment completes you'll have to remove the throttling configuration. <br />
                            Kowl will show a warning below the "Current Reassignments" table when there are throttled topics that are no longer being reassigned.
                        </li>
                    </ul>
                </div>

                <BandwidthSlider value={throttleValue} onChange={x => this.newThrottleValue = x} />
            </div>

        </Modal>
    }

    async applyBandwidthThrottle() {

        const msg = new Message('Setting throttle rate...');
        try {
            const allBrokers = api.clusterInfo?.brokers.map(b => b.brokerId);
            if (!allBrokers) {
                message.error('Error: Cluster info not available');
                return;
            }

            if (this.newThrottleValue && this.newThrottleValue > 0) {
                await api.setReplicationThrottleRate(allBrokers, this.newThrottleValue);
            }
            else {
                await api.resetReplicationThrottleRate(allBrokers);
            }

            setTimeout(() => {
                // need to update actual value after changing
                api.refreshCluster(true);
            });

            msg.setSuccess('Setting throttle rate... done');

        }
        catch (err) {
            console.error('error in applyBandwidthThrottle: ' + err);
            msg.setError();
        }

        this.props.onClose();
    }
}


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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3em', }}>

                {/* Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1em', }}>
                    <div>
                        {QuickTable([
                            ['Replicas', replicas],
                            ['Adding', addingReplicas],
                            ['Removing', removingReplicas],
                        ])}
                    </div>
                </div>

                {/* Throttle */}
                <div style={{ display: 'flex', gap: '1em' }}>
                    <Checkbox checked={this.shouldThrottle} onChange={e => this.shouldThrottle = e.target.checked}>
                        <span>
                            <span>Throttle Reassignment</span><br />
                            <span style={{ fontSize: 'smaller', opacity: '0.6', marginLeft: '2em' }}>Using global throttle limit for all replication traffic</span>
                        </span>
                    </Checkbox>
                </div>

                {/* Cancel */}
                <Popconfirm title="Are you sure you want to stop the reassignment?" okText="Yes" cancelText="No"
                    onConfirm={() => this.cancelReassignment()}
                >
                    <Button type="dashed" danger>Cancel Reassignment</Button>
                </Popconfirm>
            </div>
        ) : <Skeleton loading={true} active={true} paragraph={{ rows: 5 }} />;

        return <Modal
            title={'Reassignment: ' + state.topicName}
            visible={visible}

            okText="Apply &amp; Close"
            onOk={() => {
                this.applyBandwidthThrottle();
                this.props.onClose();
            }}

            cancelText="Close"
            onCancel={this.props.onClose}
            maskClosable={true}
        >
            {modalContent}
        </Modal>
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

        const msg = new Message(`Cancelling reassignment of '${state.topicName}'...`);
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

            msg.setSuccess();
            this.props.onClose();
        }
        catch (err) {
            console.error('cancel reassignment: ' + String(err));
            msg.setError();
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
        <Progress percent={percent} status={state} size="small" showInfo={false} style={{ lineHeight: 0.1, display: 'block' }} />
        <div style={{
            display: 'flex', marginTop: '1px',
            fontFamily: '"Open Sans", sans-serif', fontWeight: 600, fontSize: '75%'
        }}>
            {left && <div>{left}</div>}
            {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
        </div>
    </>
}
