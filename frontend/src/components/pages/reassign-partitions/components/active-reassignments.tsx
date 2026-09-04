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

import { Button } from 'components/redpanda-ui/components/button';
import { ButtonGroup } from 'components/redpanda-ui/components/button-group';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import { DataTable } from 'components/redpanda-ui/components/data-table';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Label } from 'components/redpanda-ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Progress } from 'components/redpanda-ui/components/progress';
import { SkeletonText } from 'components/redpanda-ui/components/skeleton';
import React, { Component, type FC, type JSX, useRef, useState } from 'react';
import { showToast, updateToast } from 'utils/toast.utils';

import { BandwidthSlider } from './bandwidth-slider';
import { api } from '../../../../state/backend-api';
import type { ConfigEntry } from '../../../../state/rest-interfaces';
import { QuickTable } from '../../../../utils/tsx-utils';
import { prettyBytesOrNA, prettyMilliseconds } from '../../../../utils/utils';
import { BrokerList } from '../../../misc/broker-list';
import type { ReassignmentState } from '../logic/reassignment-tracker';
import { reassignmentTracker } from '../reassign-partitions';

export class ActiveReassignments extends Component<{
  throttledTopics: string[];
  onRemoveThrottleFromTopics: () => void;
}> {
  pageConfig = { defaultPageSize: 5 };

  state = {
    reassignmentDetails: null as ReassignmentState | null,
    showThrottleDialog: false,
  };

  constructor(p: {
    throttledTopics: string[];
    onRemoveThrottleFromTopics: () => void;
  }) {
    super(p);
    api.refreshCluster(true);
  }

  render() {
    const leaderThrottle = [...api.brokerConfigs.values()]
      .filter((c) => typeof c !== 'string')
      .flatMap((c) => c as ConfigEntry[])
      .filter((c) => c !== undefined)
      .first((e) => e.name === 'leader.replication.throttled.rate');
    const followerThrottle = [...api.brokerConfigs.values()]
      .filter((c) => typeof c !== 'string')
      .flatMap((c) => c as ConfigEntry[])
      .filter((c) => c !== undefined)
      .first((e) => e.name === 'follower.replication.throttled.rate');

    const throttleSettings = {
      leaderThrottle: leaderThrottle ? Number(leaderThrottle.value) : undefined,
      followerThrottle: followerThrottle ? Number(followerThrottle.value) : undefined,
    };

    const minThrottle =
      throttleSettings.followerThrottle === undefined && throttleSettings.leaderThrottle === undefined
        ? undefined
        : Math.min(
            throttleSettings.followerThrottle ?? Number.POSITIVE_INFINITY,
            throttleSettings.leaderThrottle ?? Number.POSITIVE_INFINITY
          );

    const throttleText =
      minThrottle === undefined ? 'Throttle: Not set (unlimited)' : <>Throttle: {prettyBytesOrNA(minThrottle)}/s</>;

    const currentReassignments = reassignmentTracker.trackingReassignments ?? [];

    return (
      <>
        {/* Title */}
        <div className="currentReassignments" style={{ display: 'flex', placeItems: 'center', marginBottom: '.5em' }}>
          <span className="title">Current Reassignments</span>

          {
            // RedPand cluster throttles as needed, the api does not support setting the throttle manually
            !api.isRedpanda && (
              <Button
                onClick={() => {
                  this.setState({ showThrottleDialog: true });
                }}
                size="sm"
                style={{ fontSize: 'smaller', padding: '0px 8px' }}
                variant="link"
              >
                {throttleText}
              </Button>
            )
          }
        </div>

        {/* Table */}
        <DataTable<ReassignmentState>
          columns={[
            {
              header: 'Topic',
              size: 1,
              cell: ({ row: { original } }) => <TopicNameCol state={original} />,
            },
            {
              header: 'Progress',
              size: Number.POSITIVE_INFINITY,
              cell: ({ row: { original } }) => <ProgressCol state={original} />,
            },
            {
              header: 'ETA',
              size: 100,
              cell: ({ row: { original } }) => <ETACol state={original} />,
            },
            {
              header: 'Brokers',
              size: 1,
              cell: ({ row: { original } }) => <BrokersCol state={original} />,
            },
          ]}
          data={currentReassignments}
          emptyText="No reassignments currently in progress"
          getRowAriaLabel={(row) => `Show reassignment details for ${row.original.topicName}`}
          onRow={(row) => {
            this.setState({ reassignmentDetails: row.original });
          }}
          pagination
          sorting={false}
          tableOptions={{ initialState: { pagination: { pageIndex: 0, pageSize: 10 } } }}
        />

        <ReassignmentDetailsDialog
          onClose={() => {
            this.setState({ reassignmentDetails: null });
          }}
          state={this.state.reassignmentDetails}
        />
        <ThrottleDialog
          lastKnownMinThrottle={minThrottle}
          onClose={() => {
            this.setState({ showThrottleDialog: false });
          }}
          visible={this.state.showThrottleDialog}
        />

        {this.props.throttledTopics.length > 0 && (
          <Button
            onClick={this.props.onRemoveThrottleFromTopics}
            size="sm"
            style={{ fontSize: 'smaller', padding: '0px 8px' }}
            variant="link"
          >
            <span>
              There are <b>{this.props.throttledTopics.length}</b> throttled topics - click here to fix
            </span>
          </Button>
        )}
      </>
    );
  }
}

