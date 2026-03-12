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

import EditSchemaModePage from '../../../../components/pages/schemas/edit-mode';

export const Route = createFileRoute('/schema-registry/contexts/$contextName/edit-mode')({
  staticData: {
    title: 'Edit Mode',
  },
  component: EditContextModeWrapper,
});

function EditContextModeWrapper() {
  const { contextName } = useParams({ from: '/schema-registry/contexts/$contextName/edit-mode' });
  return <EditSchemaModePage contextName={contextName} />;
}
