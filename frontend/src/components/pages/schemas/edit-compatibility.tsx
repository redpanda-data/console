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

import { Box, CodeBlock, Flex, Grid, GridItem, RadioGroup, Text, useToast } from '@redpanda-data/ui';
import { useNavigate } from '@tanstack/react-router';
import { InfoIcon } from 'components/icons';
import { type FC, useCallback, useEffect, useMemo, useState } from 'react';

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
import { Button, DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';

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
    return DefaultSkeleton;
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
  const toast = useToast();
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
    return DefaultSkeleton;
  }

  const onSave = () => {
    const callbacks = {
      onSuccess: () => {
        toast({
          status: 'success',
          duration: 4000,
          isClosable: false,
          title: `Compatibility mode updated to ${configMode}`,
          position: 'top-right',
        });
        p.onClose();
      },
      onError: (err: Error) => {
        toast({
          status: 'error',
          duration: null,
          isClosable: true,
          title: 'Failed to update compatibility mode',
          description: String(err),
          position: 'top-right',
        });
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

  return (
    <>
      {contextName && (
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

      <Grid gap="4rem" templateColumns="1fr 1fr">
        <GridItem mb="8" mt="4">
          <Box data-testid="edit-compatibility-mode-radio">
            <RadioGroup
              direction="column"
              isAttached={false}
              name="configMode"
              onChange={(e) => {
                setConfigMode(e as SchemaRegistryCompatibilityModeWithDefault);
              }}
              options={[
                {
                  value: SchemaRegistryCompatibilityModes.DEFAULT,
                  disabled: !(schemaDetails || contextName),
                  label: (
                    <Box>
                      <Text>Default</Text>
                      <Text fontSize="small">Use the globally configured default.</Text>
                    </Box>
                  ),
                },
                {
                  value: SchemaRegistryCompatibilityModes.NONE,
                  label: (
                    <Box>
                      <Text>None</Text>
                      <Text fontSize="small">No schema compatibility checks are done.</Text>
                    </Box>
                  ),
                },
                {
                  value: SchemaRegistryCompatibilityModes.BACKWARD,
                  label: (
                    <Box>
                      <Text>Backward</Text>
                      <Text fontSize="small">
                        Consumers using the new schema (for example, version 10) can read data from producers using the
                        previous schema (for example, version 9).
                      </Text>
                    </Box>
                  ),
                },
                {
                  value: SchemaRegistryCompatibilityModes.BACKWARD_TRANSITIVE,
                  label: (
                    <Box>
                      <Text>Transitive Backward</Text>
                      <Text fontSize="small">
                        Consumers using the new schema (for example, version 10) can read data from producers using all
                        previous schemas (for example, versions 1-9).
                      </Text>
                    </Box>
                  ),
                },
                {
                  value: SchemaRegistryCompatibilityModes.FORWARD,
                  label: (
                    <Box>
                      <Text>Forward</Text>
                      <Text fontSize="small">
                        Consumers using the previous schema (for example, version 9) can read data from producers using
                        the new schema (for example, version 10).
                      </Text>
                    </Box>
                  ),
                },
                {
                  value: SchemaRegistryCompatibilityModes.FORWARD_TRANSITIVE,
                  label: (
                    <Box>
                      <Text>Transitive Forward</Text>
                      <Text fontSize="small">
                        Consumers using any previous schema (for example, versions 1-9) can read data from producers
                        using the new schema (for example, version 10).
                      </Text>
                    </Box>
                  ),
                },
                {
                  value: SchemaRegistryCompatibilityModes.FULL,
                  label: (
                    <Box>
                      <Text>Full</Text>
                      <Text fontSize="small">
                        A new schema and the previous schema (for example, versions 10 and 9) are both backward and
                        forward compatible with each other.
                      </Text>
                    </Box>
                  ),
                },
                {
                  value: SchemaRegistryCompatibilityModes.FULL_TRANSITIVE,
                  label: (
                    <Box>
                      <Text>Transitive Full</Text>
                      <Text fontSize="small">
                        Each schema is both backward and forward compatible with all registered schemas.
                      </Text>
                    </Box>
                  ),
                },
              ]}
              value={configMode}
            />
          </Box>
        </GridItem>

        <GridItem>
          {Boolean(subjectName && schema) && (
            <>
              <Text
                data-testid="edit-compatibility-subject-name"
                fontSize="lg"
                fontWeight="bold"
                mt="4"
                whiteSpace="break-spaces"
                wordBreak="break-word"
              >
                {subjectName}
              </Text>

              <Text fontSize="lg" fontWeight="bold" mb="4" mt="8">
                Schema
              </Text>
              {schema ? (
                <Box maxHeight="600px" overflow="scroll">
                  <CodeBlock
                    codeString={getFormattedSchemaText(schema)}
                    data-testid="edit-compatibility-schema-code"
                    language={schemaTypeToCodeBlockLanguage(schema.type)}
                    showCopyButton={false}
                    showLineNumbers
                    theme="light"
                  />
                </Box>
              ) : null}
            </>
          )}
        </GridItem>
      </Grid>

      <Flex gap="4">
        <Button
          data-testid="edit-compatibility-save-btn"
          disabledReason={
            api.userData?.canManageSchemaRegistry === false
              ? "You don't have the 'canManageSchemaRegistry' permission"
              : undefined
          }
          onClick={onSave}
        >
          Save
        </Button>
        <Button data-testid="edit-compatibility-cancel-btn" onClick={p.onClose} variant="link">
          Cancel
        </Button>
      </Flex>
    </>
  );
}