export const ThrottleDialog: FC<{
  visible: boolean;
  lastKnownMinThrottle: number | undefined;
  onClose: () => void;
}> = ({ visible, lastKnownMinThrottle, onClose }) => {
  const [newThrottleValue, setNewThrottleValue] = useState<number | null>(lastKnownMinThrottle ?? null);

  const toastRef = useRef<string>(undefined);

  const throttleValue = newThrottleValue ?? 0;
  const noChange = newThrottleValue === lastKnownMinThrottle || newThrottleValue === null;

  const applyBandwidthThrottle = async () => {
    toastRef.current = showToast({
      status: 'loading',
      description: 'Setting throttle rate...',
    });
    const clusterInfo = api.clusterInfo;
    const allBrokers = clusterInfo ? clusterInfo.brokers.map((b) => b.brokerId) : null;
    if (!allBrokers) {
      updateToast(toastRef.current, {
        status: 'error',
        title: 'Error',
        description: 'Cluster info not available',
      });
      return;
    }

    const shouldSet = newThrottleValue !== null && newThrottleValue > 0;
    try {
      if (shouldSet) {
        await api.setReplicationThrottleRate(allBrokers, newThrottleValue as number);
      } else {
        await api.resetReplicationThrottleRate(allBrokers);
      }

      setTimeout(() => {
        // need to update actual value after changing
        api.refreshCluster(true);
      });

      updateToast(toastRef.current, {
        status: 'success',
        description: 'Setting throttle rate... done',
        duration: 2000,
      });
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(`error in applyBandwidthThrottle: ${err}`);
      updateToast(toastRef.current, {
        status: 'error',
        description: 'Setting throttle rate... error',
      });
    }

    onClose();
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={visible}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Throttle Settings</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <div className="mx-4">
              <div>Using throttling you can limit the network traffic for reassignments.</div>
              <ul className="mt-2 list-disc px-6">
                <li>Throttling applies to all replication traffic, not just to active reassignments.</li>
                <li>
                  Once the reassignment completes you'll have to remove the throttling configuration. <br />
                  Console will show a warning below the "Current Reassignments" table when there are throttled topics
                  that are no longer being reassigned.
                </li>
              </ul>
            </div>
            <BandwidthSlider
              onChange={(x) => {
                setNewThrottleValue(x);
              }}
              value={throttleValue}
            />
          </div>
        </DialogBody>
        <DialogFooter className="justify-between">
          <Button
            onClick={() => {
              setNewThrottleValue(null);
              applyBandwidthThrottle().catch(() => {
                // Error handling managed by API layer
              });
            }}
            variant="destructive-outline"
          >
            Remove throttle
          </Button>

          <div className="flex gap-2">
            <Button className="ml-auto" onClick={onClose} variant="ghost">
              Close
            </Button>
            <Button
              disabled={noChange}
              onClick={() => {
                applyBandwidthThrottle().catch(() => {
                  // Error handling managed by API layer
                });
              }}
              variant="primary"
            >
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CancelReassignmentButton: FC<{ onConfirm: () => void }> = ({ onConfirm }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger render={<Button variant="destructive-outline">Cancel Reassignment</Button>} />
      <PopoverContent>
        <div className="flex flex-col gap-3">
          <div className="font-semibold">Confirmation</div>
          <div>Are you sure you want to stop the reassignment?</div>
          <div className="flex justify-end">
            <ButtonGroup>
              <Button onClick={() => setIsOpen(false)} size="sm" variant="ghost">
                Keep running
              </Button>
              <Button onClick={onConfirm} size="sm" variant="primary">
                Stop reassignment
              </Button>
            </ButtonGroup>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export class ReassignmentDetailsDialog extends Component<{ state: ReassignmentState | null; onClose: () => void }> {
  lastState: ReassignmentState | null;
  wasVisible = false;

  state = { shouldThrottle: false };

  constructor(p: { state: ReassignmentState | null; onClose: () => void }) {
    super(p);
  }

  render() {
    if (this.props.state === null) {
      return null;
    }

    const state = this.props.state;
    if (this.lastState !== state) {
      this.lastState = state;
    }

    const visible = this.props.state !== null;
    if (this.wasVisible !== visible) {
      // became visible or invisible
      // force update of topic config, so isThrottle has up to date information
      setTimeout(async () => {
        api.topicConfig.delete(state.topicName);
        await api.refreshTopicConfig(state.topicName, true);
        this.setState({ shouldThrottle: this.isThrottled() });
      });
    }
    this.wasVisible = visible;

    const topicConfig = api.topicConfig.get(state.topicName);
    if (!topicConfig) {
      setTimeout(() => {
        api.refreshTopicConfig(state.topicName);
      });
    }

    const replicas = state.partitions.flatMap((p) => p.replicas).distinct();
    const addingReplicas = state.partitions.flatMap((p) => p.addingReplicas).distinct();
    const removingReplicas = state.partitions.flatMap((p) => p.removingReplicas).distinct();

    const modalContent = topicConfig ? (
      <div className="flex flex-col gap-12">
        {/* Info */}
        <div className="flex flex-col gap-4">
          <div>
            {QuickTable([
              ['Replicas', replicas],
              ['Adding', addingReplicas],
              ['Removing', removingReplicas],
            ])}
          </div>
        </div>

        {/* Throttle */}
        <div className="flex gap-4">
          <Checkbox
            checked={this.state.shouldThrottle}
            id="throttle-reassignment"
            onCheckedChange={(checked) => {
              this.setState({ shouldThrottle: checked === true });
            }}
          />
          <Label className="cursor-pointer" htmlFor="throttle-reassignment">
            <span>
              <span>Throttle Reassignment</span>
              <br />
              <span className="ml-8 text-body-sm opacity-60">
                Using global throttle limit for all replication traffic
              </span>
            </span>
          </Label>
        </div>

        {/* Cancel */}
        <CancelReassignmentButton onConfirm={() => this.cancelReassignment()} />
      </div>
    ) : (
      <SkeletonText className="mt-5" lines={5} width="full" />
    );

    return (
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            this.props.onClose();
          }
        }}
        open={visible}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Reassignment: {state.topicName}</DialogTitle>
          </DialogHeader>
          <DialogBody>{modalContent}</DialogBody>
          <DialogFooter>
            <Button onClick={this.props.onClose} variant="ghost">
              Close
            </Button>
            <Button
              disabled={!topicConfig}
              onClick={() => {
                this.applyBandwidthThrottle();
                this.props.onClose();
              }}
              variant="primary"
            >
              Apply &amp; Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
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
    const leaderThrottleValue = config.configEntries.first((e) => e.name === 'leader.replication.throttled.replicas');
    const leaderThrottleEntries = leaderThrottleValue?.value
      ?.split(',')
      .map((e) => {
        const ar = e.split(':');
        if (ar.length !== 2) {
          return null;
        }
        return { partitionId: Number(ar[0]), brokerId: Number(ar[1]) };
      })
      .filterNull();

    if (leaderThrottleEntries) {
      // Go through all partitions that are being reassigned
      for (const p of this.lastState.partitions) {
        const sourceBrokers = p.replicas;

        // ...and check if this broker-partition combo is being throttled
        const hasThrottle = leaderThrottleEntries.any(
          (e) => e.partitionId === p.partitionId && sourceBrokers.includes(e.brokerId)
        );

        if (hasThrottle) {
          return true;
        }
      }
    }

    // partitionId:brokerId, ...
    const followerThrottleValue = config.configEntries.first(
      (e) => e.name === 'follower.replication.throttled.replicas'
    );
    const followerThrottleEntries = followerThrottleValue?.value
      ?.split(',')
      .map((e) => {
        const ar = e.split(':');
        if (ar.length !== 2) {
          return null;
        }
        return { partitionId: Number(ar[0]), brokerId: Number(ar[1]) };
      })
      .filterNull();

    if (followerThrottleEntries) {
      // Go through all partitions that are being reassigned
      for (const p of this.lastState.partitions) {
        const targetBrokers = p.addingReplicas;

        // ...and check if this broker-partition combo is being throttled
        const hasThrottle = followerThrottleEntries.any(
          (e) => e.partitionId === p.partitionId && targetBrokers.includes(e.brokerId)
        );

        if (hasThrottle) {
          return true;
        }
      }
    }

    return false;
  }

  applyBandwidthThrottle() {
    const state = this.props.state;
    if (state === null) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('apply bandwidth throttle: this.props.state is null');
      return;
    }

    if (this.state.shouldThrottle) {
      const leaderReplicas: { partitionId: number; brokerId: number }[] = [];
      const followerReplicas: { partitionId: number; brokerId: number }[] = [];
      for (const p of state.partitions) {
        const partitionId = p.partitionId;
        const brokersOld = p.replicas;
        const brokersNew = p.addingReplicas;

        if (brokersOld === null || brokersNew === null) {
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.warn(
            "active reassignments, traffic limit: skipping partition because old or new brokers can't be found",
            { state }
          );
          continue;
        }

        // leader throttling is applied to all sources (all brokers that have a replica of this partition)
        for (const sourceBroker of brokersOld) {
          leaderReplicas.push({ partitionId, brokerId: sourceBroker });
        }

        // follower throttling is applied only to target brokers that do not yet have a copy
        const newBrokers = brokersNew.except(brokersOld);
        for (const targetBroker of newBrokers) {
          followerReplicas.push({ partitionId, brokerId: targetBroker });
        }
      }

      api.setThrottledReplicas([
        {
          topicName: state.topicName,
          leaderReplicas,
          followerReplicas,
        },
      ]);
    } else {
      api.resetThrottledReplicas([state.topicName]);
    }
  }

  async cancelReassignment() {
    const state = this.props.state;
    if (state === null) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('cancel reassignment: this.props.state is null');
      return;
    }

    const partitions = state.partitions.map((p) => p.partitionId);

    const toastRef = showToast({
      status: 'loading',
      description: `Cancelling reassignment of '${state.topicName}'...`,
    });

    try {
      const cancelRequest = {
        topics: [
          {
            topicName: state.topicName,
            partitions: partitions.map((p) => ({
              partitionId: p,
              replicas: null, // cancel
            })),
          },
        ],
      };
      const response = await api.startPartitionReassignment(cancelRequest);

      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.log('cancel reassignment result', { request: cancelRequest, response });

      updateToast(toastRef, {
        status: 'success',
        description: `Cancelling reassignment of '${state.topicName}': Done`,
        duration: 1000,
      });
      this.props.onClose();
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(`cancel reassignment: ${String(err)}`);
      updateToast(toastRef, {
        status: 'error',
        description: `Cancelling reassignment of '${state.topicName}': Error`,
        duration: 1000,
      });
    }
  }
}

