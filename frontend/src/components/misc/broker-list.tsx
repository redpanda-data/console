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

import { clsx } from 'clsx';
import { ChevronRightIcon } from 'components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import React, { Component } from 'react';

import { api, brokerMap } from '../../state/backend-api';
import type { Broker, Partition } from '../../state/rest-interfaces';
import { arrayDistinct } from '../../utils/array-utils';
import { isPresent } from '../../utils/type-guards';

type BrokerListProps =
  | {
      brokerIds: number[];
      addedIds?: number[];
      removedIds?: number[];
      leaderId?: number;
    }
  | {
      partition: Partition;
    };
export class BrokerList extends Component<BrokerListProps> {
  constructor(p: BrokerListProps) {
    super(p);
    if (!api.clusterInfo) {
      setTimeout(() => api.refreshCluster());
    }
  }

  render() {
    const state = getBrokerListState(this.props);
    if (!state) {
      return null;
    }
    const brokers = brokerMap.get();
    const tags = state.sortedIds.map((id) => <BrokerTag brokers={brokers} id={id} key={id} state={state} />);

    return (
      <span className="cursor-pointer">
        <span className="brokerTagList">{tags}</span>
      </span>
    );
  }
}

function BrokerTooltip(p: { broker: Broker; children?: React.ReactElement; tooltipSuffix?: React.ReactNode }) {
  const broker = p.broker;
  const id = broker.brokerId;

  const tooltipContentEntries = [
    <b className="mb-1.25 block w-full border-b" key={1}>
      Broker ID {id}
    </b>,
    <div key={2}>{broker.address}</div>,
    <React.Fragment key={3}>{Boolean(broker.rack) && <div>{broker.rack}</div>}</React.Fragment>,
    <React.Fragment key={4}>{Boolean(p.tooltipSuffix) ? p.tooltipSuffix : null}</React.Fragment>,
  ];

  const tooltipContent = <div className="max-w-75 text-start">{tooltipContentEntries}</div>;

  return (
    <Tooltip>
      <TooltipTrigger render={p.children} />
      <TooltipContent side="top">{tooltipContent}</TooltipContent>
    </Tooltip>
  );
}

function getBrokerListState(props: BrokerListProps) {
  if ('partition' in props) {
    return {
      leaderId: props.partition.leader,
      sortedIds: arrayDistinct(props.partition.replicas).sort((a, b) => a - b),
      offlineIds: props.partition.offlineReplicas ?? [],
      addedIds: [] as number[],
      removedIds: [] as number[],
    };
  }
  if (!isPresent(props.brokerIds)) {
    return null;
  }
  return {
    leaderId: props.leaderId ?? -1,
    sortedIds: arrayDistinct(props.brokerIds).sort((a, b) => a - b),
    offlineIds: [] as number[],
    addedIds: props.addedIds ?? [],
    removedIds: props.removedIds ?? [],
  };
}

function BrokerTag({
  id,
  state,
  brokers,
}: {
  id: number;
  state: NonNullable<ReturnType<typeof getBrokerListState>>;
  brokers: ReturnType<typeof brokerMap.get>;
}) {
  const broker = brokers?.get(id);
  const isLeader = id === state.leaderId;
  const isAdding = state.addedIds.includes(id);
  const isRemoving = state.removedIds.includes(id);
  const className = clsx('broker-tag', {
    leader: isLeader,
    offline: state.offlineIds.includes(id),
    added: isAdding,
    removed: isRemoving,
  });
  const tag = (
    <div className={className}>
      <span>{id ?? '?'}</span>
    </div>
  );
  if (!broker) {
    return tag;
  }
  return (
    <BrokerTooltip
      broker={broker}
      tooltipSuffix={<BrokerTransferDetails isAdding={isAdding} isLeader={isLeader} isRemoving={isRemoving} />}
    >
      {tag}
    </BrokerTooltip>
  );
}

function BrokerTransferDetails({
  isLeader,
  isAdding,
  isRemoving,
}: {
  isLeader: boolean;
  isAdding: boolean;
  isRemoving: boolean;
}) {
  return (
    <>
      {isLeader ? (
        <div className="mt-[5px]">
          <ChevronRightIcon className="svgCenter -mr-0.5 -ml-1" height="15px" />
          This broker is the leader for this partition
        </div>
      ) : null}
      {isAdding ? (
        <div className="mt-[5px] text-success">Partitions are currently being transferred to this broker.</div>
      ) : null}
      {isRemoving ? (
        <div className="mt-[5px] text-warning">
          Once the assignment completes, the partitions of the reassignment will be removed from the broker.
        </div>
      ) : null}
    </>
  );
}
