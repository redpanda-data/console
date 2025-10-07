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
import { SchemaRegistryCapability } from '../../../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { useGetIdentityQuery } from '../../../react-query/api/authentication';
import {
  useCreateSchemaMutation,
  useDeleteSchemaMutation,
  useDeleteSchemaVersionMutation,
  useListSchemasQuery,
  useSchemaCompatibilityQuery,
  useSchemaDetailsQuery,
  useSchemaModeQuery,
  useSchemaReferencedByQuery,
  useSchemaTypesQuery,
} from '../../../react-query/api/schema';
import type { SchemaRegistrySubjectDetails, SchemaRegistryVersionedSchema } from '../../../state/restInterfaces';
import { uiState } from '../../../state/uiState';
import { Button, DefaultSkeleton, Label } from '../../../utils/tsxUtils';
import { decodeURIComponentPercents, encodeURIComponentPercents } from '../../../utils/utils';
import { KowlDiffEditor } from '../../misc/KowlEditor';
import PageContent from '../../misc/PageContent';
import { SingleSelect } from '../../misc/Select';
import { SmallStat } from '../../misc/SmallStat';
import { openDeleteModal, openPermanentDeleteModal } from './modals';

const { ToastContainer, toast } = createStandaloneToast();

const SchemaDetailsView: React.FC<{ subjectName?: string }> = ({ subjectName: subjectNameProp }) => {
  const { subjectName: subjectNameParam } = useParams<{ subjectName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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

  const deleteSubjectMutation = useDeleteSchemaMutation();

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
        },
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
      <Flex gap="1rem" alignItems="center">
        <SmallStat title="Format">{subject.type}</SmallStat>
        <Divider height="2ch" orientation="vertical" />

        <SmallStat title="Compatibility">{subject.compatibility}</SmallStat>
        <Divider height="2ch" orientation="vertical" />

        <SmallStat title="Active Versions">{subject.schemas.count((x) => !x.isSoftDeleted)}</SmallStat>
      </Flex>

      {/* Buttons */}
      <Flex gap="2">
        <Button
          variant="outline"
          onClick={() => navigate(`/schema-registry/subjects/${subjectNameEncoded}/edit-compatibility`)}
          disabledReason={
            canManageSchemaRegistry === false ? "You don't have the 'canManageSchemaRegistry' permission" : undefined
          }
        >
          Edit compatibility
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate(`/schema-registry/subjects/${subjectNameEncoded}/add-version`)}
          disabledReason={canCreateSchemas === false ? "You don't have the 'canCreateSchemas' permission" : undefined}
        >
          Add new version
        </Button>
        <Button
          variant="outline"
          disabledReason={canDeleteSchemas === false ? "You don't have the 'canDeleteSchemas' permission" : undefined}
          onClick={() => handleDeleteSubject(isSoftDeleted || false)}
        >
          Delete subject
        </Button>
      </Flex>

      {/* Definition / Diff */}
      <Tabs
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
  if (lower === 'avro' || lower === 'json') return JSON.stringify(JSON.parse(schema.schema), undefined, 4);
  return schema.schema;
}