export class TopicNameCol extends Component<{ state: ReassignmentState }> {
  render() {
    const { state } = this.props;
    return <span style={{ paddingRight: '2em' }}>{state.topicName}</span>;
    // return <><span className='partitionReassignmentSpinner' style={{ marginRight: '6px' }} />{state.topicName}</>;
  }
}

export class ProgressCol extends Component<{ state: ReassignmentState }> {
  render() {
    const { state } = this.props;

    if (state.remaining === null) {
      return '...';
    }
    const transferred = state.totalTransferSize - state.remaining.value;

    let progressBar: JSX.Element;

    if (state.progressPercent === null) {
      // Starting
      progressBar = (
        <ProgressBar left="Starting..." percent={0} right={prettyBytesOrNA(state.totalTransferSize)} state="active" />
      );
    } else if (state.progressPercent < 100) {
      // Progressing
      progressBar = (
        <ProgressBar
          left={<span>{`${state.progressPercent.toFixed(1)}%`}</span>}
          percent={state.progressPercent}
          right={
            <>
              {state.estimateSpeed !== null && (
                <span style={{ paddingRight: '1em', opacity: '0.6' }}>({prettyBytesOrNA(state.estimateSpeed)}/s)</span>
              )}
              <span>
                {prettyBytesOrNA(transferred)} / {prettyBytesOrNA(state.totalTransferSize)}
              </span>
            </>
          }
          state="active"
        />
      );
    } else {
      // Completed
      progressBar = (
        <ProgressBar left="Complete" percent={100} right={prettyBytesOrNA(state.totalTransferSize)} state="success" />
      );
    }

    return <div style={{ marginBottom: '-6px' }}>{progressBar}</div>;
  }
}

