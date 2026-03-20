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

import { useNavigate } from '@tanstack/react-router';
import { InfoIcon, WarningIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Choicebox,
  ChoiceboxItem,
  ChoiceboxItemDescription,
  ChoiceboxItemHeader,
  ChoiceboxItemTitle,
} from 'components/redpanda-ui/components/choicebox';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Skeleton, SkeletonGroup } from 'components/redpanda-ui/components/skeleton';
import { Text } from 'components/redpanda-ui/components/typography';
import { type FC, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ContextsNotSupportedPage } from './contexts-not-supported-page';
import { getFormattedSchemaText, schemaTypeToCodeBlockLanguage } from './schema-details';
import { SchemaNotConfiguredPage } from './schema-not-configured';
import {
  type SchemaRegistryMode,
  SchemaRegistryModes,
  type SchemaRegistryModeWithDefault,
  useSchemaDetailsQuery,
  useSchemaModeQuery,
  useSchemaRegistryContextsQuery,
  useUpdateContextModeMutation,
  useUpdateGlobalModeMutation,
  useUpdateSubjectModeMutation,
} from '../../../react-query/api/schema-registry';
import { api } from '../../../state/backend-api';
import type { SchemaRegistrySubjectDetails, SchemaRegistryVersionedSchema } from '../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../state/supported-features';
import { uiState } from '../../../state/ui-state';
import PageContent from '../../misc/page-content';

const DEFAULT_OPTION = {
  value: SchemaRegistryModes.DEFAULT,
  title: 'Default',
  description: 'Use the globally configured default mode.',
  warning: null,
};

const MODE_OPTIONS: {
  value: SchemaRegistryMode;
  title: string;
  description: string;
  warning: string | null;
}[] = [
  {
    value: SchemaRegistryModes.READWRITE,
    title: 'Read/Write',
    description: 'The registry accepts new schema registrations and allows reads. This is the normal operating mode.',
    warning: null,
  },
  {
    value: SchemaRegistryModes.READONLY,
    title: 'Read Only',
    description:
      'Schema lookups are permitted but registration is blocked. Use this for standby clusters in a disaster recovery setup that replicate schemas from an active cluster.',
    warning: null,
  },
  {
    value: SchemaRegistryModes.IMPORT,
    title: 'Import',
    description:
      'Allows registering schemas with specific IDs and versions while bypassing compatibility checks. Use this on target clusters during migrations to preserve schema IDs. Requires an empty registry or subject.',
    warning: 'This mode allows overriding schema IDs. Incorrect use can cause ID collisions and data loss.',
  },
];

const EditSchemaModePage: FC<{ subjectName?: string; contextName?: string }> = ({
  subjectName: subjectNameEncoded,
  contextName: contextNameEncoded,
}) => {
  const navigate = useNavigate();
  const subjectName = subjectNameEncoded ? decodeURIComponent(subjectNameEncoded) : undefined;
  const contextName = contextNameEncoded ? decodeURIComponent(contextNameEncoded) : undefined;
  const schemaRegistryContextsSupported = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);

  const { data: schemaMode, isLoading: isModeLoading } = useSchemaModeQuery();
  const { data: schemaDetails, isLoading: isDetailsLoading } = useSchemaDetailsQuery(subjectName, {
    enabled: !!subjectName,
  });
  const { data: contexts, isLoading: isContextsLoading } = useSchemaRegistryContextsQuery(!!contextName);

  const contextMode = useMemo(
    () => (contextName ? contexts?.find((c) => c.name === contextName)?.mode : undefined),
    [contexts, contextName]
  );

  const onClose = useCallback(() => {
    if (subjectName) {
      navigate({ to: `/schema-registry/subjects/${encodeURIComponent(subjectName)}` });
    } else if (contextName) {
      navigate({ to: '/schema-registry', search: { context: contextName } });
    } else {
      navigate({ to: '/schema-registry' });
    }
  }, [subjectName, contextName, navigate]);

  useEffect(() => {
    uiState.pageTitle = 'Edit Mode';
    uiState.pageBreadcrumbs = [{ title: 'Schema Registry', linkTo: '/schema-registry' }];

    if (contextName) {
      uiState.pageBreadcrumbs.push({
        title: 'Edit Mode',
        linkTo: `/schema-registry/contexts/${encodeURIComponent(contextName)}/edit-mode`,
      });
    } else if (subjectName) {
      uiState.pageBreadcrumbs.push({
        title: subjectName,
        linkTo: `/schema-registry/subjects/${subjectName}`,
      });
      uiState.pageBreadcrumbs.push({
        title: 'Edit Mode',
        linkTo: `/schema-registry/subjects/${subjectName}/edit-mode`,
      });
    } else {
      uiState.pageBreadcrumbs.push({
        title: 'Edit Mode',
        linkTo: '/schema-registry/edit-mode',
      });
    }
  }, [subjectName, contextName]);

  if (contextName && !schemaRegistryContextsSupported) {
    return <ContextsNotSupportedPage />;
  }

  if (isModeLoading || (subjectName && isDetailsLoading) || (contextName && isContextsLoading)) {
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

  if (schemaMode === null) {
    return <SchemaNotConfiguredPage />;
  }

  return (
    <PageContent>
      <EditSchemaMode
        contextMode={contextMode}
        contextName={contextName}
        onClose={onClose}
        schemaDetails={schemaDetails}
        schemaMode={schemaMode}
        subjectName={subjectName}
      />
    </PageContent>
  );
};

