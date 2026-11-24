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
import { HomeIcon } from 'components/icons';

import Overview from '../../components/pages/overview/overview';

export const Route = createFileRoute('/overview/')({
  staticData: {
    title: 'Overview',
    icon: HomeIcon,
  },
  component: OverviewWrapper,
});

function OverviewWrapper() {
  return <Overview matchedPath="/overview" />;
}
