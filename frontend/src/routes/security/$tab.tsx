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

import AclList, { type AclListTab } from '../../components/pages/acls/acl-list';

export const Route = createFileRoute('/security/$tab')({
  staticData: {
    title: 'Security',
  },
  component: SecurityTabWrapper,
});

function SecurityTabWrapper() {
  const { tab } = useParams({ from: '/security/$tab' });
  return <AclList tab={tab as AclListTab} />;
}
