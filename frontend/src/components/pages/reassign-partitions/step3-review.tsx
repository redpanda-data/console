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

import { ChevronDownIcon, ChevronRightIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { DataTable } from 'components/redpanda-ui/components/data-table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { InboxIcon } from 'lucide-react';
import { Component } from 'react';

import { BandwidthSlider } from './components/bandwidth-slider';
import type ReassignPartitions from './reassign-partitions';
import type { PartitionSelection } from './reassign-partitions';
import { api } from '../../../state/backend-api';
import type { Partition, PartitionReassignmentRequest, Topic, TopicAssignment } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton, InfoText } from '../../../utils/tsx-utils';
import { prettyBytesOrNA, prettyMilliseconds } from '../../../utils/utils';
import { BrokerList } from '../../misc/broker-list';

export type PartitionWithMoves = Partition & {
  brokersBefore: number[];
  brokersAfter: number[];
  // numAddedBrokers = number of brokers that are "new" to the partition
  // So only *new* brokers, not counting brokers that have previously (and maybe still are) hosted a replica of the partition
  numAddedBrokers: number;
  numRemovedBrokers: number;
  changedLeader: boolean;
  anyChanges: boolean; // if false, replica assignment is exactly as before
};
export type TopicWithMoves = {
  topicName: string;
  topic: Topic;
  allPartitions: Partition[];
  selectedPartitions: PartitionWithMoves[];
};

