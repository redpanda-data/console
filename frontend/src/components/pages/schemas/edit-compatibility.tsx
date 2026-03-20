/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useNavigate } from '@tanstack/react-router';
import { InfoIcon } from 'components/icons';
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
  useSchemaCompatibilityQuery,
  useSchemaDetailsQuery,
  useSchemaModeQuery,
  useSchemaRegistryContextsQuery,
  useUpdateContextCompatibilityMutation,
  useUpdateGlobalCompatibilityMutation,
  useUpdateSubjectCompatibilityMutation,
} from '../../../react-query/api/schema-registry';
import { api } from '../../../state/backend-api';
import {
  type SchemaRegistryCompatibilityMode,
  SchemaRegistryCompatibilityModes,
  type SchemaRegistryCompatibilityModeWithDefault,
  type SchemaRegistrySubjectDetails,
  type SchemaRegistryVersionedSchema,
} from '../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../state/supported-features';
import { uiState } from '../../../state/ui-state';
import PageContent from '../../misc/page-content';

const DEFAULT_OPTION = {
  value: SchemaRegistryCompatibilityModes.DEFAULT,
  title: 'Default',
  description: 'Use the globally configured default.',
};

const COMPATIBILITY_OPTIONS: {
  value: SchemaRegistryCompatibilityMode;
  title: string;
  description: string;
}[] = [
  {
    value: SchemaRegistryCompatibilityModes.NONE,
    title: 'None',
    description: 'No schema compatibility checks are done.',
  },
  {
    value: SchemaRegistryCompatibilityModes.BACKWARD,
    title: 'Backward',
    description:
      'Consumers using the new schema (for example, version 10) can read data from producers using the previous schema (for example, version 9).',
  },
  {
    value: SchemaRegistryCompatibilityModes.BACKWARD_TRANSITIVE,
    title: 'Transitive Backward',
    description:
      'Consumers using the new schema (for example, version 10) can read data from producers using all previous schemas (for example, versions 1-9).',
  },
  {
    value: SchemaRegistryCompatibilityModes.FORWARD,
    title: 'Forward',
    description:
      'Consumers using the previous schema (for example, version 9) can read data from producers using the new schema (for example, version 10).',
  },
  {
    value: SchemaRegistryCompatibilityModes.FORWARD_TRANSITIVE,
    title: 'Transitive Forward',
    description:
      'Consumers using any previous schema (for example, versions 1-9) can read data from producers using the new schema (for example, version 10).',
  },
  {
    value: SchemaRegistryCompatibilityModes.FULL,
    title: 'Full',
    description:
      'A new schema and the previous schema (for example, versions 10 and 9) are both backward and forward compatible with each other.',
  },
  {
    value: SchemaRegistryCompatibilityModes.FULL_TRANSITIVE,
    title: 'Transitive Full',
    description: 'Each schema is both backward and forward compatible with all registered schemas.',
  },
];

const EditSchemaCompatibilityPage: FC<{ subjectName?: string; contextName?: string }> = ({
  subjectName: subjectNameEncoded,
  contextName: contextNameEncoded,
}) => {
  const navigate = useNavigate();
  const subjectName = subjectNameEncoded ? decodeURIComponent(subjectNameEncoded) : undefined;
  const contextName = contextNameEncoded ? decodeURIComponent(contextNameEncoded) : undefined;
  const schemaRegistryContextsSupported = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);

  const { data: schemaMode, isLoading: isModeLoading } = useSchemaModeQuery();
  const { data: schemaCompatibility, isLoading: isCompatibilityLoading } = useSchemaCompatibilityQuery();
  const { data: schemaDetails, isLoading: isDetailsLoading } = useSchemaDetailsQuery(subjectName, {
    enabled: !!subjectName,
  });
  const { data: contexts, isLoading: isContextsLoading } = useSchemaRegistryContextsQuery(!!contextName);

  const contextCompatibility = useMemo(
    () => (contextName ? contexts?.find((c) => c.name === contextName)?.compatibility : undefined),
    [contexts, contextName]
  );

  useEffect(() => {
    uiState.pageTitle = 'Edit Schema Compatibility';
    uiState.pageBreadcrumbs = [{ title: 'Schema Registry', linkTo: '/schema-registry' }];

    if (contextName) {
      uiState.pageBreadcrumbs.push({
        title: 'Edit Compatibility',
        linkTo: `/schema-registry/contexts/${encodeURIComponent(contextName)}/edit-compatibility`,
      });
    } else if (subjectName) {
      uiState.pageBreadcrumbs.push({
        title: subjectName,
        linkTo: `/schema-registry/subjects/${subjectName}`,
      });
      uiState.pageBreadcrumbs.push({
        title: 'Edit Compatibility',
        linkTo: `/schema-registry/subjects/${subjectName}/edit-compatibility`,
      });
    } else {
      uiState.pageBreadcrumbs.push({
        title: 'Edit Compatibility',
        linkTo: '/schema-registry/edit-compatibility',
      });
    }
  }, [subjectName, contextName]);

  const onClose = useCallback(() => {
    if (subjectName) {
      navigate({ to: `/schema-registry/subjects/${encodeURIComponent(subjectName)}` });
    } else if (contextName) {
      navigate({ to: '/schema-registry', search: { context: contextName } });
    } else {
      navigate({ to: '/schema-registry' });
    }
  }, [subjectName, contextName, navigate]);

  if (contextName && !schemaRegistryContextsSupported) {
    return <ContextsNotSupportedPage />;
  }

  if (
    isModeLoading ||
    isCompatibilityLoading ||
    (subjectName && isDetailsLoading) ||
    (contextName && isContextsLoading)
  ) {
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
      <EditSchemaCompatibility
        contextCompatibility={contextCompatibility}
        contextName={contextName}
        onClose={onClose}
        schemaCompatibility={schemaCompatibility}
        schemaDetails={schemaDetails}
        schemaMode={schemaMode}
        subjectName={subjectName}
      />
    </PageContent>
  );
};

