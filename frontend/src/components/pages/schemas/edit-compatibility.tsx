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

import { useClusterFenceGuard } from 'components/cluster-fence/use-cluster-fence-guard';
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
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { type FC, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { getFormattedSchemaText, schemaTypeToCodeBlockLanguage } from './schema-details';
import {
  decodeSchemaEditTarget,
  type SchemaEditPageKind,
  type SchemaEditTarget,
  schemaEditPageStatus,
  useSchemaEditClose,
  useSchemaEditPageHeader,
} from './schema-edit-page';
import { SchemaEditPageFallback } from './schema-edit-page-fallback';
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
import { isNonEmptyString } from '../../../utils/string-utils';
import { PageContent } from '../../misc/page-content';
import { TonedIcon } from '../shared/toned-icon';

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

const EDIT_COMPATIBILITY_PAGE: SchemaEditPageKind = {
  pageTitle: 'Edit Schema Compatibility',
  crumbTitle: 'Edit Compatibility',
  segment: 'edit-compatibility',
};

// The global mode and compatibility, plus the subject's details or the
// context's compatibility when the page edits one of those.
function useEditCompatibilityData({ subjectName, contextName }: SchemaEditTarget) {
  const { data: schemaMode, isLoading: isModeLoading } = useSchemaModeQuery();
  const { data: schemaCompatibility, isLoading: isCompatibilityLoading } = useSchemaCompatibilityQuery();
  const { data: schemaDetails, isLoading: isDetailsLoading } = useSchemaDetailsQuery(subjectName, {
    enabled: subjectName !== null && subjectName !== undefined && subjectName !== '',
  });
  const { data: contexts, isLoading: isContextsLoading } = useSchemaRegistryContextsQuery(
    contextName !== null && contextName !== undefined && contextName !== ''
  );

  const contextCompatibility = useMemo(
    () =>
      contextName !== null && contextName !== undefined && contextName !== ''
        ? contexts?.find((c) => c.name === contextName)?.compatibility
        : undefined,
    [contexts, contextName]
  );

  return {
    schemaMode,
    schemaCompatibility,
    schemaDetails,
    contextCompatibility,
    isLoading:
      isModeLoading ||
      isCompatibilityLoading ||
      (isNonEmptyString(subjectName) && isDetailsLoading) ||
      (isNonEmptyString(contextName) && isContextsLoading),
  };
}
const EditSchemaCompatibilityPage: FC<{
  subjectName?: string;
  contextName?: string;
}> = ({ subjectName: subjectNameEncoded, contextName: contextNameEncoded }) => {
  const target = decodeSchemaEditTarget(subjectNameEncoded, contextNameEncoded);
  const schemaRegistryContextsSupported = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);
  const { schemaMode, schemaCompatibility, schemaDetails, contextCompatibility, isLoading } =
    useEditCompatibilityData(target);
  const onClose = useSchemaEditClose(target);
  useSchemaEditPageHeader(target, EDIT_COMPATIBILITY_PAGE);

  const status = schemaEditPageStatus({
    contextsUnsupported: Boolean(target.contextName) && !schemaRegistryContextsSupported,
    isLoading,
    schemaMode,
  });
  if (status !== 'ready') {
    return <SchemaEditPageFallback status={status} />;
  }

  return (
    <PageContent>
      <EditSchemaCompatibility
        contextCompatibility={contextCompatibility}
        contextName={target.contextName}
        onClose={onClose}
        schemaCompatibility={schemaCompatibility}
        schemaDetails={schemaDetails}
        schemaMode={schemaMode}
        subjectName={target.subjectName}
      />
    </PageContent>
  );
};

export { EditSchemaCompatibilityPage };

// Saves the compatibility for the context, the subject, or (neither) the global config.
function useSaveCompatibility({ subjectName, contextName }: SchemaEditTarget, onClose: () => void) {
  const updateGlobalMutation = useUpdateGlobalCompatibilityMutation();
  const updateSubjectMutation = useUpdateSubjectCompatibilityMutation();
  const updateContextMutation = useUpdateContextCompatibilityMutation();

  return (configMode: SchemaRegistryCompatibilityModeWithDefault) => {
    const callbacks = {
      onSuccess: () => {
        toast.success(`Compatibility mode updated to ${configMode}`);
        onClose();
      },
      onError: (err: Error) => {
        toast.error('Failed to update compatibility mode', { description: String(err) });
      },
    };

    if (contextName !== null && contextName !== undefined && contextName !== '') {
      updateContextMutation.mutate({ contextName, mode: configMode }, callbacks);
    } else if (subjectName !== null && subjectName !== undefined && subjectName !== '') {
      updateSubjectMutation.mutate({ subjectName, mode: configMode }, callbacks);
    } else if (configMode !== 'DEFAULT') {
      updateGlobalMutation.mutate(configMode, callbacks);
    }
  };
}