const SubjectDefinition = (p: { subject: SchemaRegistrySubjectDetails }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const subject = p.subject;

  const { data: userData } = useGetIdentityQuery();
  const deleteVersionMutation = useDeleteSchemaVersionMutation();
  const createSchemaMutation = useCreateSchemaMutation();

  const queryVersion = searchParams.get('version');
  const versionNumber =
    queryVersion && queryVersion !== 'latest' && !Number.isNaN(Number(queryVersion)) ? Number(queryVersion) : null;

  // Determine fallback version when no specific version is requested
  const fallbackVersion =
    subject.latestActiveVersion === -1 ? subject.schemas.last()?.version : subject.latestActiveVersion;

  // Check if requested version exists in available schemas
  const requestedVersionExists = versionNumber ? subject.schemas.some((s) => s.version === versionNumber) : true;

  // Use URL parameter if provided and exists, otherwise fall back to latest active version
  const defaultVersion =
    versionNumber && requestedVersionExists ? versionNumber : (fallbackVersion ?? subject.versions[0]?.version ?? 1);
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

  const schema = subject.schemas.first((x) => x.version === selectedVersion);

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
    openPermanentDeleteModal(`${subject.name} version ${schema.version}`, () => {
      deleteVersionMutation.mutate(
        { subjectName: subject.name, version: schema.version, permanent: true },
        {
          onSuccess: async () => {
            toast({
              status: 'success',
              duration: 4000,
              isClosable: false,
              title: 'Schema version permanently deleted',
            });

            // Invalidate and refetch to get updated details
            await queryClient.invalidateQueries({ queryKey: ['schemaRegistry', 'subjects', subject.name, 'details'] });
            const newDetails = queryClient.getQueryData<SchemaRegistrySubjectDetails>([
              'schemaRegistry',
              'subjects',
              subject.name,
              'details',
            ]);

            if (!newDetails || !newDetails.latestActiveVersion) {
              navigate('/schema-registry/');
            } else {
              setSelectedVersion(newDetails.latestActiveVersion);
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
        },
      );
    });
  };

  const handleRecover = () => {
    createSchemaMutation.mutate(
      {
        subjectName: subject.name,
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
            title: `Schema ${subject.name} ${schema.version} has been recovered`,
            description: `Schema ID: ${result.id}`,
          });

          // Navigate to the latest active version after recovery
          navigate(`/schema-registry/subjects/${encodeURIComponent(subject.name)}?version=latest`);
        },
        onError: (err) => {
          toast({
            status: 'error',
            duration: null,
            isClosable: true,
            title: `Failed to recover schema ${subject.name} ${schema.version}`,
            description: `Error: ${String(err)}`,
          });
        },
      },
    );
  };

  const handleSoftDelete = () => {
    openDeleteModal(`${subject.name} version ${schema.version}`, () => {
      deleteVersionMutation.mutate(
        { subjectName: subject.name, version: schema.version, permanent: false },
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
        },
      );
    });
  };

  return (
    <Flex gap="10">
      {/* Left Side */}
      <Flex direction="column" gap="4" flexGrow="1" minWidth="0">
        {/* Version Select / Delete / Recover */}
        <Flex gap="2" alignItems="flex-end">
          <Label text="Version">
            <Box width="200px">
              <SingleSelect
                value={selectedVersion}
                onChange={handleVersionChange}
                options={subject.versions.map((v) => ({
                  value: v.version,
                  label:
                    String(v.version) +
                    (v.isSoftDeleted ? ' (soft-deleted)' : '') +
                    (subject.versions[subject.versions.length - 1] === v ? ' (latest)' : ''),
                }))}
                isDisabled={subject.versions.length === 0}
              />
            </Box>
          </Label>
          <Flex height="36px" alignItems="center" ml="4">
            Schema ID: {schema.id}
          </Flex>

          {schema.isSoftDeleted ? (
            <>
              <Button
                variant="outline"
                ml="auto"
                disabledReason={
                  canDeleteSchemas === false ? "You don't have the 'canDeleteSchemas' permission" : undefined
                }
                onClick={handlePermanentDelete}
              >
                Permanent delete
              </Button>

              <Button
                variant="outline"
                disabledReason={
                  canCreateSchemas === false ? "You don't have the 'canCreateSchemas' permission" : undefined
                }
                onClick={handleRecover}
              >
                Recover
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              ml="auto"
              disabledReason={
                canDeleteSchemas === false ? "You don't have the 'canDeleteSchemas' permission" : undefined
              }
              onClick={handleSoftDelete}
            >
              Delete
            </Button>
          )}
        </Flex>

        {/* Deleted Hint */}
        {schema.isSoftDeleted && (
          <Alert status="warning" variant="left-accent">
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
          language={schemaTypeToCodeBlockLanguage(schema.type)}
          theme="light"
          showLineNumbers
          showCopyButton={false}
        />
      </Flex>

      {/* References Box */}
      <Box>
        <SchemaReferences subject={subject} schema={schema} />
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

  if (!schemaLeft || !schemaRight) {
    return null;
  }

  return (
    <Flex direction="column" gap="10">
      {/* Two version selectors */}
      <Grid templateColumns="repeat(2, 1fr)" gap="4" minWidth="0" width="100%">
        <GridItem w="100%">
          {/* Version Select / Delete / Recover */}
          <Flex gap="2" alignItems="flex-end">
            <Label text="Version">
              <Box width="200px">
                <SingleSelect
                  value={selectedVersionLeft}
                  onChange={(value) => {
                    setSelectedVersionLeft(value);
                  }}
                  options={subject.versions.map((v) => ({
                    value: v.version,
                    label:
                      String(v.version) +
                      (v.isSoftDeleted ? ' (soft-deleted)' : '') +
                      (subject.versions[subject.versions.length - 1] === v ? ' (latest)' : ''),
                  }))}
                  isDisabled={subject.versions.length === 0}
                />
              </Box>
            </Label>
            <Flex height="36px" alignItems="center" ml="4">
              Schema ID: {schemaLeft.id}
            </Flex>
          </Flex>
        </GridItem>

        <GridItem w="100%">
          {/* Version Select / Delete / Recover */}
          <Flex gap="2" alignItems="flex-end">
            <Label text="Version">
              <Box width="200px">
                <SingleSelect
                  value={selectedVersionRight}
                  onChange={(value) => {
                    setSelectedVersionRight(value);
                  }}
                  options={subject.versions.map((v) => ({
                    value: v.version,
                    label:
                      String(v.version) +
                      (v.isSoftDeleted ? ' (soft-deleted)' : '') +
                      (subject.versions[subject.versions.length - 1] === v ? ' (latest)' : ''),
                  }))}
                  isDisabled={subject.versions.length === 0}
                />
              </Box>
            </Label>
            <Flex height="36px" alignItems="center" ml="4">
              Schema ID: {schemaRight.id}
            </Flex>
          </Flex>
        </GridItem>
      </Grid>

      {/* Diff View */}
      <KowlDiffEditor
        height="800px"
        language={schemaTypeToCodeBlockLanguage(schemaLeft.type)}
        original={getFormattedSchemaText(schemaLeft)}
        modified={getFormattedSchemaText(schemaRight)}
        options={{
          readOnly: true,
        }}
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
      <Text mt="20" fontSize="lg" fontWeight="bold">
        References
      </Text>
      <Text mb="6">
        Schemas that are required by this version.
        {/* <Link as={ReactRouterLink} to="/home">Learn More</Link> */}
      </Text>

      {schema.references.length > 0 ? (
        <UnorderedList>
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

      <Text mt="20" fontSize="lg" fontWeight="bold">
        Referenced By
      </Text>
      <Text mb="6">
        Schemas that reference this version.
        {/* <Link as={ReactRouterLink} to="/home">Learn More</Link> */}
      </Text>

      {referencedByData && referencedByData.length > 0 ? (
        <UnorderedList>
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
