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

import { createFileRoute, useParams } from '@tanstack/react-router';

import { SchemaCreatePage } from '../../../../components/pages/schemas/schema-create';

export const Route = createFileRoute('/schema-registry/contexts/$contextName/create')({
  staticData: {
    title: 'Create Schema',
  },
  component: SchemaCreateContextWrapper,
});

function SchemaCreateContextWrapper() {
  const { contextName } = useParams({ from: '/schema-registry/contexts/$contextName/create' });
  return <SchemaCreatePage contextName={contextName} matchedPath="/schema-registry/create" />;
}
