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

import queryClient from '../../../../query-client';
import { api } from '../../../../state/backend-api';
import type { Broker, Partition } from '../../../../state/rest-interfaces';
import { prettyBytesOrNA } from '../../../../utils/utils';
import type { PartitionSelection } from '../reassign-partitions';

export function SelectionInfoBar(props: { partitionSelection: PartitionSelection; margin?: string }) {
  const topicPartitionsAll = queryClient.getQueryData<Map<string, Partition[] | null>>(['topicPartitionsAll']);
  if (topicPartitionsAll === null) {
    return null;
  }

  const selectedPartitions: { topic: string; partitions: Partition[] }[] = [];
  for (const [topic, partitions] of topicPartitionsAll ?? new Map<string, Partition[] | null>()) {
    if (partitions === null) {
      continue;
    }
    if (!props.partitionSelection[topic]) {
      continue;
    }
    const relevantPartitions = partitions.filter((p) => props.partitionSelection[topic].includes(p.id));
    selectedPartitions.push({ topic, partitions: relevantPartitions });
  }

  let involvedBrokers: Broker[] | null = null;
  if (api.clusterInfo !== null) {
    const brokerIds = new Set<number>();
    for (const t of selectedPartitions) {
      for (const p of t.partitions) {
        brokerIds.add(p.leader);
        for (const id of p.replicas) {
          brokerIds.add(id);
        }
      }
    }
    involvedBrokers = api.clusterInfo.brokers.filter((b) => brokerIds.has(b.brokerId));
  }

  const allSelectedPartitions = selectedPartitions.flatMap((p) => p.partitions);
  const partitionCountLeaders = allSelectedPartitions.length;
  const totalPartitionsCount = allSelectedPartitions.sum((t) => t.replicas.length);

  const data = [
    { title: 'Leader Partitions', value: partitionCountLeaders },
    { title: 'Total Partitions', value: totalPartitionsCount },
    { title: 'Involved Topics', value: selectedPartitions.length },
    { title: 'Involved Brokers', value: involvedBrokers?.length ?? '...' },
    { title: 'Involved Racks', value: involvedBrokers?.map((b) => b.rack).distinct().length ?? '...' },
    {
      title: 'Size',
      value: prettyBytesOrNA(allSelectedPartitions.sum((p) => p.replicas.length * p.replicaSize)),
    },
  ];

  return (
    <div style={{ margin: props.margin }}>
      <h4>Current Selection</h4>
      <div
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          gap: '3em',
          fontFamily: 'Open Sans',
          color: 'hsl(0deg, 0%, 30%)',
          fontSize: '1.1em',
        }}
      >
        {data.map((item) => (
          <div key={item.title}>
            <div style={{ fontSize: '.8em', opacity: 0.6, paddingBottom: '.5em' }}>{item.title}</div>
            <div style={{}}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
