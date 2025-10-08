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
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { Link as ReactRouterLink } from 'react-router-dom';

import { openDeleteModal, openPermanentDeleteModal } from './modals';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import type { SchemaRegistrySubjectDetails, SchemaRegistryVersionedSchema } from '../../../state/rest-interfaces';
import { uiState } from '../../../state/ui-state';
import { editQuery } from '../../../utils/query-helper';
import { Button, DefaultSkeleton, Label } from '../../../utils/tsx-utils';
import { decodeURIComponentPercents, encodeURIComponentPercents } from '../../../utils/utils';
import { KowlDiffEditor } from '../../misc/kowl-editor';
import PageContent from '../../misc/page-content';
import { SingleSelect } from '../../misc/select';
import { SmallStat } from '../../misc/small-stat';
import { PageComponent, type PageProps } from '../page';

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

  constructor(p: Readonly<PageProps<{ subjectName: string }>>) {
    super(p);
    this.subjectNameRaw = decodeURIComponentPercents(this.props.subjectName);
    this.subjectNameEncoded = encodeURIComponent(this.subjectNameRaw);

    makeObservable(this);
  }

  componentDidUpdate(prevProps: { subjectName: string }) {
    if (!prevProps) {
      return;
    }

    const prevName = decodeURIComponentPercents(prevProps.subjectName);
    const currentName = decodeURIComponentPercents(this.props.subjectName);
    const prevVersion = getVersionFromQuery();
    const currentVersion = getVersionFromQuery();

    if (prevName !== currentName || prevVersion !== currentVersion) {
      this.subjectNameRaw = currentName;
      this.subjectNameEncoded = encodeURIComponent(currentName);
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
    api.refreshSchemaCompatibilityConfig();
    api.refreshSchemaMode();
    api.refreshSchemaSubjects(force);
    api.refreshSchemaTypes(force);

    const subjectName = decodeURIComponentPercents(this.props.subjectName);
    api.refreshSchemaDetails(subjectName, force).then(() => {
      const details = api.schemaDetails.get(subjectName);
      if (!details) {
        return;
      }

      for (const v of details.versions) {
        if (v.isSoftDeleted) {
          continue;
        }

        api.refreshSchemaReferencedBy(subjectName, v.version, force);
      }
    });
  }

  render() {
    const isSoftDeleted = api.schemaSubjects?.find((x) => x.name === this.subjectNameRaw)?.isSoftDeleted;
    const subject = api.schemaDetails.get(this.subjectNameRaw);
    if (!subject) {
      return DefaultSkeleton;
    }

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
            disabledReason={
              api.userData?.canManageSchemaRegistry === false
                ? "You don't have the 'canManageSchemaRegistry' permission"
                : undefined
            }
            onClick={() =>
              appGlobal.historyPush(`/schema-registry/subjects/${this.subjectNameEncoded}/edit-compatibility`)
            }
            variant="outline"
          >
            Edit compatibility
          </Button>
          <Button
            disabledReason={
              api.userData?.canCreateSchemas === false ? "You don't have the 'canCreateSchemas' permission" : undefined
            }
            onClick={() => appGlobal.historyPush(`/schema-registry/subjects/${this.subjectNameEncoded}/add-version`)}
            variant="outline"
          >
            Add new version
          </Button>
          <Button
            disabledReason={
              api.userData?.canDeleteSchemas === false ? "You don't have the 'canDeleteSchemas' permission" : undefined
            }
            onClick={() => {
              if (isSoftDeleted) {
                openPermanentDeleteModal(this.subjectNameRaw, () => {
                  api
                    .deleteSchemaSubject(this.subjectNameRaw, true)
                    .then(() => {
                      toast({
                        status: 'success',
                        duration: 4000,
                        isClosable: false,
                        title: 'Subject permanently deleted',
                      });
                      api.refreshSchemaSubjects(true);
                      appGlobal.historyPush('/schema-registry/');
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
                    .then(() => {
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
            variant="outline"
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

    if (versionStr === 'latest') {
      return 'latest';
    }

    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.log(`unknown version string in query: "${versionStr}" will be ignored, proceeding with "latest"`);
  }

  return;
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
  if (lower === 'avro' || lower === 'json') {
    return JSON.stringify(JSON.parse(schema.schema), undefined, 4);
  }
  return schema.schema;
}

const SubjectDefinition = observer((p: { subject: SchemaRegistrySubjectDetails }) => {
  const toastFn = useToast();

  const subject = p.subject;

  const queryVersion = getVersionFromQuery();

  // Determine fallback version when no specific version is requested
  const fallbackVersion =
    subject.latestActiveVersion === -1 ? subject.schemas.last()?.version : subject.latestActiveVersion;

  // Check if requested version exists in available schemas
  const requestedVersionExists =
    queryVersion !== undefined && queryVersion !== 'latest'
      ? subject.schemas.some((s) => s.version === queryVersion)
      : true;

  // Use URL parameter if provided and exists, otherwise fall back to latest active version
  const defaultVersion = (() => {
    if (queryVersion === undefined) {
      return fallbackVersion;
    }
    if (queryVersion === 'latest' || !requestedVersionExists) {
      return fallbackVersion;
    }
    return queryVersion;
  })();
  const [selectedVersion, setSelectedVersion] = useState(defaultVersion);

  // Show notification and update URL if requested version doesn't exist
  if (queryVersion !== undefined && queryVersion !== 'latest' && !requestedVersionExists) {
    toastFn({
      status: 'warning',
      title: `Version ${queryVersion} not found`,
      description: `Showing version ${fallbackVersion} instead`,
      duration: 5000,
      isClosable: true,
    });
    // Update URL to reflect the actual version being shown
    editQuery((x) => (x.version = String(fallbackVersion)));
  }

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
      <Flex direction="column" flexGrow="1" gap="4" minWidth="0">
        {/* Version Select / Delete / Recover */}
        <Flex alignItems="flex-end" gap="2">
          <Label text="Version">
            <Box width="200px">
              <SingleSelect
                isDisabled={subject.versions.length === 0}
                onChange={(value) => {
                  editQuery((x) => (x.version = String(value)));
                  setSelectedVersion(value);
                }}
                options={subject.versions.map((v) => ({
                  value: v.version,
                  label:
                    String(v.version) +
                    (v.isSoftDeleted ? ' (soft-deleted)' : '') +
                    (subject.versions.at(-1) === v ? ' (latest)' : ''),
                }))}
                value={selectedVersion}
              />
            </Box>
          </Label>
          <Flex alignItems="center" height="36px" ml="4">
            Schema ID: {schema.id}
          </Flex>

          {schema.isSoftDeleted ? (
            <>
              <Button
                disabledReason={
                  api.userData?.canDeleteSchemas === false
                    ? "You don't have the 'canDeleteSchemas' permission"
                    : undefined
                }
                ml="auto"
                onClick={() =>
                  openPermanentDeleteModal(`${subject.name} version ${schema.version}`, () => {
                    api
                      .deleteSchemaSubjectVersion(subject.name, schema.version, true)
                      .then(async () => {
                        toastFn({
                          status: 'success',
                          duration: 4000,
                          isClosable: false,
                          title: 'Schema version permanently deleted',
                        });

                        api.refreshSchemaSubjects(true);
                        await api.refreshSchemaDetails(subject.name, true);

                        const newDetails = api.schemaDetails.get(subject.name);
                        if (newDetails?.latestActiveVersion) {
                          setSelectedVersion(newDetails.latestActiveVersion);
                        } else {
                          appGlobal.historyPush('/schema-registry/');
                        }
                      })
                      .catch((err) => {
                        toastFn({
                          status: 'error',
                          duration: null,
                          isClosable: true,
                          title: 'Failed to permanently delete schema version',
                          description: String(err),
                        });
                      });
                  })
                }
                variant="outline"
              >
                Permanent delete
              </Button>

              <Button
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
                      toastFn({
                        status: 'success',
                        duration: 4000,
                        isClosable: false,
                        title: `Schema ${subject.name} ${schema.version} has been recovered`,
                        description: `Schema ID: ${r.id}`,
                      });
                      api.refreshSchemaSubjects(true);
                      await api.refreshSchemaDetails(subject.name, true);

                      const updatedDetails = api.schemaDetails.get(subject.name);
                      if (updatedDetails) {
                        appGlobal.historyPush(
                          `/schema-registry/subjects/${encodeURIComponent(subject.name)}?version=${updatedDetails.latestActiveVersion}`
                        );
                      }
                    })
                    .catch((err) => {
                      toastFn({
                        status: 'error',
                        duration: null,
                        isClosable: true,
                        title: `Failed to recover schema ${subject.name} ${schema.version} `,
                        description: `Error: ${String(err)}`,
                      });
                    });
                }}
                variant="outline"
              >
                Recover
              </Button>
            </>
          ) : (
            <Button
              disabledReason={
                api.userData?.canDeleteSchemas === false
                  ? "You don't have the 'canDeleteSchemas' permission"
                  : undefined
              }
              ml="auto"
              onClick={() =>
                openDeleteModal(`${subject.name} version ${schema.version}`, () => {
                  api
                    .deleteSchemaSubjectVersion(subject.name, schema.version, false)
                    .then(() => {
                      toastFn({
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
                      toastFn({
                        status: 'error',
                        duration: null,
                        isClosable: true,
                        title: 'Failed to delete schema version',
                        description: String(err),
                      });
                    });
                })
              }
              variant="outline"
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
          showCopyButton={false}
          showLineNumbers
          theme="light"
        />
      </Flex>

      {/* References Box */}
      <Box>
        <SchemaReferences schema={schema} subject={subject} />
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
      <Grid gap="4" minWidth="0" templateColumns="repeat(2, 1fr)" width="100%">
        <GridItem w="100%">
          {/* Version Select / Delete / Recover */}
          <Flex alignItems="flex-end" gap="2">
            <Label text="Version">
              <Box width="200px">
                <SingleSelect
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
            <Flex alignItems="center" height="36px" ml="4">
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
            <Flex alignItems="center" height="36px" ml="4">
              Schema ID: {schemaRight.id}
            </Flex>
          </Flex>
        </GridItem>
      </Grid>

      {/* Diff View */}
      <KowlDiffEditor
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
});

const SchemaReferences = observer(
  (p: { subject: SchemaRegistrySubjectDetails; schema: SchemaRegistryVersionedSchema }) => {
    const { subject, schema } = p;
    const version = schema.version;

    const referencedByVersions = api.schemaReferencedBy.get(subject.name);
    const referencedBy = referencedByVersions?.get(version);

    return (
      <>
        <Text fontSize="lg" fontWeight="bold" mt="20">
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

        <Text fontSize="lg" fontWeight="bold" mt="20">
          Referenced By
        </Text>
        <Text mb="6">
          Schemas that reference this version.
          {/* <Link as={ReactRouterLink} to="/home">Learn More</Link> */}
        </Text>

        {!!referencedBy && referencedBy?.length > 0 ? (
          <UnorderedList>
            {referencedBy
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
  }
);

export default SchemaDetailsView;
