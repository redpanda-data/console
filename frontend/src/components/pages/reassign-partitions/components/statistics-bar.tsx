import type { ComponentStyleVars } from 'components/style-vars';
import 'components/legacy-layout.css';
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

import { useApiStoreHook } from '../../../../state/backend-api';
import type { Broker, Partition } from '../../../../state/rest-interfaces';
import { arrayDistinct, arraySum } from '../../../../utils/array-utils';
import { isPresent } from '../../../../utils/type-guards';
import { prettyBytesOrNA } from '../../../../utils/utils';
import type { PartitionSelection } from '../reassign-partitions';

export function SelectionInfoBar(props: { partitionSelection: PartitionSelection; margin?: string }) {
  const topicPartitions = useApiStoreHook((s) => s.topicPartitions);
  const clusterInfo = useApiStoreHook((s) => s.clusterInfo);

  if (topicPartitions === null) {
    return null;
  }

  const selectedPartitions = selectedTopicPartitions(topicPartitions, props.partitionSelection);
  const involvedBrokers = clusterInfo === null ? null : brokersInvolvedIn(selectedPartitions, clusterInfo.brokers);

  const data = selectionStatistics(selectedPartitions, involvedBrokers);

  return (
    <div className="console-variable-margin" style={{ '--console-margin': props.margin } as ComponentStyleVars}>
      <h4>Current Selection</h4>
      <div className="console-selection-statistics">
        {data.map((item) => (
          <div key={item.title}>
            <div className="console-selection-statistic-label">{item.title}</div>
            <div>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
type SelectedTopicPartitions = {
  topic: string;
  partitions: Partition[];
};
/** The figures shown for the selection; broker and rack counts stay '...' until the brokers are known. */
function selectionStatistics(selectedPartitions: SelectedTopicPartitions[], involvedBrokers: Broker[] | null) {
  const allSelectedPartitions = selectedPartitions.flatMap((p) => p.partitions);
  const partitionCountLeaders = allSelectedPartitions.length;
  const totalPartitionsCount = arraySum(allSelectedPartitions, (t) => t.replicas.length);
  return [
    { title: 'Leader Partitions', value: partitionCountLeaders },
    { title: 'Total Partitions', value: totalPartitionsCount },
    { title: 'Involved Topics', value: selectedPartitions.length },
    { title: 'Involved Brokers', value: involvedBrokers?.length ?? '...' },
    { title: 'Involved Racks', value: arrayDistinct(involvedBrokers?.map((b) => b.rack))?.length ?? '...' },
    {
      title: 'Size',
      value: prettyBytesOrNA(arraySum(allSelectedPartitions, (p) => p.replicas.length * p.replicaSize)),
    },
  ];
}

/** The selected partitions of every loaded topic that has a selection. */
function selectedTopicPartitions(
  topicPartitions: Map<string, Partition[] | null>,
  partitionSelection: PartitionSelection
): SelectedTopicPartitions[] {
  const selectedPartitions: SelectedTopicPartitions[] = [];
  for (const [topic, partitions] of topicPartitions) {
    if (partitions === null) {
      continue;
    }
    if (!isPresent(partitionSelection[topic])) {
      continue;
    }
    const relevantPartitions = partitions.filter((p) => partitionSelection[topic].includes(p.id));
    selectedPartitions.push({ topic, partitions: relevantPartitions });
  }
  return selectedPartitions;
}

/** The brokers leading or hosting a replica of any selected partition. */
function brokersInvolvedIn(selectedPartitions: SelectedTopicPartitions[], brokers: Broker[]): Broker[] {
  const brokerIds = new Set<number>();
  for (const t of selectedPartitions) {
    for (const p of t.partitions) {
      brokerIds.add(p.leader);
      for (const id of p.replicas) {
        brokerIds.add(id);
      }
    }
  }
  return brokers.filter((b) => brokerIds.has(b.brokerId));
}
