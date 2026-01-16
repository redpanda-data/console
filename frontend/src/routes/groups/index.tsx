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

import { createFileRoute } from '@tanstack/react-router';
import { FilterIcon } from 'components/icons';

import GroupList from '../../components/pages/consumers/group-list';

export const Route = createFileRoute('/groups/')({
  staticData: {
    title: 'Consumer Groups',
    icon: FilterIcon,
  },
  component: GroupListWrapper,
});

function GroupListWrapper() {
  return <GroupList matchedPath="/groups" />;
}