export default EditSchemaModePage;

function EditSchemaMode({
  schemaMode,
  onClose,
  subjectName,
  contextName,
  contextMode,
  schemaDetails,
}: {
  schemaMode: string | null | undefined;
  onClose: () => void;
  subjectName?: string;
  contextName?: string;
  contextMode?: SchemaRegistryModeWithDefault;
  schemaDetails?: SchemaRegistrySubjectDetails;
}) {
  const updateGlobalMutation = useUpdateGlobalModeMutation();
  const updateSubjectMutation = useUpdateSubjectModeMutation();
  const updateContextMutation = useUpdateContextModeMutation();

  const schema = schemaDetails?.schemas.first(
    (x: SchemaRegistryVersionedSchema) => x.version === schemaDetails.latestActiveVersion
  );

  const getInitialMode = (): SchemaRegistryModeWithDefault => {
    if (contextName) return contextMode ?? SchemaRegistryModes.DEFAULT;
    if (subjectName) return schemaDetails?.mode ?? SchemaRegistryModes.READWRITE;
    return (schemaMode as SchemaRegistryModeWithDefault) ?? SchemaRegistryModes.READWRITE;
  };
  const [selectedMode, setSelectedMode] = useState<SchemaRegistryModeWithDefault>(getInitialMode);

  const allOptions: {
    value: SchemaRegistryModeWithDefault;
    title: string;
    description: string;
    warning: string | null;
  }[] = subjectName || contextName ? [DEFAULT_OPTION, ...MODE_OPTIONS] : MODE_OPTIONS;

  const onSave = () => {
    const callbacks = {
      onSuccess: () => {
        toast.success(`Mode updated to ${selectedMode}`);
        onClose();
      },
      onError: (err: Error) => {
        toast.error('Failed to update mode', { description: String(err) });
      },
    };

    if (contextName) {
      updateContextMutation.mutate({ contextName, mode: selectedMode }, callbacks);
    } else if (subjectName) {
      updateSubjectMutation.mutate({ subjectName, mode: selectedMode }, callbacks);
    } else {
      updateGlobalMutation.mutate(selectedMode as SchemaRegistryMode, callbacks);
    }
  };

  return (
    <div className="flex gap-16">
      <div className="flex-1">
        {contextName && (
          <div className="mb-4 flex items-center gap-2" data-testid="edit-mode-context-name">
            <InfoIcon className="size-4 text-muted-foreground" />
            <Text className="font-bold text-lg">
              Editing mode for context: <span className="text-muted-foreground">{contextName}</span>
            </Text>
          </div>
        )}
        <Text data-testid="edit-mode-description">
          Mode controls whether the Schema Registry accepts new schema registrations and under what conditions.
        </Text>

        <div className="mt-6 max-w-[800px]">
          <Choicebox
            className="w-full"
            data-testid="edit-mode-radio"
            onValueChange={(v) => setSelectedMode(v as SchemaRegistryModeWithDefault)}
            value={selectedMode}
          >
            {allOptions.map((option) => (
              <ChoiceboxItem
                checked={selectedMode === option.value}
                className={`max-w-full ${selectedMode === option.value ? 'bg-accent' : ''}`}
                key={option.value}
                value={option.value}
              >
                <ChoiceboxItemHeader>
                  <ChoiceboxItemTitle>{option.title}</ChoiceboxItemTitle>
                  <ChoiceboxItemDescription>{option.description}</ChoiceboxItemDescription>
                  {option.warning && (
                    <div className="mt-2 flex items-start gap-2 text-amber-700 text-sm">
                      <WarningIcon className="mt-0.5 size-4 shrink-0" />
                      <span>{option.warning}</span>
                    </div>
                  )}
                </ChoiceboxItemHeader>
              </ChoiceboxItem>
            ))}
          </Choicebox>

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
      </div>

      {subjectName && schema && (
        <div className="flex-1">
          <Text className="whitespace-pre-wrap break-words font-bold text-lg" data-testid="edit-mode-subject-name">
            {subjectName}
          </Text>
          <Text className="mt-8 mb-4 font-bold text-lg">Schema</Text>
          <DynamicCodeBlock code={getFormattedSchemaText(schema)} lang={schemaTypeToCodeBlockLanguage(schema.type)} />
        </div>
      )}
    </div>
  );
}
