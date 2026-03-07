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

import { createFileRoute, redirect } from '@tanstack/react-router';
import { ShieldCheckIcon } from 'components/icons';

export const Route = createFileRoute('/security/')({
  staticData: {
    title: 'Security',
    icon: ShieldCheckIcon,
  },
  beforeLoad: () => {
    // Redirect /security/ to /security/users at router level.
    // This prevents the component-level useEffect redirect which can cause
    // navigation loops in embedded mode where shell and console routers conflict.
    throw redirect({
      to: '/security/$tab',
      params: { tab: 'users' },
      replace: true,
    });
  },
});
