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

import { Text, useToast } from '@redpanda-data/ui';
import { useNavigate } from '@tanstack/react-router';
import { WarningIcon } from 'components/icons';
import type { FC } from 'react';
import { useEffect, useState } from 'react';

import { SchemaNotConfiguredPage } from './schema-not-configured';
import {
  type SchemaRegistryMode,
  useSchemaModeQuery,
  useUpdateGlobalModeMutation,
} from '../../../react-query/api/schema-registry';
import { api } from '../../../state/backend-api';
import { uiState } from '../../../state/ui-state';
import PageContent from '../../misc/page-content';

const MODE_OPTIONS: {
  value: SchemaRegistryMode;
  title: string;
  description: string;
  warning: string | null;
}[] = [
  {
    value: 'READWRITE',
    title: 'Read/Write',
    description: 'The registry accepts new schema registrations and allows reads. This is the normal operating mode.',
    warning: null,
  },
  {
    value: 'READONLY',
    title: 'Read Only',
    description:
      'Schema lookups are permitted but registration is blocked. Use this for standby clusters in a disaster recovery setup that replicate schemas from an active cluster.',
    warning: null,
  },
  {
    value: 'IMPORT',
    title: 'Import',
    description:
      'Allows registering schemas with specific IDs and versions while bypassing compatibility checks. Use this on target clusters during migrations to preserve schema IDs. Requires an empty registry or subject.',
    warning: 'This mode allows overriding schema IDs. Incorrect use can cause ID collisions and data loss.',
  },
];

const EditSchemaModePage: FC = () => {
  const navigate = useNavigate();
  const { data: schemaMode, isLoading: isModeLoading } = useSchemaModeQuery();

  useEffect(() => {
    uiState.pageTitle = 'Edit Mode';
    uiState.pageBreadcrumbs = [
      { title: 'Schema Registry', linkTo: '/schema-registry' },
      { title: 'Edit Mode', linkTo: '/schema-registry/edit-mode' },
    ];
  }, []);

  if (api.schemaOverviewIsConfigured === false) {
    return <SchemaNotConfiguredPage />;
  }

  if (isModeLoading) {
    return (
      <PageContent>
        <SkeletonGroup direction="vertical" spacing="lg">
          <Skeleton variant="heading" width="lg" />
          <Skeleton variant="text" width="full" />
          <Skeleton size="xl" width="full" />
          <Skeleton size="xl" width="full" />
          <Skeleton size="xl" width="full" />
        </SkeletonGroup>
      </PageContent>
    );
  }

  const onClose = useCallback(() => {
    if (subjectName) {
      navigate({ to: `/schema-registry/subjects/${encodeURIComponent(subjectName)}` });
    } else {
      navigate({ to: '/schema-registry' });
    }
  }, [subjectName, navigate]);

  if (schemaMode === null) {
    return <SchemaNotConfiguredPage />;
  }

  return (
    <PageContent>
      <EditSchemaMode onClose={() => navigate({ to: '/schema-registry' })} schemaMode={schemaMode} />
    </PageContent>
  );
};

export default EditSchemaModePage;

function EditSchemaMode({ schemaMode, onClose }: { schemaMode: string | null | undefined; onClose: () => void }) {
  const toast = useToast();
  const updateModeMutation = useUpdateGlobalModeMutation();
  const [selectedMode, setSelectedMode] = useState<string>(schemaMode ?? 'READWRITE');

  const onSave = () => {
    updateModeMutation.mutate(selectedMode as SchemaRegistryMode, {
      onSuccess: () => {
        toast({
          status: 'success',
          duration: 4000,
          isClosable: false,
          title: `Mode updated to ${selectedMode}`,
          position: 'top-right',
        });
        onClose();
      },
      onError: (err) => {
        toast({
          status: 'error',
          duration: null,
          isClosable: true,
          title: 'Failed to update mode',
          description: String(err),
          position: 'top-right',
        });
      },
    });
  };

  return (
    <>
      <Text data-testid="edit-mode-description">
        Mode controls whether the Schema Registry accepts new schema registrations and under what conditions.
      </Text>

      <div className="mt-6 max-w-[800px]">
        <RadioGroup data-testid="edit-mode-radio" onValueChange={setSelectedMode} value={selectedMode}>
          {MODE_OPTIONS.map((option) => (
            <button
              className={`cursor-pointer rounded-lg border-2 px-5 py-4 text-left transition-all ${
                selectedMode === option.value
                  ? 'border-blue-500 bg-blue-50'
                  : `border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 ${option.warning ? 'bg-amber-50/30' : ''}`
              }`}
              key={option.value}
              onClick={() => setSelectedMode(option.value)}
              type="button"
            >
              <div className="font-semibold text-gray-900">{option.title}</div>
              <p className="mt-1 text-gray-600 text-sm">{option.description}</p>
              {option.warning && (
                <div className="mt-2 flex items-start gap-2 text-amber-700 text-sm">
                  <WarningIcon className="mt-0.5 size-4 shrink-0" />
                  <span>{option.warning}</span>
                </div>
              )}
            </button>
          ))}
        </RadioGroup>

        <div className="mt-6 flex items-center gap-4">
          <Button
            data-testid="edit-mode-save-btn"
            disabled={api.userData?.canManageSchemaRegistry === false}
            onClick={onSave}
            variant="primary"
          >
            Save
          </Button>
          <Button data-testid="edit-mode-cancel-btn" onClick={onClose} variant="secondary-ghost">
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}
