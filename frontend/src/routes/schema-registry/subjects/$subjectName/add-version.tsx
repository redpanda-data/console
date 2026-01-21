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

import { SchemaAddVersionPage } from '../../../../components/pages/schemas/schema-create';

export const Route = createFileRoute('/schema-registry/subjects/$subjectName/add-version')({
  staticData: {
    title: 'Add Version',
  },
  component: SchemaAddVersionWrapper,
});

function SchemaAddVersionWrapper() {
  const { subjectName } = useParams({ from: '/schema-registry/subjects/$subjectName/add-version' });
  return (
    <SchemaAddVersionPage
      matchedPath={`/schema-registry/subjects/${subjectName}/add-version`}
      subjectName={subjectName}
    />
  );
}
