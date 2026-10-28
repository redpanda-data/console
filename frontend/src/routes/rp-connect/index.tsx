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

import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { isEmbedded } from 'config';

// The pipeline list lives on the Connect page (the "Redpanda Connect Pipelines"
// breadcrumb links here). Embedded (Cloud) keeps its previous behavior: this
// path had no route there, so it renders the not-found page.
// allow: error-boundary [pure redirect, no data fetching]
export const Route = createFileRoute('/rp-connect/')({
  beforeLoad: () => {
    if (isEmbedded()) {
      throw notFound();
    }
    throw redirect({
      to: '/connect-clusters',
      search: { defaultTab: 'redpanda-connect' },
      replace: true,
    });
  },
});
