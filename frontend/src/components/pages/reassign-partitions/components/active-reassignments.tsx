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
import { DataTable } from 'components/redpanda-ui/components/data-table';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Progress } from 'components/redpanda-ui/components/progress';
import React, { Component, type FC, type JSX, useRef, useState } from 'react';
import { showToast, updateToast } from 'utils/toast.utils';

import { BandwidthSlider } from './bandwidth-slider';
import { ReassignmentDetailsDialog } from './reassignment-details-dialog';
import { api } from '../../../../state/backend-api';
import type { ConfigEntry } from '../../../../state/rest-interfaces';
import { prettyBytesOrNA, prettyMilliseconds } from '../../../../utils/utils';
import { BrokerList } from '../../../misc/broker-list';
import type { ReassignmentState } from '../logic/reassignment-tracker';
import { reassignmentTracker } from '../reassign-partitions';

export { ReassignmentDetailsDialog } from './reassignment-details-dialog';

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
        <div className="currentReassignments">
          <span className="title">Current Reassignments</span>

          {
            // RedPand cluster throttles as needed, the api does not support setting the throttle manually
            !api.isRedpanda && (
              <Button
                onClick={() => {
                  this.setState({ showThrottleDialog: true });
                }}
                size="xs"
                variant="link"
              >
                {throttleText}
              </Button>
            )
          }
        </div>

        <DataTable<ReassignmentState>
          columns={[
            {
              header: 'Topic',
              cell: ({ row: { original } }) => <TopicNameCol state={original} />,
            },
            {
              header: 'Progress',
              // The Registry DataTable ignores column sizes; a viewport-wide max-content hands this column the slack.
              cell: ({ row: { original } }) => (
                <div className="w-screen max-w-full">
                  <ProgressCol state={original} />
                </div>
              ),
            },
            {
              header: 'ETA',
              cell: ({ row: { original } }) => <ETACol state={original} />,
            },
            {
              header: 'Brokers',
              cell: ({ row: { original } }) => <BrokersCol state={original} />,
            },
          ]}
          data={currentReassignments}
          emptyText="No reassignments currently in progress"
          getRowAriaLabel={(row) => `Show reassignment details for ${row.original.topicName}`}
          onRow={(row) => {
            this.setState({ reassignmentDetails: row.original });
          }}
          pagination={currentReassignments.length > 10}
          sorting={false}
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
          <Button onClick={this.props.onRemoveThrottleFromTopics} size="xs" variant="link">
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

  // Takes the value explicitly: 'Remove throttle' clears state and applies in the same tick.
  const applyBandwidthThrottle = async (value: number | null) => {
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

    await changeThrottleRate(toastRef.current, allBrokers, value);

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
      {/* Nearest rung to the old 48rem minimum. */}
      <DialogContent size="lg">
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
        <DialogFooter justify="between">
          <Button
            onClick={() => {
              setNewThrottleValue(null);
              applyBandwidthThrottle(null).catch(() => {
                // Error handling managed by API layer
              });
            }}
            variant="destructive-outline"
          >
            Remove throttle
          </Button>

          <div className="flex gap-2">
            <Button onClick={onClose} variant="ghost">
              Close
            </Button>
            <Button
              disabled={noChange}
              onClick={() => {
                applyBandwidthThrottle(newThrottleValue).catch(() => {
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

/** Sets the throttle rate on every broker, or resets it when `value` is not positive, reporting the outcome in the toast. */
async function changeThrottleRate(toastId: string, brokerIds: number[], value: number | null) {
  const shouldSet = value !== null && value > 0;
  try {
    if (shouldSet) {
      await api.setReplicationThrottleRate(brokerIds, value);
    } else {
      await api.resetReplicationThrottleRate(brokerIds);
    }

    setTimeout(() => {
      api.refreshCluster(true);
    });

    updateToast(toastId, {
      status: 'success',
      description: 'Setting throttle rate... done',
      duration: 2000,
    });
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(`error in applyBandwidthThrottle: ${err}`);
    updateToast(toastId, {
      status: 'error',
      description: 'Setting throttle rate... error',
    });
  }
}

export function TopicNameCol({ state }: { state: ReassignmentState }) {
  return <span style={{ paddingRight: '2em' }}>{state.topicName}</span>;
}

export function ProgressCol({ state }: { state: ReassignmentState }) {
  if (state.remaining === null) {
    return '...';
  }
  const transferred = state.totalTransferSize - state.remaining.value;

  let progressBar: JSX.Element;

  if (state.progressPercent === null) {
    progressBar = <ProgressBar left="Starting..." percent={0} right={prettyBytesOrNA(state.totalTransferSize)} />;
  } else if (state.progressPercent < 100) {
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
      />
    );
  } else {
    progressBar = <ProgressBar left="Complete" percent={100} right={prettyBytesOrNA(state.totalTransferSize)} />;
  }

  return <div style={{ marginBottom: '-6px' }}>{progressBar}</div>;
}

export function ETACol({ state }: { state: ReassignmentState }) {
  if (state.estimateSpeed === null || state.estimateCompletionTime === null) {
    return '...';
  }

  const remainingMs = (state.estimateCompletionTime.getTime() - Date.now()).clamp(0, undefined);

  return <span>{prettyMilliseconds(remainingMs, { secondsDecimalDigits: 0, unitCount: 2 })}</span>;
}

export function BrokersCol({ state }: { state: ReassignmentState }) {
  const allBrokerIds = state.partitions
    .map((p) => [p.addingReplicas, p.removingReplicas, p.replicas])
    .flat(2)
    .distinct();

  return <BrokerList brokerIds={allBrokerIds} />;
}

const ProgressBar = (p: { percent: number; left?: React.ReactNode; right?: React.ReactNode }) => {
  const { percent, left, right } = p;
  return (
    <>
      <Progress value={percent} />
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
