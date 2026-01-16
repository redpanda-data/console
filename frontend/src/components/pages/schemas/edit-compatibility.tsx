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

import { Box, CodeBlock, Empty, Flex, Grid, GridItem, RadioGroup, Text, useToast, VStack } from '@redpanda-data/ui';
import { useNavigate } from '@tanstack/react-router';
import type { FC } from 'react';
import { useEffect, useState } from 'react';

import { getFormattedSchemaText, schemaTypeToCodeBlockLanguage } from './schema-details';
import {
  useSchemaCompatibilityQuery,
  useSchemaDetailsQuery,
  useSchemaModeQuery,
  useUpdateGlobalCompatibilityMutation,
  useUpdateSubjectCompatibilityMutation,
} from '../../../react-query/api/schema-registry';
import { api } from '../../../state/backend-api';
import type {
  SchemaRegistryCompatibilityMode,
  SchemaRegistrySubjectDetails,
  SchemaRegistryVersionedSchema,
} from '../../../state/rest-interfaces';
import { uiState } from '../../../state/ui-state';
import { Button, DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';

const SchemaNotConfiguredPage: FC = () => {
  return (
    <PageContent>
      <Section>
        <VStack data-testid="edit-compatibility-not-configured" gap={4}>
          <Empty description="Not Configured" />
          <Text textAlign="center">
            Schema Registry is not configured in Redpanda Console.
            <br />
            To view all registered schemas, their documentation and their versioned history simply provide the
            connection credentials in the Redpanda Console config.
          </Text>
          {/* todo: fix link once we have a better guide */}
          <a href="https://docs.redpanda.com/docs/manage/console/" rel="noopener noreferrer" target="_blank">
            <Button variant="solid">Redpanda Console Config Documentation</Button>
          </a>
        </VStack>
      </Section>
    </PageContent>
  );
};

const EditSchemaCompatibilityPage: FC<{ subjectName?: string }> = ({ subjectName: subjectNameEncoded }) => {
  const navigate = useNavigate();
  const subjectName = subjectNameEncoded ? decodeURIComponent(subjectNameEncoded) : undefined;

  const { data: schemaMode, isLoading: isModeLoading } = useSchemaModeQuery();
  const { data: schemaCompatibility, isLoading: isCompatibilityLoading } = useSchemaCompatibilityQuery();
  const { data: schemaDetails, isLoading: isDetailsLoading } = useSchemaDetailsQuery(subjectName, {
    enabled: !!subjectName,
  });

  useEffect(() => {
    uiState.pageTitle = 'Edit Schema Compatibility';
    uiState.pageBreadcrumbs = [{ title: 'Schema Registry', linkTo: '/schema-registry' }];

    if (subjectName) {
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
  }, [subjectName]);

  if (api.schemaOverviewIsConfigured === false) {
    return <SchemaNotConfiguredPage />;
  }
  if (isModeLoading || isCompatibilityLoading || (subjectName && isDetailsLoading)) {
    return DefaultSkeleton;
  }

  return (
    <PageContent>
      <EditSchemaCompatibility
        onClose={() => {
          if (subjectName) {
            navigate({ to: `/schema-registry/subjects/${encodeURIComponent(subjectName)}` });
          } else {
            navigate({ to: '/schema-registry' });
          }
        }}
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
  schemaMode: string | null | undefined;
  schemaCompatibility: string | null | undefined;
  schemaDetails: SchemaRegistrySubjectDetails | undefined;
  onClose: () => void;
}) {
  const toast = useToast();
  const { subjectName, schemaDetails, schemaCompatibility } = p;
  const updateGlobalMutation = useUpdateGlobalCompatibilityMutation();
  const updateSubjectMutation = useUpdateSubjectCompatibilityMutation();

  const schema = schemaDetails?.schemas.first(
    (x: SchemaRegistryVersionedSchema) => x.version === schemaDetails.latestActiveVersion
  );

  const [configMode, setConfigMode] = useState<string>(
    (subjectName ? schemaDetails?.compatibility : schemaCompatibility) ?? 'DEFAULT'
  );

  if (subjectName && !schema) {
    return DefaultSkeleton;
  }

  const onSave = () => {
    if (subjectName) {
      updateSubjectMutation.mutate(
        { subjectName, mode: configMode as 'DEFAULT' | SchemaRegistryCompatibilityMode },
        {
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
          onError: (err) => {
            toast({
              status: 'error',
              duration: null,
              isClosable: true,
              title: 'Failed to update compatibility mode',
              description: String(err),
              position: 'top-right',
            });
          },
        }
      );
    } else {
      updateGlobalMutation.mutate(configMode as SchemaRegistryCompatibilityMode, {
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
        onError: (err) => {
          toast({
            status: 'error',
            duration: null,
            isClosable: true,
            title: 'Failed to update compatibility mode',
            description: String(err),
            position: 'top-right',
          });
        },
      });
    }
  };

  return (
    <>
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
                setConfigMode(e);
              }}
              options={[
                {
                  value: 'DEFAULT',
                  disabled: !schemaDetails,
                  label: (
                    <Box>
                      <Text>Default</Text>
                      <Text fontSize="small">Use the globally configured default.</Text>
                    </Box>
                  ),
                },
                {
                  value: 'NONE',
                  label: (
                    <Box>
                      <Text>None</Text>
                      <Text fontSize="small">No schema compatibility checks are done.</Text>
                    </Box>
                  ),
                },
                {
                  value: 'BACKWARD',
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
                  value: 'BACKWARD_TRANSITIVE',
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
                  value: 'FORWARD',
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
                  value: 'FORWARD_TRANSITIVE',
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
                  value: 'FULL',
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
                  value: 'FULL_TRANSITIVE',
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
          colorScheme="brand"
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
