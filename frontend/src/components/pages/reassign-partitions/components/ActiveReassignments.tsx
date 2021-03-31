import React, { Component, useState } from "react";
import { Tag, Popover, Tooltip, ConfigProvider, Table, Progress, Button, Modal, Slider, Popconfirm } from "antd";
import { LazyMap } from "../../../../utils/LazyMap";
import { Broker, Partition, PartitionReassignmentsPartition } from "../../../../state/restInterfaces";
import { api, brokerMap } from "../../../../state/backendApi";
import { computed, observable } from "mobx";
import { findPopupContainer, QuickTable } from "../../../../utils/tsxUtils";
import { makePaginationConfig, sortField } from "../../../misc/common";
import { uiSettings } from "../../../../state/ui";
import { ColumnProps } from "antd/lib/table";
import { TopicWithPartitions } from "../Step1.Partitions";
import { prettyBytesOrNA, prettyMilliseconds } from "../../../../utils/utils";
import { BrokerList } from "./BrokerList";
import { ReassignmentState, ReassignmentTracker } from "../logic/reassignmentTracker";
import { observer } from "mobx-react";
import { EllipsisOutlined } from "@ant-design/icons";


@observer
export class ActiveReassignments extends Component<{ tracker: ReassignmentTracker }> {
    pageConfig = makePaginationConfig(uiSettings.reassignment.pageSizeActive ?? 10);

    // When set, a modal will be shown for the reassignment state
    @observable reassignmentDetails: ReassignmentState | null = null;

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
                title: 'ETA', width: '170px',
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

        return <>
            <h3 style={{ marginLeft: '.2em' }}>Current Reassignments</h3>
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

                // expandable={{
                //     expandIconColumnIndex: 1,
                //     expandedRowRender: topic => <></>,
                // }}
                />

            </ConfigProvider>
            <ReassignmentDetailsModal state={this.reassignmentDetails} onClose={() => this.reassignmentDetails = null} />
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
}


@observer
export class ReassignmentDetailsModal extends Component<{ state: ReassignmentState | null, onClose: () => void }> {
    lastState: ReassignmentState | null;

    render() {
        const state = this.lastState ?? this.props.state;
        if (state == null) return null;
        const visible = this.props.state != null;
        if (this.lastState != state) this.lastState = state;

        const settings = uiSettings.reassignment;

        return <Modal
            title={"Reassignment: " + state.topicName}
            visible={visible}
            okButtonProps={{ style: { display: 'none' } }}
            cancelText="Close"
            onCancel={this.props.onClose}
            maskClosable={true}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3em', }}>

                <div style={{ display: 'flex', gap: '1em' }}>
                    <Slider style={{ minWidth: '300px', margin: '0 1em', paddingBottom: '2em', flex: 1 }}
                        min={2} max={12} step={0.1}
                        marks={{ 2: "Off", 3: "1kB", 6: "1MB", 9: "1GB", 12: "1TB", }}
                        included={true}
                        tipFormatter={f => settings.maxReplicationTraffic < 1000
                            ? 'No limit'
                            : prettyBytesOrNA(settings.maxReplicationTraffic) + '/s'}

                        value={Math.log10(settings.maxReplicationTraffic)}
                        onChange={sv => {
                            const n = Number(sv.valueOf());
                            const newLimit = Math.pow(10, n);
                            if (newLimit >= 1000) {
                                settings.maxReplicationTraffic = newLimit;
                            }
                            else {
                                if (newLimit < 500)
                                    settings.maxReplicationTraffic = 0;
                                else settings.maxReplicationTraffic = 1000;
                            }
                        }}
                    />
                    <Button type='primary' onClick={() => this.applyBandwidthThrottle()}>Apply</Button>
                </div>

                <Popconfirm title="Are you sure you want to stop the reassignment?" okText="Yes" cancelText="No"
                    onConfirm={() => this.cancelReassignment()}
                >
                    <Button type='dashed' danger>Cancel Reassignment</Button>
                </Popconfirm>

            </div>

        </Modal>
    }

    applyBandwidthThrottle() {

    }

    resetBandwidthThrottle() {
        //resetTrafficLimit(rq.topics.map(t => t.topicName), api.clusterInfo!.brokers.map(b => b.brokerId));
    }

    cancelReassignment() {

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
                left={state.progressPercent.toFixed(1) + '%'}
                right={<>{prettyBytesOrNA(transferred)} / {prettyBytesOrNA(state.totalTransferSize)}</>} />
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

        const bps = state.estimateSpeed > 0
            ? prettyBytesOrNA(state.estimateSpeed) + "/s"
            : '-';
        return <>
            <span style={{ marginRight: '1em' }}>
                {prettyMilliseconds(remainingMs, { secondsDecimalDigits: 0, unitCount: 2 })}
            </span>
            <span>
                ({bps})
            </span>
        </>

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