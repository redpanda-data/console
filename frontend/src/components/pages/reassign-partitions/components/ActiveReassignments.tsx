import React, { Component, useState } from "react";
import { Tag, Popover, Tooltip, ConfigProvider, Table, Progress, Button, Modal, Slider, Popconfirm, Checkbox } from "antd";
import { LazyMap } from "../../../../utils/LazyMap";
import { Broker, Partition, PartitionReassignmentsPartition } from "../../../../state/restInterfaces";
import { api, brokerMap } from "../../../../state/backendApi";
import { computed, observable } from "mobx";
import { findPopupContainer, QuickTable } from "../../../../utils/tsxUtils";
import { makePaginationConfig, sortField } from "../../../misc/common";
import { uiSettings } from "../../../../state/ui";
import { ColumnProps } from "antd/lib/table";
import { TopicWithPartitions } from "../Step1.Partitions";
import { Message, prettyBytesOrNA, prettyMilliseconds } from "../../../../utils/utils";
import { BrokerList } from "./BrokerList";
import { ReassignmentState, ReassignmentTracker } from "../logic/reassignmentTracker";
import { observer } from "mobx-react";
import { EllipsisOutlined } from "@ant-design/icons";
import { strictEqual } from "assert";


@observer
export class ActiveReassignments extends Component<{ tracker: ReassignmentTracker }> {
    pageConfig = makePaginationConfig(uiSettings.reassignment.pageSizeActive ?? 10);

    // When set, a modal will be shown for the reassignment state
    @observable reassignmentDetails: ReassignmentState | null = null;
    @observable showThrottleDialog = false;

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
            ? <>Set Throttle</>
            : <>Throttle: {prettyBytesOrNA(minThrottle)}/s</>

        return <>
            <div style={{ display: 'flex', placeItems: 'center', marginBottom: '.5em' }}>
                <span style={{
                    fontSize: '1.17em', fontWeight: 500, color: 'hsl(0deg, 0%, 0%, 85%)',
                    marginLeft: '.2em', paddingBottom: '2px'
                }}
                >Current Reassignments
                </span>

                {this.props.tracker.trackingReassignments.length > 0 &&
                    <Button type='link' onClick={() => this.showThrottleDialog = true}
                        style={{ fontSize: 'smaller' }}
                    >{throttleText}</Button>
                }
            </div>
            <ConfigProvider renderEmpty={() =>
                <div style={{ color: '#00000059', margin: '.4em 0' }}>No reassignments currently in progress</div>
            }>
                <Table
                    style={{ margin: '0', }} size={'middle'}
                    className='activeReassignments'

                    dataSource={this.props.tracker.trackingReassignments.slice() ?? []}
                    columns={columnsActiveReassignments}

                    rowKey={r => r.topicName}
                    onRow={(state, index) => {
                        return {
                            onClick: e => this.reassignmentDetails = state,
                        };
                    }}


                    pagination={this.pageConfig}
                    onChange={(p) => {
                        if (p.pageSize) uiSettings.reassignment.pageSizeActive = p.pageSize;
                        this.pageConfig.current = p.current;
                        this.pageConfig.pageSize = p.pageSize;
                    }}
                />

