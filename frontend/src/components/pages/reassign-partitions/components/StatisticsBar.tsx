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

import { Component } from 'react';
import { observer } from 'mobx-react';
import { api } from '../../../../state/backendApi';
import { Broker, Partition } from '../../../../state/restInterfaces';
import { computed, makeObservable } from 'mobx';
import { PartitionSelection } from '../ReassignPartitions';
import { prettyBytesOrNA } from '../../../../utils/utils';


@observer
export class SelectionInfoBar extends Component<{ partitionSelection: PartitionSelection, margin?: string }> {

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        if (api.topicPartitions == null) {
            return null;
        }

        const allSelectedPartitions = this.selectedPartitions.flatMap(p => p.partitions);
        const partitionCountLeaders = allSelectedPartitions.length; // every partition has a leader
        const totalPartitionsCount = allSelectedPartitions.sum(t => t.replicas.length);

        const brokers = this.involvedBrokers;

        const data = [
            { title: 'Leader Partitions', value: partitionCountLeaders, },
            { title: 'Total Partitions', value: totalPartitionsCount },
            // {
            //     title: 'Partitions', value: <span style={{ display: 'inline-flex', gap: '1em' }}>
            //         <span>
            //             <span>{partitionCountLeaders}</span>
            //             <span> leaders</span>
            //         </span>
            //         <span>
            //             <span>{totalPartitionsCount}</span>
            //             <span> total</span>
            //         </span>
            //     </span>
            // },

            { title: 'Involved Topics', value: this.selectedPartitions.length },
            { title: 'Involved Brokers', value: brokers?.length ?? '...' },
            { title: 'Involved Racks', value: brokers?.map(b => b.rack).distinct().length ?? '...' },
            { title: 'Size', value: prettyBytesOrNA(allSelectedPartitions.sum(p => p.replicas.length * p.replicaSize)) },
        ];

        return <div style={{ margin: this.props.margin }}>
            <h4>Current Selection</h4>
            <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '3em', fontFamily: 'Open Sans', color: 'hsl(0deg, 0%, 30%)', fontSize: '1.1em' }}>
                {data.map(item => <div key={item.title}>
                    <div style={{ fontSize: '.8em', opacity: 0.6, paddingBottom: '.5em' }}>{item.title}</div>
                    <div style={{}}>{item.value}</div>
                </div>)}
            </div>
        </div>;
    }

    @computed get selectedPartitions(): { topic: string; partitions: Partition[]; }[] {
        const ar = [];
        for (const [topic, partitions] of api.topicPartitions) {
            if (partitions == null)
                continue;
            if (this.props.partitionSelection[topic] == null)
                continue;
            const relevantPartitions = partitions.filter(p => this.props.partitionSelection[topic].includes(p.id));
            ar.push({ topic: topic, partitions: relevantPartitions });
        }
        return ar;
    }


    @computed get involvedBrokers(): Broker[] | null {
        if (api.clusterInfo == null)
            return null;
        const brokerIds = new Set<number>();

        // Find IDs of all involved brokers
        for (const t of this.selectedPartitions) {
            for (const p of t.partitions) {
                brokerIds.add(p.leader);
                for (const id of p.replicas)
                    brokerIds.add(id);
            }
        }

        // Translate to Broker info
        return api.clusterInfo.brokers.filter(b => brokerIds.has(b.brokerId));
    }
}