export default EditSchemaCompatibilityPage;

function EditSchemaCompatibility(p: {
  subjectName?: string;
  contextName?: string;
  contextCompatibility?: SchemaRegistryCompatibilityModeWithDefault;
  schemaMode: string | null | undefined;
  schemaCompatibility: string | null | undefined;
  schemaDetails: SchemaRegistrySubjectDetails | undefined;
  onClose: () => void;
}) {
  const { subjectName, contextName, contextCompatibility, schemaDetails, schemaCompatibility } = p;
  const updateGlobalMutation = useUpdateGlobalCompatibilityMutation();
  const updateSubjectMutation = useUpdateSubjectCompatibilityMutation();
  const updateContextMutation = useUpdateContextCompatibilityMutation();

  const schema = schemaDetails?.schemas.first(
    (x: SchemaRegistryVersionedSchema) => x.version === schemaDetails.latestActiveVersion
  );

  const getInitialCompatibility = (): SchemaRegistryCompatibilityModeWithDefault => {
    if (contextName) return contextCompatibility ?? SchemaRegistryCompatibilityModes.DEFAULT;
    const source = subjectName ? schemaDetails?.compatibility : schemaCompatibility;
    return (source as SchemaRegistryCompatibilityModeWithDefault) ?? SchemaRegistryCompatibilityModes.DEFAULT;
  };
  const [configMode, setConfigMode] = useState<SchemaRegistryCompatibilityModeWithDefault>(getInitialCompatibility);

  if (subjectName && !schema) {
    return (
      <SkeletonGroup direction="vertical" spacing="lg">
        <Skeleton variant="heading" width="lg" />
        <Skeleton variant="text" width="full" />
        <Skeleton size="xl" width="full" />
        <Skeleton size="xl" width="full" />
        <Skeleton size="xl" width="full" />
      </SkeletonGroup>
    );
  }

  const onSave = () => {
    const callbacks = {
      onSuccess: () => {
        toast.success(`Compatibility mode updated to ${configMode}`);
        p.onClose();
      },
      onError: (err: Error) => {
        toast.error('Failed to update compatibility mode', { description: String(err) });
      },
    };

    if (contextName) {
      updateContextMutation.mutate({ contextName, mode: configMode }, callbacks);
    } else if (subjectName) {
      updateSubjectMutation.mutate({ subjectName, mode: configMode }, callbacks);
    } else {
      updateGlobalMutation.mutate(configMode as SchemaRegistryCompatibilityMode, callbacks);
    }
  };

  const allOptions: { value: string; title: string; description: string }[] =
    subjectName || contextName ? [DEFAULT_OPTION, ...COMPATIBILITY_OPTIONS] : COMPATIBILITY_OPTIONS;

  return (
    <div className="flex gap-16">
      <div className="flex-1">
        {!!contextName && (
          <div className="mb-4 flex items-center gap-2" data-testid="edit-compatibility-context-name">
            <InfoIcon className="size-4 text-muted-foreground" />
            <Text className="font-bold text-lg">
              Editing compatibility for context: <span className="text-muted-foreground">{contextName}</span>
            </Text>
          </div>
        )}

        <Text data-testid="edit-compatibility-description">
          Compatibility determines how schema validation occurs when producers are sending messages to Redpanda.
          {/* <Link>Learn more.</Link> */}
        </Text>

        <div className="mt-6 max-w-[800px]">
          <Choicebox
            className="w-full"
            data-testid="edit-compatibility-mode-radio"
            onValueChange={setConfigMode}
            value={configMode}
          >
            {allOptions.map((option) => (
              <ChoiceboxItem
                checked={configMode === option.value}
                className={`max-w-full ${configMode === option.value ? 'bg-accent' : ''}`}
                key={option.value}
                value={option.value}
              >
                <ChoiceboxItemHeader>
                  <ChoiceboxItemTitle>{option.title}</ChoiceboxItemTitle>
                  <ChoiceboxItemDescription>{option.description}</ChoiceboxItemDescription>
                </ChoiceboxItemHeader>
              </ChoiceboxItem>
            ))}
          </Choicebox>

          <div className="mt-6 flex items-center gap-4">
            <Button
              data-testid="edit-compatibility-save-btn"
              disabled={api.userData?.canManageSchemaRegistry === false}
              onClick={onSave}
              variant="primary"
            >
              Save
            </Button>
            <Button data-testid="edit-compatibility-cancel-btn" onClick={p.onClose} variant="secondary-ghost">
              Cancel
            </Button>
          </div>
        </div>
      </div>

      {!!subjectName && schema && (
        <div className="flex-1">
          <Text
            className="whitespace-pre-wrap break-words font-bold text-lg"
            data-testid="edit-compatibility-subject-name"
          >
            {subjectName}
          </Text>
          <Text className="mt-8 mb-4 font-bold text-lg">Schema</Text>
          <DynamicCodeBlock code={getFormattedSchemaText(schema)} lang={schemaTypeToCodeBlockLanguage(schema.type)} />
        </div>
      )}
    </div>
  );
}
