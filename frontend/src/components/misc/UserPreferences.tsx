import React, { Component } from 'react';
import { observer } from "mobx-react"
import { Menu, Select, Avatar, Popconfirm, Dropdown, Button } from 'antd';
import { uiSettings } from '../../state/ui';
import { RenderTrap, Spacer } from './common';
import { api } from '../../state/backendApi';
import Icon, { UserOutlined } from '@ant-design/icons';
import { IsBusiness } from '../../utils/env';
import { ChevronDownIcon, ToolsIcon } from '@primer/octicons-v2-react';

const { Option } = Select;

export const UserPreferencesButton = observer(() => {

    // const userMenu = <Menu className="avatarMenu">
    //     <Menu.Item style={{ pointerEvents: 'none', fontWeight: 'bold', paddingTop: '1px', paddingBottom: '1px' }}>Preferences</Menu.Item>
    //     <Menu.Divider />
    //     <Menu.Item onClick={() => { }}>Hide Statistics Bar</Menu.Item>
    //     <Menu.ItemGroup title='Settings'>
    //         <Menu.Item onClick={() => { }}>Import</Menu.Item>
    //         <Menu.Item onClick={() => { }}>Export</Menu.Item>
    //         <Menu.Item onClick={() => { }}>Reset</Menu.Item>
    //     </Menu.ItemGroup>
    // </Menu>

    const userMenu = <div>not implemented yet</div>

    return <Dropdown overlay={userMenu} trigger={['click']} placement='bottomLeft'>
        <Button shape='circle' icon={<ToolsIcon size={17} />} className='hoverButton userPreferencesButton' />
    </Dropdown>
});

class UserPreferencesDialog extends Component<{ visible: boolean }> {
    render() {
        return "not implemented yet";
    }
}