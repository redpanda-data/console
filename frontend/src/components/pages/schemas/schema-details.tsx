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

import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  CodeBlock,
  createStandaloneToast,
  Divider,
  Flex,
  Grid,
  GridItem,
  Link,
  ListItem,
  Tabs,
  Text,
  UnorderedList,
  useToast,
} from '@redpanda-data/ui';
import { useQueryClient } from '@tanstack/react-query';
import { runInAction } from 'mobx';
import React, { useEffect, useState } from 'react';
import { Link as ReactRouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { openDeleteModal, openPermanentDeleteModal } from './modals';
import { SchemaRegistryCapability } from '../../../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { useGetIdentityQuery } from '../../../react-query/api/authentication';
import {
  useCreateSchemaMutation,
  useDeleteSchemaSubjectMutation,
  useDeleteSchemaVersionMutation,
  useListSchemasQuery,
  useSchemaCompatibilityQuery,
  useSchemaDetailsQuery,
  useSchemaModeQuery,
  useSchemaReferencedByQuery,
  useSchemaTypesQuery,
} from '../../../react-query/api/schema-registry';
import type { SchemaRegistrySubjectDetails, SchemaRegistryVersionedSchema } from '../../../state/rest-interfaces';
import { uiState } from '../../../state/ui-state';
import { Button, DefaultSkeleton, Label } from '../../../utils/tsx-utils';
import { decodeURIComponentPercents, encodeURIComponentPercents } from '../../../utils/utils';
import { KowlDiffEditor } from '../../misc/kowl-editor';
import PageContent from '../../misc/page-content';
import { SingleSelect } from '../../misc/select';
import { SmallStat } from '../../misc/small-stat';

const { ToastContainer } = createStandaloneToast();

const SchemaDetailsView: React.FC<{ subjectName: string }> = ({ subjectName: subjectNameProp }) => {
  const { subjectName: subjectNameParam } = useParams<{ subjectName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  // Use prop if provided (for routing), otherwise use URL param
  const subjectNameRaw = decodeURIComponentPercents(subjectNameProp || subjectNameParam || '');
  const subjectNameEncoded = encodeURIComponent(subjectNameRaw);

  const versionParam = searchParams.get('version');
  const version =
    versionParam && versionParam !== 'latest' && !Number.isNaN(Number(versionParam)) ? Number(versionParam) : 'latest';

  // Fetch data using React Query hooks
  const { data: userData } = useGetIdentityQuery();
  const { data: schemaSubjects } = useListSchemasQuery();
  const { data: subject, isLoading: isLoadingSubject } = useSchemaDetailsQuery(subjectNameRaw);
  useSchemaCompatibilityQuery(); // Fetch for other components
  useSchemaModeQuery(); // Fetch for other components
  useSchemaTypesQuery(); // Fetch for other components

  const deleteSubjectMutation = useDeleteSchemaSubjectMutation();

  // Update page title and breadcrumbs
  useEffect(() => {
    runInAction(() => {
      uiState.pageTitle = subjectNameRaw;
      uiState.pageBreadcrumbs = [
        { title: 'Schema Registry', linkTo: '/schema-registry' },
        {
          title: subjectNameRaw,
          linkTo: `/schema-registry/${encodeURIComponent(subjectNameRaw)}?version=${version}`,
          options: {
            canBeTruncated: true,
            canBeCopied: true,
          },
        },
      ];
    });
  }, [subjectNameRaw, version]);

  // Set version in query params if not present
  useEffect(() => {
    if (!searchParams.has('version')) {
      setSearchParams({ version: 'latest' });
    }
  }, [searchParams, setSearchParams]);

  if (isLoadingSubject || !subject) {
    return DefaultSkeleton;
  }

  const isSoftDeleted = schemaSubjects?.find((x) => x.name === subjectNameRaw)?.isSoftDeleted;

  const canManageSchemaRegistry = userData?.permissions?.schemaRegistry?.includes(SchemaRegistryCapability.WRITE);
  const canCreateSchemas = userData?.permissions?.schemaRegistry?.includes(SchemaRegistryCapability.WRITE);
  const canDeleteSchemas = userData?.permissions?.schemaRegistry?.includes(SchemaRegistryCapability.DELETE);

  const handleDeleteSubject = (permanent: boolean) => {
    const modalCallback = () => {
      deleteSubjectMutation.mutate(
        { subjectName: subjectNameRaw, permanent },
        {
          onSuccess: () => {
            toast({
              status: 'success',
              duration: 4000,
              isClosable: false,
              title: permanent ? 'Subject permanently deleted' : 'Subject soft-deleted',
            });
            if (permanent) {
              navigate('/schema-registry/');
            }
          },
          onError: (err) => {
            toast({
              status: 'error',
              duration: null,
              isClosable: true,
              title: permanent ? 'Failed to permanently delete subject' : 'Failed to soft-delete subject',
              description: String(err),
            });
          },
        }
      );
    };

    if (permanent) {
      openPermanentDeleteModal(subjectNameRaw, modalCallback);
    } else {
      openDeleteModal(subjectNameRaw, modalCallback);
    }
  };

  return (
    <PageContent key="b">
      <ToastContainer />

      {/* Statistics Bar */}
      <Flex alignItems="center" gap="1rem">
        <SmallStat title="Format">{subject.type}</SmallStat>
        <Divider height="2ch" orientation="vertical" />

        <SmallStat title="Compatibility">{subject.compatibility}</SmallStat>
        <Divider height="2ch" orientation="vertical" />

        <SmallStat title="Active Versions">{subject.schemas.count((x) => !x.isSoftDeleted)}</SmallStat>
      </Flex>

      {/* Buttons */}
      <Flex gap="2">
        <Button
          data-testid="schema-details-edit-compatibility-btn"
          disabledReason={
            canManageSchemaRegistry === false ? "You don't have the 'canManageSchemaRegistry' permission" : undefined
          }
          onClick={() => navigate(`/schema-registry/subjects/${subjectNameEncoded}/edit-compatibility`)}
          variant="outline"
        >
          Edit compatibility
        </Button>
        <Button
          data-testid="schema-details-add-version-btn"
          disabledReason={canCreateSchemas === false ? "You don't have the 'canCreateSchemas' permission" : undefined}
          onClick={() => navigate(`/schema-registry/subjects/${subjectNameEncoded}/add-version`)}
          variant="outline"
        >
          Add new version
        </Button>
        <Button
          data-testid="schema-details-delete-subject-btn"
          disabledReason={canDeleteSchemas === false ? "You don't have the 'canDeleteSchemas' permission" : undefined}
          onClick={() => handleDeleteSubject(isSoftDeleted ?? false)}
          variant="outline"
        >
          Delete subject
        </Button>
      </Flex>

      {/* Definition / Diff */}
      <Tabs
        data-testid="schema-details-tabs"
        isFitted
        items={[
          {
            key: 'definition',
            name: 'Definition',
            component: <SubjectDefinition subject={subject} />,
          },
          {
            key: 'diff',
            name: 'Version diff',
            component: <VersionDiff subject={subject} />,
          },
        ]}
      />
    </PageContent>
  );
};

export function schemaTypeToCodeBlockLanguage(type: string) {
  const lower = type.toLowerCase();
  switch (lower) {
    case 'json':
    case 'avro':
      return 'json';
    default:
      return 'protobuf';
  }
}

export function getFormattedSchemaText(schema: SchemaRegistryVersionedSchema) {
  const lower = schema.type.toLowerCase();
  if (lower === 'avro' || lower === 'json') {
    return JSON.stringify(JSON.parse(schema.schema), undefined, 4);
  }
  return schema.schema;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
const SubjectDefinition = (p: { subject: SchemaRegistrySubjectDetails }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const subjectData = p.subject;

  const { data: userData } = useGetIdentityQuery();
  const deleteVersionMutation = useDeleteSchemaVersionMutation();
  const createSchemaMutation = useCreateSchemaMutation();

  const queryVersion = searchParams.get('version');
  const versionNumber =
    queryVersion && queryVersion !== 'latest' && !Number.isNaN(Number(queryVersion)) ? Number(queryVersion) : null;

  // Determine fallback version when no specific version is requested
  const fallbackVersion =
    subjectData.latestActiveVersion === -1 ? subjectData.schemas.last()?.version : subjectData.latestActiveVersion;

  // Check if requested version exists in available schemas
  const requestedVersionExists = versionNumber ? subjectData.schemas.some((s) => s.version === versionNumber) : true;

  // Use URL parameter if provided and exists, otherwise fall back to latest active version
  const defaultVersion =
    versionNumber && requestedVersionExists
      ? versionNumber
      : (fallbackVersion ?? subjectData.versions[0]?.version ?? 1);
  const [selectedVersion, setSelectedVersion] = useState(defaultVersion);

  // Show notification and update URL if requested version doesn't exist
  useEffect(() => {
    if (versionNumber && !requestedVersionExists) {
      toast({
        status: 'warning',
        title: `Version ${versionNumber} not found`,
        description: `Showing version ${fallbackVersion} instead`,
        duration: 5000,
        isClosable: true,
      });
      setSearchParams({ version: String(fallbackVersion) });
    }
  }, [versionNumber, requestedVersionExists, fallbackVersion, toast, setSearchParams]);

  const schema = subjectData.schemas.first((x) => x.version === selectedVersion);

  useEffect(() => {
    if (!schema && selectedVersion !== defaultVersion) {
      setSelectedVersion(defaultVersion);
    }
  }, [schema, selectedVersion, defaultVersion]);

  if (!schema) {
    return null;
  }

  const canCreateSchemas = userData?.permissions?.schemaRegistry?.includes(SchemaRegistryCapability.WRITE);
  const canDeleteSchemas = userData?.permissions?.schemaRegistry?.includes(SchemaRegistryCapability.DELETE);

  const handleVersionChange = (value: number) => {
    setSearchParams({ version: String(value) });
    setSelectedVersion(value);
  };

  const handlePermanentDelete = () => {
    openPermanentDeleteModal(`${subjectData.name} version ${schema.version}`, () => {
      deleteVersionMutation.mutate(
        { subjectName: subjectData.name, version: schema.version, permanent: true },
        {
          onSuccess: async () => {
            toast({
              status: 'success',
              duration: 4000,
              isClosable: false,
              title: 'Schema version permanently deleted',
            });

            // Invalidate and refetch to get updated details
            await queryClient.invalidateQueries({
              queryKey: ['schemaRegistry', 'subjects', subjectData.name, 'details'],
            });
            const newDetails = queryClient.getQueryData<SchemaRegistrySubjectDetails>([
              'schemaRegistry',
              'subjects',
              subjectData.name,
              'details',
            ]);

            if (newDetails?.latestActiveVersion) {
              setSelectedVersion(newDetails.latestActiveVersion);
            } else {
              navigate('/schema-registry/');
            }
          },
          onError: (err) => {
            toast({
              status: 'error',
              duration: null,
              isClosable: true,
              title: 'Failed to permanently delete schema version',
              description: String(err),
            });
          },
        }
      );
    });
  };

  const handleRecover = () => {
    createSchemaMutation.mutate(
      {
        subjectName: subjectData.name,
        schemaType: schema.type,
        schema: schema.schema,
        references: schema.references,
      },
      {
        onSuccess: (result) => {
          toast({
            status: 'success',
            duration: 4000,
            isClosable: false,
            title: `Schema ${subjectData.name} ${schema.version} has been recovered`,
            description: `Schema ID: ${result.id}`,
          });

          // Navigate to the latest active version after recovery
          navigate(`/schema-registry/subjects/${encodeURIComponent(subjectData.name)}?version=latest`);
        },
        onError: (err) => {
          toast({
            status: 'error',
            duration: null,
            isClosable: true,
            title: `Failed to recover schema ${subjectData.name} ${schema.version}`,
            description: `Error: ${String(err)}`,
          });
        },
      }
    );
  };

  const handleSoftDelete = () => {
    openDeleteModal(`${subjectData.name} version ${schema.version}`, () => {
      deleteVersionMutation.mutate(
        { subjectName: subjectData.name, version: schema.version, permanent: false },
        {
          onSuccess: () => {
            toast({
              status: 'success',
              duration: 4000,
              isClosable: false,
              title: 'Schema version deleted',
              description: 'You can recover or permanently delete it.',
            });
          },
          onError: (err) => {
            toast({
              status: 'error',
              duration: null,
              isClosable: true,
              title: 'Failed to delete schema version',
              description: String(err),
            });
          },
        }
      );
    });
  };

  return (
    <Flex gap="10">
      {/* Left Side */}
      <Flex direction="column" flexGrow="1" gap="4" minWidth="0">
        {/* Version Select / Delete / Recover */}
        <Flex alignItems="flex-end" gap="2">
          <Label text="Version">
            <Box width="200px">
              <SingleSelect
                data-testid="schema-definition-version-select"
                isDisabled={subjectData.versions.length === 0}
                onChange={handleVersionChange}
                options={subjectData.versions.map((v) => ({
                  value: v.version,
                  label:
                    String(v.version) +
                    (v.isSoftDeleted ? ' (soft-deleted)' : '') +
                    (subjectData.versions.at(-1) === v ? ' (latest)' : ''),
                }))}
                value={selectedVersion}
              />
            </Box>
          </Label>
          <Flex alignItems="center" data-testid="schema-definition-schema-id" height="36px" ml="4">
            Schema ID: {schema.id}
          </Flex>

          {schema.isSoftDeleted ? (
            <>
              <Button
                data-testid="schema-definition-permanent-delete-btn"
                disabledReason={
                  canDeleteSchemas === false ? "You don't have the 'canDeleteSchemas' permission" : undefined
                }
                ml="auto"
                onClick={handlePermanentDelete}
                variant="outline"
              >
                Permanent delete
              </Button>

              <Button
                data-testid="schema-definition-recover-btn"
                disabledReason={
                  canCreateSchemas === false ? "You don't have the 'canCreateSchemas' permission" : undefined
                }
                onClick={handleRecover}
                variant="outline"
              >
                Recover
              </Button>
            </>
          ) : (
            <Button
              data-testid="schema-definition-delete-version-btn"
              disabledReason={
                canDeleteSchemas === false ? "You don't have the 'canDeleteSchemas' permission" : undefined
              }
              ml="auto"
              onClick={handleSoftDelete}
              variant="outline"
            >
              Delete
            </Button>
          )}
        </Flex>

        {/* Deleted Hint */}
        {Boolean(schema.isSoftDeleted) && (
          <Alert data-testid="schema-definition-soft-deleted-alert" status="warning" variant="left-accent">
            <AlertIcon />
            <Box>
              <AlertTitle>Soft-deleted schema</AlertTitle>
              <AlertDescription>
                This schema has been soft-deleted. It is still required by other schemas. It remains readable.
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {/* Code Block */}
        <CodeBlock
          codeString={getFormattedSchemaText(schema)}
          data-testid="schema-definition-code-block"
          language={schemaTypeToCodeBlockLanguage(schema.type)}
          showCopyButton={false}
          showLineNumbers
          theme="light"
        />
      </Flex>

      {/* References Box */}
      <Box>
        <SchemaReferences schema={schema} subject={subjectData} />
      </Box>
    </Flex>
  );
};

const VersionDiff = (p: { subject: SchemaRegistrySubjectDetails }) => {
  const subject = p.subject;

  const defaultVersionLeft = subject.versions[0]?.version ?? 1;
  const defaultVersionRight =
    subject.latestActiveVersion === -1 ? defaultVersionLeft : (subject.latestActiveVersion ?? defaultVersionLeft);

  const [selectedVersionLeft, setSelectedVersionLeft] = useState(defaultVersionLeft);
  const [selectedVersionRight, setSelectedVersionRight] = useState(defaultVersionRight);

  const schemaLeft = subject.schemas.first((x) => x.version === selectedVersionLeft);
  const schemaRight = subject.schemas.first((x) => x.version === selectedVersionRight);

  useEffect(() => {
    if (!schemaLeft) {
      setSelectedVersionLeft(subject.versions[0]?.version ?? 1);
    }
  }, [schemaLeft, subject.versions]);

  useEffect(() => {
    if (!schemaRight) {
      setSelectedVersionRight(subject.versions[0]?.version ?? 1);
    }
  }, [schemaRight, subject.versions]);

  if (!(schemaLeft && schemaRight)) {
    return null;
  }

  return (
    <Flex direction="column" gap="10">
      {/* Two version selectors */}
      <Grid gap="4" minWidth="0" templateColumns="repeat(2, 1fr)" width="100%">
        <GridItem w="100%">
          {/* Version Select / Delete / Recover */}
          <Flex alignItems="flex-end" gap="2">
            <Label text="Version">
              <Box width="200px">
                <SingleSelect
                  data-testid="schema-diff-version-left-select"
                  isDisabled={subject.versions.length === 0}
                  onChange={(value) => {
                    setSelectedVersionLeft(value);
                  }}
                  options={subject.versions.map((v) => ({
                    value: v.version,
                    label:
                      String(v.version) +
                      (v.isSoftDeleted ? ' (soft-deleted)' : '') +
                      (subject.versions.at(-1) === v ? ' (latest)' : ''),
                  }))}
                  value={selectedVersionLeft}
                />
              </Box>
            </Label>
            <Flex alignItems="center" data-testid="schema-diff-schema-id-left" height="36px" ml="4">
              Schema ID: {schemaLeft.id}
            </Flex>
          </Flex>
        </GridItem>

        <GridItem w="100%">
          {/* Version Select / Delete / Recover */}
          <Flex alignItems="flex-end" gap="2">
            <Label text="Version">
              <Box width="200px">
                <SingleSelect
                  data-testid="schema-diff-version-right-select"
                  isDisabled={subject.versions.length === 0}
                  onChange={(value) => {
                    setSelectedVersionRight(value);
                  }}
                  options={subject.versions.map((v) => ({
                    value: v.version,
                    label:
                      String(v.version) +
                      (v.isSoftDeleted ? ' (soft-deleted)' : '') +
                      (subject.versions.at(-1) === v ? ' (latest)' : ''),
                  }))}
                  value={selectedVersionRight}
                />
              </Box>
            </Label>
            <Flex alignItems="center" data-testid="schema-diff-schema-id-right" height="36px" ml="4">
              Schema ID: {schemaRight.id}
            </Flex>
          </Flex>
        </GridItem>
      </Grid>

      {/* Diff View */}
      <KowlDiffEditor
        data-testid="schema-diff-editor"
        height="800px"
        language={schemaTypeToCodeBlockLanguage(schemaLeft.type)}
        modified={getFormattedSchemaText(schemaRight)}
        options={{
          readOnly: true,
        }}
        original={getFormattedSchemaText(schemaLeft)}
      />
    </Flex>
  );
};

const SchemaReferences = (p: { subject: SchemaRegistrySubjectDetails; schema: SchemaRegistryVersionedSchema }) => {
  const { subject, schema } = p;
  const version = schema.version;

  // Fetch referenced by data using React Query
  const { data: referencedByData } = useSchemaReferencedByQuery(subject.name, version);

  return (
    <>
      <Text data-testid="schema-references-heading" fontSize="lg" fontWeight="bold" mt="20">
        References
      </Text>
      <Text mb="6">
        Schemas that are required by this version.
        {/* <Link as={ReactRouterLink} to="/home">Learn More</Link> */}
      </Text>

      {schema.references.length > 0 ? (
        <UnorderedList data-testid="schema-references-list">
          {schema.references.map((ref) => {
            // Schema references contain two distinct identifiers:
            // - ref.name: The import string used within the schema (e.g., "foo/bar/baz.proto")
            // - ref.subject: The actual Schema Registry subject name (e.g., "foo.bar.baz")
            //
            // For consistent UX, we display the subject name (what users navigate to)
            // rather than the import string. Both "References" and "Referenced By"
            // sections now consistently show subject names.
            //
            // Navigation uses encodeURIComponentPercents() instead of encodeURIComponent()
            // because schema subject names with periods/slashes cause URL parsing issues
            // in React Router. The special encoder replaces % with ﹪ to avoid conflicts.
            return (
              <ListItem key={ref.name + ref.subject + ref.version}>
                <Link
                  as={ReactRouterLink}
                  data-testid={`schema-reference-link-${ref.subject}`}
                  to={`/schema-registry/subjects/${encodeURIComponentPercents(ref.subject)}?version=${ref.version}`}
                >
                  {ref.subject}
                </Link>
              </ListItem>
            );
          })}
        </UnorderedList>
      ) : (
        <Text>This schema has no references.</Text>
      )}

      <Text data-testid="schema-referenced-by-heading" fontSize="lg" fontWeight="bold" mt="20">
        Referenced By
      </Text>
      <Text mb="6">
        Schemas that reference this version.
        {/* <Link as={ReactRouterLink} to="/home">Learn More</Link> */}
      </Text>

      {referencedByData && referencedByData.length > 0 ? (
        <UnorderedList data-testid="schema-referenced-by-list">
          {referencedByData
            .flatMap((x) => x.usages)
            .map((ref) => {
              // Referenced By data only contains subject names (not import strings),
              // so this section was already displaying correctly. However, we use
              // encodeURIComponentPercents() for consistent navigation behavior
              // with the References section above.
              return (
                <ListItem key={ref.subject + ref.version}>
                  <Link
                    as={ReactRouterLink}
                    data-testid={`schema-referenced-by-link-${ref.subject}`}
                    to={`/schema-registry/subjects/${encodeURIComponentPercents(ref.subject)}?version=${ref.version}`}
                  >
                    {ref.subject}
                  </Link>
                </ListItem>
              );
            })}
        </UnorderedList>
      ) : (
        <Text>This schema has no incoming references.</Text>
      )}
    </>
  );
};

export default SchemaDetailsView;
