import { Component } from "react"
import React from "react"
import { Tooltip, message } from "antd"
import { findPopupContainer } from "../../utils/tsxUtils"
import { EyeClosedIcon } from "@primer/octicons-react"



export class HideStatisticsBarButton extends Component<{ onClick: () => void }> {

    handleClick = () => {
        this.props.onClick();
        message.info('Statistics bar hidden! You can enable it again in the preferences.', 8);
    }

    render() {
        return <Tooltip
            title={<span style={{ whiteSpace: 'nowrap' }}>Hide statistics bar</span>}
            getPopupContainer={findPopupContainer}
            arrowPointAtCenter={true}
            placement='right'
        >
            <div className='hideStatsBarButton' onClick={this.handleClick}>
                <div style={{ display: 'flex', width: '100%' }}>
                    <EyeClosedIcon size='medium' />
                </div>
            </div>
        </Tooltip>
    }
}