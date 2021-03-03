import React, { Component } from "react";
import { Tag, Popover } from "antd";

export class BrokerList extends Component<{ brokerIds: number[]; leaderId?: number; addedIds?: number[]; removedIds?: number[]; tooltip?: JSX.Element; }> {
    render() {
        const { leaderId, addedIds, removedIds } = this.props;
        const ids = this.props.brokerIds.distinct().sort((a, b) => a - b);

        const tags = ids.map(id => {
            let color = undefined;
            // if (id === leaderId) color = "hsl(209deg, 50%, 60%)";
            if (addedIds?.includes(id))
                color = "green";
            else if (removedIds?.includes(id))
                color = "red";

            return <Tag key={id} color={color}>{id.toString()}</Tag>;
        });

        if (this.props.tooltip == null)
            return <span className='brokerTagList'>{tags}</span>;

        return (
            <Popover title="Brokers" content={this.props.tooltip} placement="right" trigger="click">
                <span style={{ cursor: 'pointer' }}>
                    <span className='brokerTagList' style={{ pointerEvents: 'none' }}>{tags}</span>
                </span>
            </Popover>
        );
    }
}