function EditSchemaCompatibility(p: {
  subjectName?: string;
  contextName?: string;
  contextCompatibility?: SchemaRegistrySubjectDetails['compatibility'];
  schemaMode: string | null | undefined;
  schemaCompatibility: SchemaRegistryCompatibilityMode | null | undefined;
  schemaDetails: SchemaRegistrySubjectDetails | undefined;
  onClose: () => void;
}) {
  const { subjectName, contextName, contextCompatibility, schemaDetails, schemaCompatibility } = p;
  const fencedReason = useClusterFenceGuard().reasonFor('editSchemas');
  const saveCompatibility = useSaveCompatibility({ subjectName, contextName }, p.onClose);
  const schema = schemaDetails?.schemas.find(
    (x: SchemaRegistryVersionedSchema) => x.version === schemaDetails.latestActiveVersion
  );

  const getInitialCompatibility = (): SchemaRegistrySubjectDetails['compatibility'] => {
    if (contextName !== null && contextName !== undefined && contextName !== '') {
      return contextCompatibility ?? SchemaRegistryCompatibilityModes.DEFAULT;
    }
    const source =
      subjectName !== null && subjectName !== undefined && subjectName !== ''
        ? schemaDetails?.compatibility
        : schemaCompatibility;
    return source ?? SchemaRegistryCompatibilityModes.DEFAULT;
  };
  const [configMode, setConfigMode] = useState<SchemaRegistrySubjectDetails['compatibility']>(getInitialCompatibility);

  if (subjectName !== null && subjectName !== undefined && subjectName !== '' && !schema) {
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

  const allOptions: {
    value: SchemaRegistryCompatibilityModeWithDefault;
    title: string;
    description: string;
  }[] =
    (subjectName !== null && subjectName !== undefined && subjectName !== '') ||
    (contextName !== null && contextName !== undefined && contextName !== '')
      ? [DEFAULT_OPTION, ...COMPATIBILITY_OPTIONS]
      : COMPATIBILITY_OPTIONS;
  return (
    <div className="flex gap-16">
      <div className="flex-1">
        {contextName !== null && contextName !== undefined && contextName !== '' && (
          <div className="mb-4 flex items-center gap-2" data-testid="edit-compatibility-context-name">
            <TonedIcon aria-hidden="true" className="size-4" icon={InfoIcon} tone="muted" />
            <div className="text-heading-md font-bold">
              Editing compatibility for context: <span className="text-muted-foreground">{contextName}</span>
            </div>
          </div>
        )}

        <div className="text-body" data-testid="edit-compatibility-description">
          Compatibility determines how schema validation occurs when producers are sending messages to Redpanda.
          {/* <Link>Learn more.</Link> */}
        </div>

        <div className="mt-6 max-w-[800px]">
          <Choicebox
            aria-label="Schema compatibility mode"
            className="w-full"
            data-testid="edit-compatibility-mode-radio"
            onValueChange={(value) => {
              const selected = allOptions.find((option) => option.value === value);
              if (selected) {
                setConfigMode(selected.value);
              }
            }}
            value={configMode}
          >
            {allOptions.map((option) => (
              <ChoiceboxItem className="max-w-full" key={option.value} value={option.value}>
                <ChoiceboxItemHeader>
                  <ChoiceboxItemTitle>{option.title}</ChoiceboxItemTitle>
                  <ChoiceboxItemDescription>{option.description}</ChoiceboxItemDescription>
                </ChoiceboxItemHeader>
              </ChoiceboxItem>
            ))}
          </Choicebox>

          <div className="mt-6 flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    data-testid="edit-compatibility-save-btn"
                    disabled={
                      configMode === 'UNKNOWN' ||
                      api.userData?.canManageSchemaRegistry === false ||
                      Boolean(fencedReason)
                    }
                    onClick={() => {
                      if (configMode !== 'UNKNOWN') {
                        saveCompatibility(configMode);
                      }
                    }}
                    variant="primary"
                  >
                    Save
                  </Button>
                }
              />
              {api.userData?.canManageSchemaRegistry === false && (
                <TooltipContent side="top">You don't have the 'canManageSchemaRegistry' permission</TooltipContent>
              )}
              {api.userData?.canManageSchemaRegistry !== false && Boolean(fencedReason) && (
                <TooltipContent side="top">{fencedReason}</TooltipContent>
              )}
            </Tooltip>
            <Button data-testid="edit-compatibility-cancel-btn" onClick={p.onClose} variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      </div>
      {subjectName !== null && subjectName !== undefined && subjectName !== '' && schema && (
        <div className="flex-1">
          <div
            className="text-heading-md font-bold wrap-break-word whitespace-pre-wrap"
            data-testid="edit-compatibility-subject-name"
          >
            {subjectName}
          </div>
          <div className="mt-8 mb-4 text-heading-md font-bold">Schema</div>
          <DynamicCodeBlock code={getFormattedSchemaText(schema)} lang={schemaTypeToCodeBlockLanguage(schema.type)} />
        </div>
      )}
    </div>
  );
}
