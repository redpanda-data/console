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

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { SqlWorkspace } from 'components/pages/sql/sql-workspace';
import { z } from 'zod';

// Entry intent from the landing page, carried in the URL so a seeded or
// auto-run editor link is shareable and refresh-safe.
const searchSchema = z.object({
  /** SQL to seed the editor's first tab with. */
  seed: fallback(z.string().optional(), undefined),
  /** Run `seed` once on mount — set when entering from a "run" CTA. */
  run: fallback(z.boolean().optional(), undefined),
  /** Open the add-topic wizard on mount — set when entering from "Add a topic". */
  wizard: fallback(z.boolean().optional(), undefined),
});

export const Route = createFileRoute('/sql/editor')({
  validateSearch: zodValidator(searchSchema),
  component: SqlEditorRoute,
});

function SqlEditorRoute() {
  const { seed, run, wizard } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <SqlWorkspace
      autoRun={run === true}
      onBack={() => navigate({ to: '/sql' })}
      openWizardOnMount={wizard === true}
      seedQuery={seed}
    />
  );
}
