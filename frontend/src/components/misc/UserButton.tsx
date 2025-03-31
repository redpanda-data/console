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

import { Avatar, Button, Popover, PopoverBody, PopoverContent, PopoverHeader, PopoverTrigger } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { useEffect, useState } from 'react';
import { AuthenticationMethod } from '../../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { api } from '../../state/backendApi';
import { AppFeatures } from '../../utils/env';
import { UserPreferencesDialog } from './UserPreferences';

export const UserProfile = observer(() => {
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    void api.refreshUserData();
  }, []);

  const userName = api.userData?.displayName ?? 'null';

  if (!AppFeatures.SINGLE_SIGN_ON) {
    return null;
  }

  if (!api.userData) {
    return null;
  }

  if (api.userData.authenticationMethod === AuthenticationMethod.NONE) {
    return null;
  }

  const user = api.userData;

  return (
    <>
      <Popover placement="top-start" trigger="click">
        <PopoverTrigger>
          <div className="profile">
            <div className="avatar">
              <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
            </div>
            <div className="text">
              <div className="userName">{user.displayName}</div>
              <div className="prefText">Preferences</div>
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent>
          <PopoverHeader px={8}>
            Signed in as <div>{userName}</div>
          </PopoverHeader>
          <PopoverBody>
            <Button
              w="full"
              justifyContent="start"
              variant="ghost"
              onClick={() => {
                setPreferencesOpen(true);
              }}
            >
              Preferences
            </Button>
            <Button
              w="full"
              justifyContent="start"
              variant="ghost"
              onClick={async () => {
                await api.logout();
                window.location.reload();
              }}
            >
              Logout
            </Button>
          </PopoverBody>
        </PopoverContent>
      </Popover>

      <UserPreferencesDialog isOpen={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
    </>
  );
});
