import React, { PureComponent } from 'react';
import { observer } from "mobx-react"
import { Layout, Menu, Icon, Select, PageHeader, Alert, Button, Avatar, Popconfirm, Dropdown } from 'antd';
import { uiSettings } from '../../state/ui';
import { RenderTrap, Spacer } from '.././misc/common';
import { DebugTimerStore, hoursToMilliseconds } from '../../utils/utils';
import { api } from '../../state/backendApi';

import { IsDevelopment } from '../../utils/isProd';
import env from '../../utils/env';
import { appGlobal } from '../../state/appGlobal';

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
    if (!api.UserData || !api.UserData.user || !api.UserData.user.meta.name) {
        return null;
    }
    const user = api.UserData.user;

    const menu = <Menu className="avatarMenu">
        <Menu.Item style={{ pointerEvents: 'none' }}>
            Signed in as<br />
            <span style={{ fontWeight: 'bold' }}>{user.meta.name}</span>
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item key="0" onClick={() => { api.logout(); window.location.reload(); }}>Logout</Menu.Item>
    </Menu>

    return (
        // zIndex is needed for the boxShadow to show
        <div style={{ height: 'auto', padding: '0.5em 1.5rem', background: 'white', lineHeight: '2em', boxShadow: '0 1px 5px rgba(0,21,41,.10)', zIndex: 10 }}>
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
                    </Popconfirm>

                    <Dropdown overlay={menu} trigger={['click']}>
                        <div style={{ cursor: 'pointer' }}>
                            <span style={{ display: 'flex', alignItems: 'center' }}>
                                <Avatar shape="square" size='large' icon="user" src={user.meta.avatarUrl} style={{ marginRight: '.3em' }} />
                                <Icon type='caret-down' style={{ color: 'rgba(0,0,0,0.6)' }} />
                            </span>
                        </div>
                    </Dropdown>

                </div>
            </div>
        </div>
    );
});

export { TopBar };