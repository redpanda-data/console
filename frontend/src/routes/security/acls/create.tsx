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
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

import AclCreatePage from '../../../components/pages/acls/new-acl/acl-create-page';

const searchSchema = z.object({
  principalType: fallback(z.string().optional(), undefined),
  principalName: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute('/security/acls/create')({
  staticData: {
    title: 'Create ACL',
  },
  validateSearch: zodValidator(searchSchema),
  component: AclCreatePage,
});
