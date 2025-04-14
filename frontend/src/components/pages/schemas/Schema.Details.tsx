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

import { createStandaloneToast } from '@redpanda-data/ui';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  CodeBlock,
  Divider,
  Flex,
  Grid,
  GridItem,
  ListItem,
  Skeleton,
  Tabs,
  UnorderedList,
  useToast,
} from '@redpanda-data/ui';
import { Text } from '@redpanda-data/ui';
import { Link } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { Link as ReactRouterLink } from 'react-router-dom';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import type { SchemaRegistrySubjectDetails, SchemaRegistryVersionedSchema } from '../../../state/restInterfaces';
import { uiState } from '../../../state/uiState';
import { editQuery } from '../../../utils/queryHelper';
import { Button, DefaultSkeleton, Label } from '../../../utils/tsxUtils';
import { decodeURIComponentPercents } from '../../../utils/utils';
import { KowlDiffEditor } from '../../misc/KowlEditor';
import PageContent from '../../misc/PageContent';
import { SingleSelect } from '../../misc/Select';
import { SmallStat } from '../../misc/SmallStat';
import { PageComponent } from '../Page';
import { openDeleteModal, openPermanentDeleteModal } from './modals';
const { ToastContainer, toast } = createStandaloneToast();

@observer
class SchemaDetailsView extends PageComponent<{ subjectName: string }> {
  subjectNameRaw: string;
  subjectNameEncoded: string;

  @observable version = 'latest' as 'latest' | number;

