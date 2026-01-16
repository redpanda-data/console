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
import { AIIcon } from 'components/icons';

import TransformsList from '../../components/pages/transforms/transforms-list';

export const Route = createFileRoute('/transforms/')({
  staticData: {
    title: 'Transforms',
    icon: AIIcon,
  },
  component: TransformsListWrapper,
});

function TransformsListWrapper() {
  return <TransformsList matchedPath="/transforms" />;
}
