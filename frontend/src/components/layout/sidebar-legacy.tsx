/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Sidebar } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { createVisibleSidebarItems } from 'utils/route-utils';

import { uiSettings } from '../../state/ui';
import { UserProfile } from '../misc/user-button';

export const AppSidebarLegacy = observer(() => {
  const sidebarItems = createVisibleSidebarItems();

  return (
    <Sidebar isCollapsed={!uiSettings.sideBarOpen} items={sidebarItems}>
      <UserProfile />
    </Sidebar>
  );
});
