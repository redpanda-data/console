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
import { z } from 'zod';

import SchemaDetailsView from '../../../../components/pages/schemas/schema-details';

const searchSchema = z.object({
  version: z.string().optional().catch(undefined),
});

export const Route = createFileRoute('/schema-registry/subjects/$subjectName/')({
  staticData: {
    title: 'Schema Details',
  },
  validateSearch: searchSchema,
  component: SchemaDetailsWrapper,
});

function SchemaDetailsWrapper() {
  const { subjectName } = useParams({ from: '/schema-registry/subjects/$subjectName/' });
  return <SchemaDetailsView subjectName={subjectName} />;
}