export class StepReview extends Component<{
  partitionSelection: PartitionSelection;
  topicsWithMoves: TopicWithMoves[];
  assignments: PartitionReassignmentRequest;
  reassignPartitions: ReassignPartitions; // since api is still changing, we pass parent down so we can call functions on it directly
}> {
  render() {
    if (!api.topics) {
      return DefaultSkeleton;
    }
    if (api.topicPartitions.size === 0) {
      return (
        // `border` explicitly: the Empty root sets only `border-dashed`, and Preflight leaves
        // border-width at 0, so without it the panel is unframed text.
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>No partitions</EmptyTitle>
            <EmptyDescription>Partition data has not loaded yet, so there is nothing to review.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <>
        <div style={{ margin: '2em 1em' }}>
          <h2>Review Reassignment Plan</h2>
          <p>
            Kowl computed the following reassignment plan to distribute the selected partitions onto the selected
            brokers.
          </p>
        </div>

        <DataTable<TopicWithMoves>
          columns={[
            // Chakra's DataTable injected this column whenever `subComponent` was set; the Registry one does not.
            {
              id: 'expander',
              size: 40,
              enableSorting: false,
              cell: ({ row }) =>
                row.getCanExpand() ? (
                  <Button
                    aria-expanded={row.getIsExpanded()}
                    aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
                    onClick={row.getToggleExpandedHandler()}
                    size="icon-xs"
                    variant="ghost"
                  >
                    {row.getIsExpanded() ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </Button>
                ) : null,
            },
            {
              header: 'Topic',
              accessorKey: 'topicName',
            },
            {
              header: 'Brokers Before',
              size: 50,
              cell: ({ row: { original: topic } }) => {
                const brokersBefore = topic.selectedPartitions
                  .flatMap((x) => x.brokersBefore)
                  .distinct()
                  .sort((a, b) => a - b);
                return <BrokerList brokerIds={brokersBefore} />;
              },
            },
            {
              accessorKey: 'Brokers After',
              size: 50,
              cell: ({ row: { original: topic } }) => {
                const plannedBrokers = topic.selectedPartitions
                  .flatMap((x) => x.brokersAfter)
                  .distinct()
                  .sort((a, b) => a - b);
                return <BrokerList brokerIds={plannedBrokers} />;
              },
            },
            {
              id: 'numAddedBrokers',
              size: 100,
              header: () => (
                <InfoText maxWidth="180px" tooltip="The number of replicas that will be moved to a different broker.">
                  Reassignments
                </InfoText>
              ),
              cell: ({ row: { original: topic } }) => topic.selectedPartitions.sum((p) => p.numAddedBrokers),
            },
            {
              header: 'Estimated Traffic',
              size: 120,
              cell: ({ row: { original: topic } }) =>
                prettyBytesOrNA(topic.selectedPartitions.sum((p) => p.numAddedBrokers * p.replicaSize)),
            },
          ]}
          data={this.props.topicsWithMoves}
          pagination={false}
          sorting={false}
          subComponent={({ row: { original: topic } }) => (
            <div className="px-10 py-6">
              {topic.selectedPartitions ? (
                <ReviewPartitionTable
                  // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
                  assignments={this.props.assignments.topics.first((t) => t.topicName === topic.topicName)!}
                  topic={topic.topic}
                  topicPartitions={topic.selectedPartitions}
                />
              ) : (
                'Error loading partitions'
              )}
            </div>
          )}
        />

        {this.reassignmentOptions()}

        {this.summary()}
      </>
    );
  }

  reassignmentOptions() {
    const settings = uiSettings.reassignment;

    return (
      <div style={{ margin: '4em 1em 3em 1em' }}>
        <h2>Bandwidth Throttle</h2>
        <p>Using throttling you can limit the network traffic for reassignments.</p>

        <div style={{ marginTop: '2em', paddingBottom: '1em' }}>
          <BandwidthSlider
            onSettingsChange={(x) => {
              settings.maxReplicationTraffic = x;
            }}
            settings={settings}
          />
        </div>

        <ul style={{ marginTop: '0.5em' }}>
          <li>Throttling applies to all replication traffic, not just to active reassignments.</li>
          <li>
            Once the reassignment completes you'll have to remove the throttling configuration. <br />
            Console will show a warning below the "Current Reassignments" table when there are throttled topics that are
            no longer being reassigned.
          </li>
        </ul>
      </div>
    );
  }

  summary() {
    const settings = uiSettings.reassignment;
    const maxReplicationTraffic = settings.maxReplicationTraffic ?? 0;

    const trafficStats = this.props.topicsWithMoves.map((t) => {
      const partitionStats = t.selectedPartitions.map((p) => {
        const totalTraffic = p.replicaSize * p.numAddedBrokers;

        if (totalTraffic === 0) {
          // Moving zero replicas or replicas with zero size won't take any time
          return {
            ...p,
            totalTraffic: 0,
            potentialBandwidth: 0,
            estimatedTimeSec: 0,
          };
        }

        // if there are 2 senders and 2 receivers, the bandwidth limit is effectively double
        // but for (1sender and 2receivers), or (2senders and 1receiver) it won't go any faster.
        const senders = p.brokersBefore.except(p.brokersAfter);
        const receivers = p.brokersAfter.except(p.brokersBefore);

        const participatingTransferPairs = Math.min(senders.length, receivers.length);
        const potentialBandwidth = participatingTransferPairs * maxReplicationTraffic;

        let estimatedTimeSec = totalTraffic / potentialBandwidth;
        if (estimatedTimeSec <= 0 || !Number.isFinite(estimatedTimeSec)) {
          estimatedTimeSec = 0;
        }

        return {
          ...p,
          totalTraffic,
          potentialBandwidth,
          estimatedTimeSec,
        };
      });

      return {
        ...t,
        partitionStats,
      };
    });
    const estimatedTimeSec = trafficStats.sum((t) => t.partitionStats.sum((p) => p.estimatedTimeSec));

    const totalTraffic = trafficStats.sum((t) => t.partitionStats.sum((p) => p.totalTraffic));

    const isThrottled = settings.maxReplicationTraffic !== null && settings.maxReplicationTraffic > 0;
    const trafficThrottle = isThrottled ? `${prettyBytesOrNA(settings.maxReplicationTraffic ?? 0)}/s` : 'disabled';

    const estimatedTime = (() => {
      if (!isThrottled) {
        return '-';
      }
      if (estimatedTimeSec < 10) {
        return '< 10 seconds';
      }
      return prettyMilliseconds(estimatedTimeSec * 1000, { secondsDecimalDigits: 0, unitCount: 2, verbose: true });
    })();

    const data = [
      {
        title: 'Moved Replicas',
        value: this.props.topicsWithMoves.sum((t) => t.selectedPartitions.sum((p) => p.numAddedBrokers)),
      },
      { title: 'Total Traffic', value: `~${prettyBytesOrNA(totalTraffic)}` },
      { title: 'Traffic Throttle', value: trafficThrottle },
      { title: 'Estimated Time', value: estimatedTime },
    ];

    return (
      <div style={{ margin: '2em 1em 5em 1em' }}>
        <h2>Summary</h2>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '3em',
            marginTop: '1em',
            color: 'var(--color-foreground)',
          }}
        >
          {data.map((item) => (
            <div key={item.title}>
              <div style={{ opacity: 0.6 }}>{item.title}</div>
              <div style={{ fontSize: 'calc(1em * 24 / 14)' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
}

const ReviewPartitionTable = (props: { topic: Topic; topicPartitions: Partition[]; assignments: TopicAssignment }) => (
  <div className="w-full py-2">
    <DataTable<Partition>
      columns={[
        {
          header: 'Partition',
          accessorKey: 'id',
        },
        {
          header: 'Brokers Before',
          cell: ({ row: { original: partition } }) => (
            <BrokerList brokerIds={partition.replicas} leaderId={partition.leader} />
          ),
        },
        {
          header: 'Brokers After',
          cell: ({ row: { original: partition } }) => {
            const partitionAssignments = props.assignments.partitions.first((p) => p.partitionId === partition.id);
            if (
              partitionAssignments === null ||
              partitionAssignments === undefined ||
              partitionAssignments.replicas === null
            ) {
              return '??';
            }
            return <BrokerList brokerIds={partitionAssignments.replicas} leaderId={partitionAssignments.replicas[0]} />;
          },
        },
      ]}
      data={props.topicPartitions}
      pagination={false}
      sorting={false}
    />
  </div>
);
