import React, { Component } from "react";
import { Tag, Popover, Tooltip } from "antd";
import { LazyMap } from "../../../../utils/LazyMap";
import { Broker, Partition } from "../../../../state/restInterfaces";
import { api, brokerMap } from "../../../../state/backendApi";
import { computed } from "mobx";
import { QuickTable } from "../../../../utils/tsxUtils";
import { CheckIcon } from "@primer/octicons-v2-react";

// const tooltipMap = new LazyMap<number, JSX.Element>(id =>
//     <Tooltip>

//     </Tooltip>
//     );

type BrokerListProps = { brokerIds: number[]; otherIds?: number[], leaderId?: number; } | { partition: Partition };


export class BrokerList extends Component<BrokerListProps> {
    render() {
        let leaderId: number;
        let sortedIds: number[];
        let offlineIds: number[] = [];

        if ('partition' in this.props) {
            const { partition } = this.props;
            leaderId = partition.leader;
            sortedIds = partition.replicas.distinct().sort((a, b) => a - b);
            if (partition.offlineReplicas) offlineIds.push(...partition.offlineReplicas);
        } else {
            const { brokerIds } = this.props;
            leaderId = this.props.leaderId ?? -1;
            sortedIds = this.props.brokerIds.distinct().sort((a, b) => a - b);
        }


        const brokers = brokerMap.get();

        const tags = sortedIds.map(id => {
            const broker = brokers?.get(id);

            let classNames = '';
            if (id == leaderId) classNames += " leader";
            if (offlineIds.includes(id)) classNames += ' offline';
            if (brokers && !broker) classNames += ' missing';

            let brokerInfo = null;
            if (broker) brokerInfo = <div>
                <b>Broker #{id}</b>
                <div>{broker.address}</div>
                {broker.rack.length > 0 && <div>{broker.rack}</div>}
            </div>

            return <Tooltip overlay={brokerInfo} trigger='click' placement='top'>
                <Tag className={classNames} style={{ display: 'inline-flex', fontWeight: 600 }}>
                    <span style={{ padding: '0 2px' }}>{id.toString()}</span>
                    {/* <span style={{ width: '1px', background: 'hsl(0deg, 0%, 80%)', margin: '0 7px' }} />
                    <span style={{ color: 'green' }}><CheckIcon size='small' /></span> */}
                </Tag>
            </Tooltip>

        });


        return (
            <span style={{ cursor: 'pointer' }}>
                <span className='brokerTagList'>
                    {tags.map((t, i) => <React.Fragment key={i}>{t}</React.Fragment>)}
                </span>
            </span>
        );
    }
}
