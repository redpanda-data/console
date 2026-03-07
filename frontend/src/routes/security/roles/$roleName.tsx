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
import { RoleDetailPage } from 'components/pages/security/role-detail-page';

export const Route = createFileRoute('/security/roles/$roleName')({
  staticData: {
    title: 'Role Details',
  },
  component: RoleDetailWrapper,
});

function RoleDetailWrapper() {
  const { roleName } = useParams({ from: '/security/roles/$roleName' });
  return <RoleDetailPage roleName={decodeURIComponent(roleName)} />;
}
