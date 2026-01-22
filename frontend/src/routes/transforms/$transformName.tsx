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
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { DEFAULT_TABLE_PAGE_SIZE } from 'components/constants';
import { z } from 'zod';

import TransformDetails from '../../components/pages/transforms/transform-details';

const searchSchema = z.object({
  pageSize: fallback(z.number().int().positive().optional(), DEFAULT_TABLE_PAGE_SIZE),
  page: fallback(z.number().int().nonnegative().optional(), 0),
});

export const Route = createFileRoute('/transforms/$transformName')({
  staticData: {
    title: 'Transform Details',
  },
  validateSearch: zodValidator(searchSchema),
  component: TransformDetailsWrapper,
});

function TransformDetailsWrapper() {
  const { transformName } = useParams({ from: '/transforms/$transformName' });
  return <TransformDetails matchedPath={`/transforms/${transformName}`} transformName={transformName} />;
}
