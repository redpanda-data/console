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
import { ActivityIcon } from 'components/icons';
import { isFeatureFlagEnabled, isServerless } from 'config';

import ObservabilityPage from '../../components/pages/observability/observability-page';

export const Route = createFileRoute('/observability/')({
  staticData: {
    title: 'Metrics',
    icon: ActivityIcon,
  },
  beforeLoad: () => {
    const isObservabilityEnabled = isServerless()
      ? isFeatureFlagEnabled('enableDataplaneObservabilityServerless')
      : isFeatureFlagEnabled('enableDataplaneObservability');

    if (!isObservabilityEnabled) {
      throw redirect({
        to: '/',
        replace: true,
      });
    }
  },
  component: ObservabilityPage,
});