            </ConfigProvider>
            <ReassignmentDetailsModal state={this.reassignmentDetails} onClose={() => this.reassignmentDetails = null} />
            <ThrottleDialog visible={this.showThrottleDialog} onClose={() => this.showThrottleDialog = false} />
        </>
    }

    @computed get topicPartitionsInProgress(): TopicWithPartitions[] {
        if (api.topics == null) return [];
        return api.topics.map(topic => {
            return {
                ...topic,
                partitions: api.topicPartitions.get(topic.topicName)!,
                activeReassignments: this.inProgress.get(topic.topicName) ?? [],
            }
        }).filter(t => t.activeReassignments.length > 0);
    }

    @computed get inProgress(): Map<string, PartitionReassignmentsPartition[]> {
        const current = api.partitionReassignments ?? [];
        return current.toMap(x => x.topicName, x => x.partitions);
    }

    @computed get throttleSettings(): ({ followerThrottle: number | undefined, leaderThrottle: number | undefined }) {
        const leaderThrottle = api.clusterConfig?.brokerConfigs
            .flatMap(c => c.configEntries)
            .first(e => e.name == 'leader.replication.throttled.rate');
        const followerThrottle = api.clusterConfig?.brokerConfigs
            .flatMap(c => c.configEntries)
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
export class ThrottleDialog extends Component<{ visible: boolean, onClose: () => void }> {
    @observable newThrottleValue: number = 0;

    render() {
        return <Modal
            title="Throttle Settings"
            visible={this.props.visible} maskClosable={true}
            onCancel={this.props.onClose}
            onOk={() => this.applyBandwidthThrottle()}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3em', }}>

                <div style={{ display: 'flex', gap: '1em' }}>
                    <Slider style={{ minWidth: '300px', margin: '0 1em', paddingBottom: '2em', flex: 1 }}
                        min={2} max={12} step={0.1}
                        marks={{ 2: "Off", 3: "1kB", 6: "1MB", 9: "1GB", 12: "1TB", }}
                        included={true}
                        tipFormatter={f => this.newThrottleValue < 1000
                            ? 'No limit'
                            : prettyBytesOrNA(this.newThrottleValue) + '/s'}

                        value={Math.log10(this.newThrottleValue)}
                        onChange={sv => {
                            const n = Number(sv.valueOf());
                            const newLimit = Math.pow(10, n);
                            if (newLimit >= 1000) {
                                this.newThrottleValue = newLimit;
                            }
                            else {
                                if (newLimit < 500)
                                    this.newThrottleValue = 0;
                                else this.newThrottleValue = 1000;
                            }
                        }}
                    />
                </div>

                <div>
                    - current leader/follower throttle
                    -
                </div>

                <Button type='default' onClick={() => this.applyBandwidthThrottle()}>Remove Bandwidth Throttle</Button>
            </div>

        </Modal>
    }

    applyBandwidthThrottle() {

    }

    resetBandwidthThrottle() {
        //resetTrafficLimit(rq.topics.map(t => t.topicName), api.clusterInfo!.brokers.map(b => b.brokerId));
    }
}


@observer
export class ReassignmentDetailsModal extends Component<{ state: ReassignmentState | null, onClose: () => void }> {
    lastState: ReassignmentState | null;
    @observable shouldThrottle = false;


    render() {
        const state = this.lastState ?? this.props.state;
        if (state == null) return null;
        const visible = this.props.state != null;
        if (this.lastState != state) {
            this.lastState = state;
            setImmediate(() => { this.shouldThrottle = this.isThrottled() })
        }

        const settings = uiSettings.reassignment;

        return <Modal
            title={"Reassignment: " + state.topicName}
            visible={visible}
            onOk={() => this.applyBandwidthThrottle()}
            onCancel={this.props.onClose}
            maskClosable={true}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3em', }}>

                <div style={{ display: 'flex', gap: '1em' }}>
                    <Checkbox checked={this.shouldThrottle} onChange={e => this.shouldThrottle = e.target.checked}>
                        <div>
                            <span>Throttle Reassignment</span>
                            <span style={{ fontSize: 'smaller', opacity: '0.6' }}>Using global throttle limit for all replication traffic</span>
                        </div>
                    </Checkbox>
                </div>

                <Popconfirm title="Are you sure you want to stop the reassignment?" okText="Yes" cancelText="No"
                    onConfirm={() => this.cancelReassignment()}
                >
                    <Button type='dashed' danger>Cancel Reassignment</Button>
                </Popconfirm>

            </div>

        </Modal>
    }

    isThrottled(): boolean {
        return true; // todo
    }

    applyBandwidthThrottle() {
        const state = this.props.state;
        if (state == null) {
            console.error("apply bandwidth throttle: this.props.state is null");
            return;
        }

        api.setThrottledReplicas([{
            topicName: state.topicName,
            leaderReplicas: [],
            followerReplicas: [],
        }])
        this.props.onClose();
    }

    async cancelReassignment() {
        const state = this.props.state;
        if (state == null) {
            console.error("cancel reassignment: this.props.state is null");
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
            console.error("cancel reassignment: " + String(err));
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

        if (state.remaining == null) return "...";
        const transferred = state.totalTransferSize - state.remaining.value;

        let progressBar: JSX.Element;

        if (state.progressPercent === null) {
            // Starting
            progressBar = <ProgressBar percent={0} state='active'
                left='Starting...'
                right={prettyBytesOrNA(state.totalTransferSize)} />

        } else if (state.progressPercent < 100) {
            // Progressing
            progressBar = <ProgressBar percent={state.progressPercent} state='active'
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
            progressBar = <ProgressBar percent={100} state='success'
                left='Complete'
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


        if (state.estimateSpeed == null || state.estimateCompletionTime == null) return "...";

        const remainingMs = state.estimateCompletionTime.getTime() - new Date().getTime();

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
        <Progress percent={percent} status={state} size='small' showInfo={false} style={{ lineHeight: 0.1, display: 'block' }} />
        <div style={{
            display: 'flex', marginTop: '1px',
            fontFamily: '"Open Sans", sans-serif', fontWeight: 600, fontSize: '75%'
        }}>
            {left && <div>{left}</div>}
            {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
        </div>
    </>
}