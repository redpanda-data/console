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

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react'
import { api } from '../../state/backendApi';
import { UserPreferencesDialog } from './UserPreferences';
import { AppFeatures } from '../../utils/env';
import { Avatar, Button, Popover, PopoverBody, PopoverContent, PopoverHeader, PopoverTrigger } from '@redpanda-data/ui';

export const UserProfile = observer(() => {
    const [preferencesOpen, setPreferencesOpen] = useState(false);

    useEffect(() => {
        void api.refreshUserData();
    }, [])

    const userName = api.userData?.user?.meta?.name ?? 'null';

    if (!AppFeatures.SINGLE_SIGN_ON) {
        return null;
    }
    if (!api.userData || !api.userData.user || !api.userData.user.meta.name) {
        return null;
    }
    const user = api.userData.user;

    return <>
        <Popover placement="top-start" trigger="click">
            <PopoverTrigger>
                <div className="profile">
                    <div className="avatar">
                        <Avatar name={user.meta.name} src={user.meta.avatarUrl} size="sm"/>
                    </div>
                    <div className="text">
                        <div className="userName">{user.meta.name}</div>
                        <div className="prefText">Preferences</div>
                    </div>
                </div>
            </PopoverTrigger>
            <PopoverContent>
                <PopoverHeader px={8}>Signed in as <div>{userName}</div></PopoverHeader>
                <PopoverBody>
                    <Button w="full" justifyContent="start" variant="ghost" onClick={() => {
                        setPreferencesOpen(true);
                    }}>Preferences</Button>
                    <Button w="full" justifyContent="start" variant="ghost" onClick={() => {
                        void api.logout();
                        window.location.reload();
                    }}>Logout</Button>
                </PopoverBody>
            </PopoverContent>
        </Popover>

        <UserPreferencesDialog isOpen={preferencesOpen} onClose={() => setPreferencesOpen(false)}/>
    </>
})
