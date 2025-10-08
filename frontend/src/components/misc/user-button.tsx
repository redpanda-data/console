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

import { UserPreferencesDialog } from './user-preferences';
import { AuthenticationMethod } from '../../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { api } from '../../state/backend-api';
import { AppFeatures } from '../../utils/env';

export const UserProfile = observer(() => {
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    api.refreshUserData().catch(() => {
      // Error handling managed by API layer
    });
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
              <Avatar name={user.displayName} size="sm" src={user.avatarUrl} />
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
              justifyContent="start"
              onClick={() => {
                setPreferencesOpen(true);
              }}
              variant="ghost"
              w="full"
            >
              Preferences
            </Button>
            <Button
              justifyContent="start"
              onClick={async () => {
                await api.logout();
                window.location.reload();
              }}
              variant="ghost"
              w="full"
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