  initPage(): void {
    this.updateTitleAndBreadcrumbs();
    this.refreshData(false);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  constructor(p: any) {
    super(p);
    this.subjectNameRaw = decodeURIComponentPercents(this.props.subjectName);
    this.subjectNameEncoded = encodeURIComponent(this.subjectNameRaw);

    makeObservable(this);
  }

  componentDidUpdate(prevProps: { subjectName: string }) {
    if (!prevProps) return;

    const prevName = decodeURIComponentPercents(prevProps.subjectName);

    if (prevName !== this.subjectNameRaw) {
      this.updateTitleAndBreadcrumbs();
      this.refreshData();
    }
  }

  updateTitleAndBreadcrumbs() {
    const subjectNameRaw = decodeURIComponentPercents(this.props.subjectName);
    this.subjectNameRaw = subjectNameRaw;

    const version = getVersionFromQuery() ?? 'latest';
    editQuery((x) => {
      x.version = String(version);
    });

    uiState.pageTitle = subjectNameRaw;
    uiState.pageBreadcrumbs = [];
    uiState.pageBreadcrumbs.push({ title: 'Schema Registry', linkTo: '/schema-registry' });
    uiState.pageBreadcrumbs.push({
      title: subjectNameRaw,
      linkTo: `/schema-registry/${encodeURIComponent(subjectNameRaw)}?version=${version}`,
      options: {
        canBeTruncated: true,
        canBeCopied: true,
      },
    });
  }

  refreshData(force?: boolean) {
    api.refreshSchemaCompatibilityConfig(force);
    api.refreshSchemaMode(force);
    api.refreshSchemaSubjects(force);
    api.refreshSchemaTypes(force);

    const subjectName = decodeURIComponentPercents(this.props.subjectName);
    api.refreshSchemaDetails(subjectName, force).then(() => {
      const details = api.schemaDetails.get(subjectName);
      if (!details) return;

      for (const v of details.versions) {
        if (v.isSoftDeleted) continue;

        api.refreshSchemaReferencedBy(subjectName, v.version, force);
      }
    });
  }

  render() {
    const isSoftDeleted = api.schemaSubjects?.find((x) => x.name === this.subjectNameRaw)?.isSoftDeleted;
    const subject = api.schemaDetails.get(this.subjectNameRaw);
    if (!subject) return DefaultSkeleton;

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
            onClick={() =>
              appGlobal.history.push(`/schema-registry/subjects/${this.subjectNameEncoded}/edit-compatibility`)
            }
            disabledReason={
              api.userData?.canManageSchemaRegistry === false
                ? "You don't have the 'canManageSchemaRegistry' permission"
                : undefined
            }
          >
            Edit compatibility
          </Button>
          <Button
            variant="outline"
            onClick={() => appGlobal.history.push(`/schema-registry/subjects/${this.subjectNameEncoded}/add-version`)}
            disabledReason={
              api.userData?.canCreateSchemas === false ? "You don't have the 'canCreateSchemas' permission" : undefined
            }
          >
            Add new version
          </Button>
          <Button
            variant="outline"
            disabledReason={
              api.userData?.canDeleteSchemas === false ? "You don't have the 'canDeleteSchemas' permission" : undefined
            }
            onClick={() => {
              if (isSoftDeleted) {
                openPermanentDeleteModal(this.subjectNameRaw, () => {
                  api
                    .deleteSchemaSubject(this.subjectNameRaw, true)
                    .then(async () => {
                      toast({
                        status: 'success',
                        duration: 4000,
                        isClosable: false,
                        title: 'Subject permanently deleted',
                      });
                      api.refreshSchemaSubjects(true);
                      appGlobal.history.push('/schema-registry/');
                    })
                    .catch((err) => {
                      toast({
                        status: 'error',
                        duration: null,
                        isClosable: true,
                        title: 'Failed to permanently delete subject',
                        description: String(err),
                      });
                    });
                });
              } else {
                openDeleteModal(this.subjectNameRaw, () => {
                  api
                    .deleteSchemaSubject(this.subjectNameRaw, false)
                    .then(async () => {
                      toast({
                        status: 'success',
                        duration: 4000,
                        isClosable: false,
                        title: 'Subject soft-deleted',
                      });
                      api.refreshSchemaSubjects(true);
                    })
                    .catch((err) => {
                      toast({
                        status: 'error',
                        duration: null,
                        isClosable: true,
                        title: 'Failed to soft-delete subject',
                        description: String(err),
                      });
                    });
                });
              }
            }}
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
  }
}

function getVersionFromQuery(): 'latest' | number | undefined {
  const query = new URLSearchParams(window.location.search);
  if (query.has('version')) {
    const versionStr = query.get('version');

    if (versionStr !== '' && !Number.isNaN(Number(versionStr))) {
      return Number(versionStr);
    }

    if (versionStr === 'latest') return 'latest';

    console.log(`unknown version string in query: "${versionStr}" will be ignored, proceeding with "latest"`);
  }

  return undefined;
}

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

const SubjectDefinition = observer((p: { subject: SchemaRegistrySubjectDetails }) => {
  const toast = useToast();

  const subject = p.subject;

  const queryVersion = getVersionFromQuery();
  const defaultVersion =
    queryVersion && queryVersion !== 'latest'
      ? queryVersion
      : subject.latestActiveVersion === -1 // if we don't have a latestActiveVersion, use the last version there is
        ? subject.schemas.last()?.version
        : subject.latestActiveVersion;
  const [selectedVersion, setSelectedVersion] = useState(defaultVersion);

  const schema = subject.schemas.first((x) => x.version === selectedVersion);

  if (!schema) {
    if (selectedVersion !== defaultVersion) {
      setSelectedVersion(defaultVersion);
    }

    return null;
  }

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
                onChange={(value) => {
                  editQuery((x) => (x.version = String(value)));
                  setSelectedVersion(value);
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
            Schema ID: {schema.id}
          </Flex>

          {schema.isSoftDeleted ? (
            <>
              <Button
                variant="outline"
                ml="auto"
                disabledReason={
                  api.userData?.canDeleteSchemas === false
                    ? "You don't have the 'canDeleteSchemas' permission"
                    : undefined
                }
                onClick={() =>
                  openPermanentDeleteModal(`${subject.name} version ${schema.version}`, () => {
                    api
                      .deleteSchemaSubjectVersion(subject.name, schema.version, true)
                      .then(async () => {
                        toast({
                          status: 'success',
                          duration: 4000,
                          isClosable: false,
                          title: 'Schema version permanently deleted',
                        });

                        api.refreshSchemaSubjects(true);
                        await api.refreshSchemaDetails(subject.name, true);

                        const newDetails = api.schemaDetails.get(subject.name);
                        if (!newDetails || !newDetails.latestActiveVersion) {
                          appGlobal.history.push('/schema-registry/');
                        } else {
                          setSelectedVersion(newDetails.latestActiveVersion);
                        }
                      })
                      .catch((err) => {
                        toast({
                          status: 'error',
                          duration: null,
                          isClosable: true,
                          title: 'Failed to permanently delete schema version',
                          description: String(err),
                        });
                      });
                  })
                }
              >
                Permanent delete
              </Button>

              <Button
                variant="outline"
                disabledReason={
                  api.userData?.canCreateSchemas === false
                    ? "You don't have the 'canCreateSchemas' permission"
                    : undefined
                }
                onClick={() => {
                  api
                    .createSchema(subject.name, {
                      references: schema.references,
                      schema: schema.schema,
                      schemaType: schema.type,
                    })
                    .then(async (r) => {
                      toast({
                        status: 'success',
                        duration: 4000,
                        isClosable: false,
                        title: `Schema ${subject.name} ${schema.version} has been recovered`,
                        description: `Schema ID: ${r.id}`,
                      });
                      api.refreshSchemaSubjects(true);
                      await api.refreshSchemaDetails(subject.name, true);

                      const updatedDetails = api.schemaDetails.get(subject.name);
                      if (updatedDetails)
                        appGlobal.history.push(
                          `/schema-registry/subjects/${encodeURIComponent(subject.name)}?version=${updatedDetails.latestActiveVersion}`,
                        );
                    })
                    .catch((err) => {
                      toast({
                        status: 'error',
                        duration: null,
                        isClosable: true,
                        title: `Failed to recover schema ${subject.name} ${schema.version} `,
                        description: `Error: ${String(err)}`,
                      });
                    });
                }}
              >
                Recover
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                ml="auto"
                disabledReason={
                  api.userData?.canDeleteSchemas === false
                    ? "You don't have the 'canDeleteSchemas' permission"
                    : undefined
                }
                onClick={() =>
                  openDeleteModal(`${subject.name} version ${schema.version}`, () => {
                    api
                      .deleteSchemaSubjectVersion(subject.name, schema.version, false)
                      .then(() => {
                        toast({
                          status: 'success',
                          duration: 4000,
                          isClosable: false,
                          title: 'Schema version deleted',
                          description: 'You can recover or permanently delete it.',
                        });

                        api.refreshSchemaDetails(subject.name, true);
                        api.refreshSchemaSubjects(true);
                      })
                      .catch((err) => {
                        toast({
                          status: 'error',
                          duration: null,
                          isClosable: true,
                          title: 'Failed to delete schema version',
                          description: String(err),
                        });
                      });
                  })
                }
              >
                Delete
              </Button>
            </>
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
});

const VersionDiff = observer((p: { subject: SchemaRegistrySubjectDetails }) => {
  const subject = p.subject;

  const defaultVersionLeft = subject.versions[0].version;
  const defaultVersionRight = subject.latestActiveVersion === -1 ? defaultVersionLeft : subject.latestActiveVersion;

  const [selectedVersionLeft, setSelectedVersionLeft] = useState(defaultVersionLeft);
  const [selectedVersionRight, setSelectedVersionRight] = useState(defaultVersionRight);

  const schemaLeft = subject.schemas.first((x) => x.version === selectedVersionLeft);
  const schemaRight = subject.schemas.first((x) => x.version === selectedVersionRight);

  if (!schemaLeft) {
    setSelectedVersionLeft(subject.versions[0].version);
    return null;
  }
  if (!schemaRight) {
    setSelectedVersionLeft(subject.versions[0].version);
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
});

const SchemaReferences = observer(
  (p: { subject: SchemaRegistrySubjectDetails; schema: SchemaRegistryVersionedSchema }) => {
    const { subject, schema } = p;
    const version = schema.version;

    const referencedByVersions = api.schemaReferencedBy.get(subject.name);
    const referencedBy = referencedByVersions?.get(version);

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
              return (
                <ListItem key={ref.name + ref.subject + ref.version}>
                  <Link
                    as={ReactRouterLink}
                    to={`/schema-registry/subjects/${encodeURIComponent(ref.subject)}?version=${ref.version}`}
                  >
                    {ref.name}
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

        {!referencedBy ? (
          <Flex gap="2" direction="column">
            <Skeleton height="20px" />
            <Skeleton height="20px" />
          </Flex>
        ) : referencedBy.length > 0 ? (
          <UnorderedList>
            {referencedBy
              .flatMap((x) => x.usages)
              .map((ref) => {
                return (
                  <ListItem key={ref.subject + ref.version}>
                    <Link
                      as={ReactRouterLink}
                      to={`/schema-registry/subjects/${encodeURIComponent(ref.subject)}?version=${ref.version}`}
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
  },
);

export default SchemaDetailsView;
