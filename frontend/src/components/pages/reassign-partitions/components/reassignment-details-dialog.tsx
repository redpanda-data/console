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
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Label } from 'components/redpanda-ui/components/label';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { SkeletonText } from 'components/redpanda-ui/components/skeleton';
import { Component, type FC, useState } from 'react';
import { showToast, updateToast } from 'utils/toast.utils';

import { api } from '../../../../state/backend-api';
import { quickTable } from '../../../../utils/tsx-utils';
import type { ReassignmentState } from '../logic/reassignment-tracker';

const CancelReassignmentButton: FC<{ onConfirm: () => void }> = ({ onConfirm }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger render={<Button variant="destructive-outline">Cancel Reassignment</Button>} />
      <PopoverContent>
        <div className="flex flex-col gap-3">
          <PopoverTitle>Confirmation</PopoverTitle>
          <div>Are you sure you want to stop the reassignment?</div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setIsOpen(false)} size="sm" variant="ghost">
              Keep running
            </Button>
            <Button onClick={onConfirm} size="sm" variant="primary">
              Stop reassignment
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

function topicConfigOrRefresh(topicName: string) {
  const topicConfig = api.topicConfig.get(topicName);
  if (!topicConfig) {
    setTimeout(() => {
      api.refreshTopicConfig(topicName);
    });
  }
  return topicConfig;
}

/**
 * Refresh topic configuration on visibility changes so the throttle state is accurate. A reassignment is throttled only if a moving partition/broker pair matches: leader entries cover source replicas, follower entries cover new replicas.
 */
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
    this.trackVisibility(state);
    const visible = this.props.state !== null;

    const topicConfig = this.topicConfigOrRefresh(state.topicName);

    return (
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            this.props.onClose();
          }
        }}
        open={visible}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Reassignment: {state.topicName}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {topicConfig ? (
              this.renderDetails(state)
            ) : (
              <div className="mt-5">
                <SkeletonText lines={5} width="full" />
              </div>
            )}
          </DialogBody>
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

  trackVisibility(state: ReassignmentState) {
    if (this.lastState !== state) {
      this.lastState = state;
    }

    const visible = this.props.state !== null;
    if (this.wasVisible !== visible) {
      setTimeout(async () => {
        api.topicConfig.delete(state.topicName);
        await api.refreshTopicConfig(state.topicName, true);
        this.setState({ shouldThrottle: this.isThrottled() });
      });
    }
    this.wasVisible = visible;
  }

  topicConfigOrRefresh = topicConfigOrRefresh;

  renderDetails(state: ReassignmentState) {
    const replicas = state.partitions.flatMap((p) => p.replicas).distinct();
    const addingReplicas = state.partitions.flatMap((p) => p.addingReplicas).distinct();
    const removingReplicas = state.partitions.flatMap((p) => p.removingReplicas).distinct();

    return (
      <div className="flex flex-col gap-12">
        <div className="flex flex-col gap-4">
          <div>
            {quickTable([
              ['Replicas', replicas],
              ['Adding', addingReplicas],
              ['Removing', removingReplicas],
            ])}
          </div>
        </div>

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

        <CancelReassignmentButton onConfirm={() => this.cancelReassignment()} />
      </div>
    );
  }

  isThrottled() {
    if (!this.lastState) {
      return false;
    }
    const config = api.topicConfig.get(this.lastState.topicName);
    if (!config) {
      return false;
    }

    const leaderThrottleEntries = parseThrottledReplicas(
      config.configEntries.first((e) => e.name === 'leader.replication.throttled.replicas')?.value
    );
    const followerThrottleEntries = parseThrottledReplicas(
      config.configEntries.first((e) => e.name === 'follower.replication.throttled.replicas')?.value
    );

    return (
      anyPartitionThrottled(leaderThrottleEntries, this.lastState.partitions, (p) => p.replicas) ||
      anyPartitionThrottled(followerThrottleEntries, this.lastState.partitions, (p) => p.addingReplicas)
    );
  }

  applyBandwidthThrottle() {
    const state = this.props.state;
    if (state === null) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('apply bandwidth throttle: this.props.state is null');
      return;
    }

    if (this.state.shouldThrottle) {
      api.setThrottledReplicas([
        {
          topicName: state.topicName,
          ...throttledReplicasOf(state),
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

    if (await cancelReassignmentWithToast(state)) {
      this.props.onClose();
    }
  }
}

type ThrottledReplica = { partitionId: number; brokerId: number };

function parseThrottledReplicas(value: string | null | undefined) {
  const replicas: ThrottledReplica[] | undefined = value
    ?.split(',')
    .map((e) => {
      const ar = e.split(':');
      if (ar.length !== 2) {
        return null;
      }
      return { partitionId: Number(ar[0]), brokerId: Number(ar[1]) };
    })
    .filterNull();
  return replicas;
}

function anyPartitionThrottled(
  entries: ThrottledReplica[] | undefined,
  partitions: ReassignmentState['partitions'],
  brokersOf: (p: ReassignmentState['partitions'][number]) => number[]
) {
  if (!entries) {
    return false;
  }
  return partitions.some((p) => {
    const brokers = new Set(brokersOf(p));
    return entries.any((e) => e.partitionId === p.partitionId && brokers.has(e.brokerId));
  });
}

function throttledReplicasOf(state: ReassignmentState) {
  const leaderReplicas: ThrottledReplica[] = [];
  const followerReplicas: ThrottledReplica[] = [];
  for (const { partitionId, replicas: brokersOld, addingReplicas: brokersNew } of state.partitions) {
    if (brokersOld === null || brokersNew === null) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.warn(
        "active reassignments, traffic limit: skipping partition because old or new brokers can't be found",
        { state }
      );
      continue;
    }

    leaderReplicas.push(...brokersOld.map((sourceBroker) => ({ partitionId, brokerId: sourceBroker })));

    followerReplicas.push(
      ...brokersNew.except(brokersOld).map((targetBroker) => ({ partitionId, brokerId: targetBroker }))
    );
  }
  return { leaderReplicas, followerReplicas };
}

async function cancelReassignmentWithToast(state: ReassignmentState) {
  const toastRef = showToast({
    status: 'loading',
    description: `Cancelling reassignment of '${state.topicName}'...`,
  });

  try {
    const cancelRequest = {
      topics: [
        {
          topicName: state.topicName,
          partitions: state.partitions.map((p) => ({
            partitionId: p.partitionId,
            replicas: null,
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
    return true;
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(`cancel reassignment: ${String(err)}`);
    updateToast(toastRef, {
      status: 'error',
      description: `Cancelling reassignment of '${state.topicName}': Error`,
      duration: 1000,
    });
    return false;
  }
}
