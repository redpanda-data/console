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

import { TransformsSetup } from '../components/pages/transforms/transforms-setup';

export const Route = createFileRoute('/transforms-setup')({
  staticData: {
    title: 'Transforms Setup',
  },
  component: TransformsSetupWrapper,
});

function TransformsSetupWrapper() {
  return <TransformsSetup matchedPath="/transforms-setup" />;
}
