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

import { SecretCreatePage } from '../../components/pages/secrets-store/create/secret-create-page';

export const Route = createFileRoute('/secrets/create')({
  staticData: {
    title: 'Create Secret',
  },
  component: SecretCreatePage,
});
