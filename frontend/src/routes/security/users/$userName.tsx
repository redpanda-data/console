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

import { createFileRoute, useParams } from '@tanstack/react-router';
import { UserDetailPage } from 'components/pages/security/user-detail-page';

import UserDetailsPage from '../../../../components/pages/security/users/user-details';

export const Route = createFileRoute('/security/users/$userName/details')({
  staticData: {
    title: 'User Details',
  },
  component: UserDetailWrapper,
});

function UserDetailWrapper() {
  const { userName } = useParams({ from: '/security/users/$userName' });
  return <UserDetailPage userName={decodeURIComponent(userName)} />;
}
