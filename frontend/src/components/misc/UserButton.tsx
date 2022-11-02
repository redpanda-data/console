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
import { observer } from 'mobx-react'
import { Avatar, Dropdown } from 'antd';
import { api } from '../../state/backendApi';
import { UserOutlined } from '@ant-design/icons';
import { makeObservable, observable } from 'mobx';
import { UserPreferencesDialog } from './UserPreferences';
import { AppFeatures } from '../../utils/env';

@observer
export class UserProfile extends Component {
    @observable menuOpen = false;
    @observable preferencesOpen = false;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        if (!AppFeatures.SINGLE_SIGN_ON) return null;
        if (!api.userData || !api.userData.user || !api.userData.user.meta.name) return null;
        const user = api.userData.user;

        // rc-dropdown supports this property, but the antd wrapper doesn't specify it.
        // luckily antd passes many props to rc-dropdown using the spread operator
        const noExpand = { minOverlayWidthMatchTrigger: false };

        return <>
            <Dropdown overlayClassName="avatarDropdown"
                overlay={() => <UserMenu onOpenPreferences={() => {
                    this.preferencesOpen = true;
                    this.menuOpen = false;
                }} />}
                trigger={['click']}
                arrow={false}
                placement="top"
                visible={this.menuOpen}
                onVisibleChange={e => this.menuOpen = e}
                {...noExpand}
            >
                <div className="profile">
                    <div className="avatar">
                        <Avatar src={user.meta.avatarUrl} alt={user.meta.name} >
                            <UserOutlined />
                        </Avatar>
                    </div>
                    <div className="text">
                        <div className="userName">{user.meta.name}</div>
                        <div className="prefText">Preferences</div>
                    </div>
                </div>
            </Dropdown>

            <UserPreferencesDialog visible={this.preferencesOpen} onClose={() => this.preferencesOpen = false} />
        </>
    }
}

@observer
export class UserMenu extends Component<{ onOpenPreferences: () => void }> {
    render() {
        const userName = api.userData?.user?.meta?.name ?? 'null';

        return (
            <div className="userMenu">
                <div className="menuItem header">
                    Signed in as<br />
                    <span style={{ fontWeight: 'bold' }}>{userName}</span>
                </div>

                <div className="divider" />

                <div className="menuItem" onClick={() => this.props.onOpenPreferences()}>
                    Preferences
                </div>

                <div className="menuItem" onClick={() => { api.logout(); window.location.reload(); }}>
                    Logout
                </div>
            </div>
        )
    }
}

