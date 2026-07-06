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
import { SqlLanding } from 'components/pages/sql/sql-landing';
import { useSqlCatalogs } from 'components/pages/sql/use-sql-catalogs';

// The SQL section's default view: a standalone landing/overview with no studio
// chrome. Editor entry intent travels as /sql/editor search params.
export const Route = createFileRoute('/sql/')({
  component: SqlLandingRoute,
});

function SqlLandingRoute() {
  const navigate = useNavigate();
  const { isLoading, isError, refetch, sqlRole, completionCatalogs, hasTables } = useSqlCatalogs();
  return (
    <SqlLanding
      catalogs={completionCatalogs}
      hasTables={hasTables}
      isError={isError}
      isLoading={isLoading}
      onAddTopic={() => navigate({ to: '/sql/editor', search: { seed: undefined, run: undefined, wizard: true } })}
      onOpenEditor={() =>
        navigate({ to: '/sql/editor', search: { seed: undefined, run: undefined, wizard: undefined } })
      }
      onRetry={refetch}
      onRunQuery={(sql) => navigate({ to: '/sql/editor', search: { seed: sql, run: true, wizard: undefined } })}
      sqlRole={sqlRole}
    />
  );
}
