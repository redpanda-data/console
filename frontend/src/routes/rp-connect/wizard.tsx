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
import { isEmbedded, isFeatureFlagEnabled } from 'config';
import { z } from 'zod';

import { ConnectOnboardingWizard } from '../../components/pages/rp-connect/onboarding/onboarding-wizard';

const searchSchema = z.object({
  step: fallback(z.string().optional(), undefined),
  serverless: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute('/rp-connect/wizard')({
  staticData: {
    title: 'Connect Wizard',
  },
  validateSearch: zodValidator(searchSchema),
  beforeLoad: ({ search }) => {
    // Tier 1: enablePipelineDiagrams → redirect to pipeline editor, skip wizard entirely
    // Tier 2/3: render wizard (enableRpcnTiles check happens inside the wizard's PipelinePage embed)
    if (isFeatureFlagEnabled('enablePipelineDiagrams') && isEmbedded()) {
      throw redirect({
        to: '/rp-connect/create',
        search: { serverless: search.serverless },
      });
    }
  },
  component: ConnectOnboardingWizard,
});
