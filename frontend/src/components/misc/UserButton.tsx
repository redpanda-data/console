import React from 'react';
import { observer } from "mobx-react"
import { Menu, Select, Avatar, Popconfirm, Dropdown } from 'antd';
import { uiSettings } from '../../state/ui';
import { RenderTrap, Spacer } from './common';
import { api } from '../../state/backendApi';
import Icon, { UserOutlined } from '@ant-design/icons';
import { IsBusiness } from '../../utils/env';
import { ChevronDownIcon } from '@primer/octicons-v2-react';

const { Option } = Select;

export const UserButton = observer(() => {
    if (!IsBusiness) return null;
    if (!api.UserData || !api.UserData.user || !api.UserData.user.meta.name) return null;
    const user = api.UserData.user;

    const userMenu = <Menu className="avatarMenu">
        <Menu.Item style={{ pointerEvents: 'none' }}>
            Signed in as<br />
            <span style={{ fontWeight: 'bold' }}>{user.meta.name}</span>
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item key="0" onClick={() => { api.logout(); window.location.reload(); }}>Logout</Menu.Item>
    </Menu>

    return <Dropdown overlay={userMenu} trigger={['click']}>
        <div style={{ cursor: 'pointer' }}>
            <span style={{ display: 'flex', alignItems: 'center' }}>
                <Avatar shape="square" size='large' src={user.meta.avatarUrl} style={{ marginRight: '.3em' }} />
                {/* <ChevronDownIcon /> */}
            </span>
        </div>
    </Dropdown>
    // <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}> {/* user column */}
    // </div>
});



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
