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
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

import AclUpdatePage from '../../../../components/pages/security/acls/acl-update-page';
import { isFeatureFlagEnabled } from '../../../../config';

const searchSchema = z.object({
  host: fallback(z.string().optional(), undefined),
});

// allow: error-boundary [legacy route, component handles its own error states]
export const Route = createFileRoute('/security/acls/$aclName/update')({
  staticData: {
    title: 'Update ACL',
  },
  validateSearch: zodValidator(searchSchema),
  beforeLoad: ({ params }) => {
    if (isFeatureFlagEnabled('enableNewSecurityPage')) {
      throw redirect({ to: '/security/acls/$aclName/details', params, replace: true });
    }
  },
  component: AclUpdatePage,
});
