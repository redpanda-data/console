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

import { AclsTab } from '../../../components/pages/security/tabs/acls-tab';

export const Route = createFileRoute('/security/acls/')({
  staticData: {
    title: 'Role Details',
  },
  component: AclsTab,
});
