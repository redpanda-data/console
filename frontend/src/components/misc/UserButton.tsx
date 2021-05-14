import React, { Component } from 'react';
import { observer } from "mobx-react"
import { Menu, Select, Avatar, Popconfirm, Dropdown } from 'antd';
import { uiSettings } from '../../state/ui';
import { RenderTrap, Spacer } from './common';
import { api } from '../../state/backendApi';
import Icon, { UserOutlined } from '@ant-design/icons';
import { IsBusiness } from '../../utils/env';
import { ChevronDownIcon } from '@primer/octicons-v2-react';
import { makeObservable, observable } from 'mobx';
import { UserPreferencesDialog } from './UserPreferences';
import MenuContext from 'antd/lib/menu/MenuContext';
import Sider, { SiderContext } from 'antd/lib/layout/Sider';

const { Option } = Select;

@observer
export class UserProfile extends Component {
    @observable menuOpen = false;
    @observable preferencesOpen = false;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        if (!IsBusiness) return null;
        if (!api.userData || !api.userData.user || !api.userData.user.meta.name) return null;
        const user = api.userData.user;

        // rc-dropdown supports this property, but the antd wrapper doesn't specify it.
        // luckily antd passes many props to rc-dropdown using the spread operator
        const noExpand = { minOverlayWidthMatchTrigger: false };

        const dropdown = <>
            <Dropdown overlayClassName="avatarDropdown"
                overlay={() => <UserMenu onOpenPreferences={() => {
                    this.preferencesOpen = true;
                    this.menuOpen = false;
                }} />}
                trigger={['click']}
                arrow={false}
                placement="topCenter"
                visible={this.menuOpen}
                onVisibleChange={e => {
                    // if (this.preferencesOpen) {
                    //     this.menuOpen = false;
                    //     return;
                    // }
                    this.menuOpen = e;
                }}
                {...noExpand}
            >
                <div className="profile">
                    <div className="avatar">
                        {/* <img src="https://cdn.discordapp.com/avatars/372161181080748038/ca238aec10ac4835bccee89e37793701.png?size=128" /> */}
                        <Avatar icon={<img src={user.meta.avatarUrl} />} />
                    </div>
                    <div className="text">
                        <div className="userName">{user.meta.name}</div>
                        <div className="prefText">Preferences</div>
                    </div>
                </div>
            </Dropdown>

            <UserPreferencesDialog visible={this.preferencesOpen} onClose={() => this.preferencesOpen = false} />
        </>;

        return (
            dropdown
        );
    }
}

@observer
export class UserMenu extends Component<{ onOpenPreferences: () => void }> {

    constructor(p: any) {
        super(p);
        // makeObservable(this);
    }

    render() {
        const userName = api.userData?.user?.meta?.name ?? 'null';

        return (
            <div className='userMenu'>
                <div className='menuItem header'>
                    Signed in as<br />
                    <span style={{ fontWeight: 'bold' }}>{userName}</span>
                </div>

                <div className='divider' />

                <div className='menuItem' onClick={() => this.props.onOpenPreferences()}>
                    Preferences
                </div>

                <div className='menuItem' onClick={() => { api.logout(); window.location.reload(); }}>
                    Logout
                </div>
            </div>

            // <Menu className="avatarMenu" >
            //     <Menu.Item style={{ pointerEvents: 'none' }} >
            //         Signed in as<br />
            //         <span style={{ fontWeight: 'bold' }}>{user.meta.name}</span>
            //     </Menu.Item>
            //     <Menu.Divider />
            //     <Menu.Item key="0" onClick={() => this.preferencesOpen = true}>Preferences</Menu.Item>
            //     <Menu.Item key="1" onClick={() => { api.logout(); window.location.reload(); }}>Logout</Menu.Item>
            // </Menu>
        )
    }
}



