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

import { ChevronRightIcon } from '@heroicons/react/solid';
import { Tooltip } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import React, { Component } from 'react';

import { api, brokerMap } from '../../state/backend-api';
import type { Broker, Partition } from '../../state/rest-interfaces';

type BrokerListProps =
  | { brokerIds: number[]; addedIds?: number[]; removedIds?: number[]; leaderId?: number }
  | { partition: Partition };

@observer
export class BrokerList extends Component<BrokerListProps> {
  constructor(p: BrokerListProps) {
    super(p);
    if (!api.clusterInfo) {
      setTimeout(() => api.refreshCluster());
    }
  }

  render() {
    let leaderId: number;
    let sortedIds: number[];
    const offlineIds: number[] = [];
    let addedIds: number[] = [];
    let removedIds: number[] = [];

    if ('partition' in this.props) {
      const { partition } = this.props;
      leaderId = partition.leader;
      sortedIds = partition.replicas.distinct().sort((a, b) => a - b);
      if (partition.offlineReplicas) {
        offlineIds.push(...partition.offlineReplicas);
      }
    } else {
      if (!this.props.brokerIds) {
        return null;
      }

      sortedIds = this.props.brokerIds.distinct().sort((a, b) => a - b);
      addedIds = this.props.addedIds ?? [];
      removedIds = this.props.removedIds ?? [];
      leaderId = this.props.leaderId ?? -1;
    }

    const brokers = brokerMap.get();
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 20 - nested conditionals for broker tag styling and tooltip content
    const tags = sortedIds.map((id) => {
      const broker = brokers?.get(id);

      let classNames = 'broker-tag';
      if (id === leaderId) {
        classNames += ' leader';
      }
      if (offlineIds.includes(id)) {
        classNames += ' offline';
      }
      if (brokers && !broker) {
        classNames += ' missing';
      }

      const isAdding = addedIds.includes(id);
      if (isAdding) {
        classNames += ' added';
      }

      const isRemoving = removedIds.includes(id);
      if (isRemoving) {
        classNames += ' removed';
      }

      const tag = (
        <div className={classNames}>
          <span>{id ?? '?'}</span>
        </div>
      );
      if (!broker) {
        return tag;
      }

      const additionalContent: JSX.Element[] = [];
      if (id === leaderId) {
        additionalContent.push(
          <div key="leader" style={{ marginTop: '5px' }}>
            <ChevronRightIcon className="svgCenter" height="15px" style={{ marginLeft: '-4px', marginRight: '-2px' }} />
            This broker is the leader for this partition
          </div>
        );
      }
      if (isAdding) {
        additionalContent.push(
          <div key="added" style={{ color: 'hsl(102deg, 80%, 45%)', marginTop: '5px' }}>
            Partitions are currently being transferred to this broker.
          </div>
        );
      }
      if (isRemoving) {
        additionalContent.push(
          <div key="removed" style={{ color: 'hsl(38deg, 100%, 50%)', marginTop: '5px' }}>
            Once the assignment completes, the partitions of the reassignment will be removed from the broker.
          </div>
        );
      }

      return (
        <BrokerTooltip broker={broker} key={id} tooltipSuffix={additionalContent}>
          {tag}
        </BrokerTooltip>
      );
    });

    return (
      <span style={{ cursor: 'pointer' }}>
        <span className="brokerTagList">{tags}</span>
      </span>
    );
  }
}

function BrokerTooltip(p: { broker: Broker; children?: React.ReactElement; tooltipSuffix?: React.ReactNode }) {
  const broker = p.broker;
  const id = broker.brokerId;

  const tooltipContentEntries = [
    <b key={1} style={{ borderBottom: '1px solid', width: '100%', display: 'block', marginBottom: '5px' }}>
      Broker ID {id}
    </b>,
    <div key={2}>{broker.address}</div>,
    <React.Fragment key={3}>{Boolean(broker.rack) && <div>{broker.rack}</div>}</React.Fragment>,
    <React.Fragment key={4}>{p.tooltipSuffix || null}</React.Fragment>,
  ];

  const tooltipContent = <div style={{ textAlign: 'left', maxWidth: '300px' }}>{tooltipContentEntries}</div>;

  return (
    <Tooltip hasArrow label={tooltipContent} placement="top">
      {p.children}
    </Tooltip>
  );
}
