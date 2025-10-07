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
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import {
  useSchemaCompatibilityQuery,
  useSchemaDetailsQuery,
  useSchemaModeQuery,
  useUpdateGlobalCompatibilityMutation,
  useUpdateSubjectCompatibilityMutation,
} from '../../../react-query/api/schema';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import type { SchemaRegistryCompatibilityMode } from '../../../state/restInterfaces';
import { uiState } from '../../../state/uiState';
import { Button, DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import Section from '../../misc/Section';
import { getFormattedSchemaText, schemaTypeToCodeBlockLanguage } from './Schema.Details';

const SchemaNotConfiguredPage: FC = () => {
  return (
    <PageContent>
      <Section>
        <VStack gap={4}>
          <Empty description="Not Configured" />
          <Text textAlign="center">
            Schema Registry is not configured in Redpanda Console.
            <br />
            To view all registered schemas, their documentation and their versioned history simply provide the
            connection credentials in the Redpanda Console config.
          </Text>
          {/* todo: fix link once we have a better guide */}
          <a target="_blank" rel="noopener noreferrer" href="https://docs.redpanda.com/docs/manage/console/">
            <Button variant="solid">Redpanda Console Config Documentation</Button>
          </a>
        </VStack>
      </Section>
    </PageContent>
  );
};

const EditSchemaCompatibilityPage: FC<{ subjectName?: string }> = ({ subjectName: subjectNameEncoded }) => {
  const subjectName = subjectNameEncoded ? decodeURIComponent(subjectNameEncoded) : undefined;

  const { data: schemaMode, isLoading: isModeLoading } = useSchemaModeQuery();
  const { data: schemaCompatibility, isLoading: isCompatibilityLoading } = useSchemaCompatibilityQuery();
  const { data: schemaDetails, isLoading: isDetailsLoading } = useSchemaDetailsQuery(subjectName || '', {
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
  if (isModeLoading || isCompatibilityLoading || (subjectName && isDetailsLoading)) return DefaultSkeleton;

  return (
    <PageContent>
      <EditSchemaCompatibility
        subjectName={subjectName}
        schemaMode={schemaMode}
        schemaCompatibility={schemaCompatibility}
        schemaDetails={schemaDetails}
        onClose={() => {
          if (subjectName) {
            appGlobal.historyReplace(`/schema-registry/subjects/${encodeURIComponent(subjectName)}`);
          } else {
            appGlobal.historyReplace('/schema-registry');
          }
        }}
      />
    </PageContent>
  );
};

export default EditSchemaCompatibilityPage;

function EditSchemaCompatibility(p: {
  subjectName?: string;
  schemaMode: string | null | undefined;
  schemaCompatibility: string | null | undefined;
  schemaDetails: any;
  onClose: () => void;
}) {
  const toast = useToast();
  const { subjectName, schemaDetails, schemaCompatibility } = p;
  const updateGlobalMutation = useUpdateGlobalCompatibilityMutation();
  const updateSubjectMutation = useUpdateSubjectCompatibilityMutation();

  const schema = schemaDetails?.schemas.first((x: any) => x.version === schemaDetails.latestActiveVersion);

  const [configMode, setConfigMode] = useState<string>(
    (subjectName ? schemaDetails?.compatibility : schemaCompatibility) ?? 'DEFAULT',
  );

  if (subjectName && !schema) return DefaultSkeleton;

  const onSave = () => {
    const mutation = subjectName ? updateSubjectMutation : updateGlobalMutation;
    const mutationArgs = subjectName
      ? { subjectName, mode: configMode as 'DEFAULT' | SchemaRegistryCompatibilityMode }
      : (configMode as SchemaRegistryCompatibilityMode);

    mutation.mutate(mutationArgs as any, {
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
  };

  return (
    <>
      <Text>
        Compatibility determines how schema validation occurs when producers are sending messages to Redpanda.
        {/* <Link>Learn more.</Link> */}
      </Text>

      <Grid templateColumns="1fr 1fr" gap="4rem">
        <GridItem mt="4" mb="8">
          <RadioGroup
            name="configMode"
            direction="column"
            isAttached={false}
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
                      Consumers using any previous schema (for example, versions 1-9) can read data from producers using
                      the new schema (for example, version 10).
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
            onChange={(e) => {
              setConfigMode(e);
            }}
          />
        </GridItem>

        <GridItem>
          {subjectName && schema && (
            <>
              <Text mt="4" fontSize="lg" fontWeight="bold" wordBreak="break-word" whiteSpace="break-spaces">
                {subjectName}
              </Text>

              <Text mt="8" mb="4" fontSize="lg" fontWeight="bold">
                Schema
              </Text>
              <Box maxHeight="600px" overflow="scroll">
                <CodeBlock
                  codeString={getFormattedSchemaText(schema)}
                  language={schemaTypeToCodeBlockLanguage(schema.type)}
                  theme="light"
                  showLineNumbers
                  showCopyButton={false}
                />
              </Box>
            </>
          )}
        </GridItem>
      </Grid>

      <Flex gap="4">
        <Button
          colorScheme="brand"
          onClick={onSave}
          disabledReason={
            api.userData?.canManageSchemaRegistry === false
              ? "You don't have the 'canManageSchemaRegistry' permission"
              : undefined
          }
        >
          Save
        </Button>
        <Button variant="link" onClick={p.onClose}>
          Cancel
        </Button>
      </Flex>
    </>
  );
}
