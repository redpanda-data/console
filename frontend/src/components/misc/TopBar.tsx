import React, { PureComponent } from 'react';
import { observer } from "mobx-react"
import { Layout, Menu, Icon, Select, PageHeader, Alert, Button, Avatar, Popconfirm } from 'antd';
import { uiSettings } from '../../state/ui';
import { CreateRouteMenuItems, APP_ROUTES, RouteView, } from '.././routes';
import { RenderTrap, Spacer } from '.././misc/common';
import { DebugTimerStore, hoursToMilliseconds } from '../../utils/utils';
import { api } from '../../state/backendApi';

import { IsDevelopment } from '../../utils/isProd';
import env from '../../utils/env';

const { Content, Footer, Sider, Header } = Layout;
const { Option } = Select;


const ClusterSelect = observer(() =>
    <Select<number>
        value={uiSettings.selectedClusterIndex >= 0 ? uiSettings.selectedClusterIndex : undefined}
        placeholder='Select Cluster'
        style={{ width: 200 }}
        onChange={(v) => { uiSettings.selectedClusterIndex = v }}
    >
        {api.Clusters.map((v, i) =>
            <Option key={v} value={i}>{v}</Option>
        )}
    </Select>
)

const TopBar = observer(() => {

    //console.dir(api.UserData);
    if (!api.UserData || !api.UserData.user || !api.UserData.user.name) {
        return null;
    }
    const user = api.UserData.user;

    return (
        // zIndex is needed for the boxShadow to show
        <div style={{ height: 'auto', padding: '0.5em 1em', background: 'white', lineHeight: '2em', boxShadow: 'rgba(0, 0, 0, 0.2) 0em 0em 8px', zIndex: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignContent: 'center', alignItems: 'center' }}>

                {/* Cluster Select */}
                {/* <ClusterSelect /> */}

                {/* Data Age */}
                {/* <DataAgeInfo /> */}

                {/* Spacer */}
                <Spacer />

                {/* User Button */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}> {/* user column */}
                    <Popconfirm title='Do you want to logout?' onConfirm={() => api.logout()} placement='left' okText='Yes' cancelText='No'>
                        <Button style={{ height: 'auto', padding: 0, paddingLeft: '.5em', margin: 0 }} className='hoverButton'>
                            <span style={{ display: 'flex', alignItems: 'center' }}> {/* text+img row */}
                                {/* <span style={{ verticalAlign: 'middle' }}><b>{user.name}</b></span> */}
                                <Avatar shape="square" size='large' icon="user" src={user.avatarUrl} style={{ marginRight: '.3em' }} />
                                <Icon type='caret-down' style={{ color: 'rgba(0,0,0,0.6)' }} />
                            </span>
                        </Button>
                    </Popconfirm>
                </div>
            </div>
        </div>
    );
});

export { TopBar };