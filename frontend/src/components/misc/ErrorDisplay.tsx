import React from 'react';
import { observer } from "mobx-react";
import { Icon, Result } from 'antd';
import { Button } from 'antd';
import { api } from '../../state/backendApi';


@observer
export class ErrorDisplay extends React.Component {
    render() {
        if (api.Errors.length === 0)
            return this.props.children;
        return <>
            <Result style={{ margin: 0, padding: 0 }} status={500} title="Backend API Error" subTitle="Something went wrong while pulling data from the backend server" />
            <div style={{ margin: '2em 2em', display: 'flex', flexDirection: 'column' }}>
                <Button type="primary" size="large" style={{ width: '12em', alignSelf: 'center' }} onClick={() => api.Errors = []}>Retry</Button>

                <div className="error-list">
                    {api.Errors.map((e, i) => <div key={i}>
                        <Icon style={{ color: 'red' }} type="close-circle" /> {e.toString()}
                    </div>)}
                </div>
            </div>
        </>;
    }
}