export class ETACol extends Component<{ state: ReassignmentState }> {
  render() {
    const { state } = this.props;

    if (state.estimateSpeed === null || state.estimateCompletionTime === null) {
      return '...';
    }

    const remainingMs = (state.estimateCompletionTime.getTime() - Date.now()).clamp(0, undefined);

    return <span>{prettyMilliseconds(remainingMs, { secondsDecimalDigits: 0, unitCount: 2 })}</span>;
  }
}

export class BrokersCol extends Component<{ state: ReassignmentState }> {
  render() {
    const { state } = this.props;

    const allBrokerIds = state.partitions
      .map((p) => [p.addingReplicas, p.removingReplicas, p.replicas])
      .flat(2)
      .distinct();

    return <BrokerList brokerIds={allBrokerIds} />;
  }
}

const ProgressBar = (p: {
  percent: number;
  state: 'active' | 'success';
  left?: React.ReactNode;
  right?: React.ReactNode;
}) => {
  const { percent, state, left, right } = p;
  return (
    <>
      {/* Chakra's colorScheme becomes an indicator class: the Registry indicator paints `bg-primary`. */}
      <Progress
        className={state === 'success' ? '[&_[data-slot=progress-indicator]]:bg-success' : undefined}
        value={percent}
      />
      <div
        style={{
          display: 'flex',
          marginTop: '1px',
          fontFamily: '"Open Sans", sans-serif',
          fontWeight: 600,
          fontSize: '75%',
        }}
      >
        {Boolean(left) && <div>{left}</div>}
        {Boolean(right) && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
    </>
  );
};
