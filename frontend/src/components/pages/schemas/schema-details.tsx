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

'use no memo';

import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { EditIcon } from 'components/icons';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Skeleton, SkeletonGroup } from 'components/redpanda-ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';

const routeApi = getRouteApi('/schema-registry/subjects/$subjectName/');

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DeleteDialog, PermanentDeleteDialog } from './modals';
import { parseSubjectContext } from './schema-context-utils';
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
import { Label } from '../../../utils/tsx-utils';
import { decodeURIComponentPercents, encodeURIComponentPercents } from '../../../utils/utils';
import { KowlDiffEditor } from '../../misc/kowl-editor';
import PageContent from '../../misc/page-content';
import { SingleSelect } from '../../misc/select';
import { SmallStat } from '../../misc/small-stat';

const SchemaDetailsView: React.FC<{ subjectName: string }> = ({ subjectName: subjectNameProp }) => {
  const { subjectName: subjectNameParam } = routeApi.useParams();
  const navigate = useNavigate({ from: '/schema-registry/subjects/$subjectName/' });
  const search = routeApi.useSearch();

  // Use prop if provided (for routing), otherwise use URL param
  const subjectNameRaw = decodeURIComponentPercents(subjectNameProp || subjectNameParam || '');
  const subjectNameEncoded = encodeURIComponent(subjectNameRaw);

  const versionParam = search.version;
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
  const [subjectDeleteKind, setSubjectDeleteKind] = useState<'soft' | 'permanent' | null>(null);

  type UserDataType = NonNullable<typeof userData>;

  // Update page title and breadcrumbs
  useEffect(() => {
    const parsed = parseSubjectContext(subjectNameRaw);
    uiState.pageTitle = subjectNameRaw;
    uiState.pageBreadcrumbs = [
      { title: 'Schema Registry', linkTo: '/schema-registry' },
      {
        title: subjectNameRaw,
        titleNode:
          parsed.context !== 'default' ? (
            <>
              <span className="text-gray-400">:.{parsed.context}:</span>
              {parsed.displayName}
            </>
          ) : undefined,
        linkTo: `/schema-registry/${encodeURIComponent(subjectNameRaw)}?version=${version}`,
        options: {
          canBeTruncated: true,
          canBeCopied: true,
        },
      },
    ];
  }, [subjectNameRaw, version]);

  // Set version in query params if not present
  useEffect(() => {
    if (!search.version) {
      navigate({ search: { version: 'latest' }, replace: true });
    }
  }, [search.version, navigate]);

  if (isLoadingSubject || !subject) {
    return (
      <PageContent>
        <SkeletonGroup direction="vertical" spacing="lg">
          <Skeleton variant="heading" width="lg" />
          <Skeleton variant="text" width="full" />
          <Skeleton size="xl" width="full" />
        </SkeletonGroup>
      </PageContent>
    );
  }

  const isSoftDeleted = schemaSubjects?.find((x) => x.name === subjectNameRaw)?.isSoftDeleted;

  const canManageSchemaRegistry = (userData as UserDataType | undefined)?.permissions?.schemaRegistry?.includes(
    SchemaRegistryCapability.WRITE
  );
  const canCreateSchemas = (userData as UserDataType | undefined)?.permissions?.schemaRegistry?.includes(
    SchemaRegistryCapability.WRITE
  );
  const canDeleteSchemas = (userData as UserDataType | undefined)?.permissions?.schemaRegistry?.includes(
    SchemaRegistryCapability.DELETE
  );

  const handleDeleteSubject = (permanent: boolean) => {
    setSubjectDeleteKind(permanent ? 'permanent' : 'soft');
  };

  const executeDeleteSubject = (permanent: boolean) => {
    deleteSubjectMutation.mutate(
      { subjectName: subjectNameRaw, permanent },
      {
        onSuccess: () => {
          toast.success(permanent ? 'Subject permanently deleted' : 'Subject soft-deleted');
          if (permanent) {
            navigate({ to: '/schema-registry' });
          }
        },
        onError: (err) => {
          toast.error(permanent ? 'Failed to permanently delete subject' : 'Failed to soft-delete subject', {
            description: String(err),
          });
        },
      }
    );
  };

  return (
    <PageContent key="b">
      {/* Statistics Bar */}
      <div className="flex items-center gap-4">
        <SmallStat title="Format">{subject.type}</SmallStat>
        <Separator className="h-[2ch]" orientation="vertical" />

        <SmallStat title="Mode">
          <div className="flex items-center gap-1">
            {subject.mode}
            {canManageSchemaRegistry !== false && (
              <Button
                data-testid="schema-details-edit-mode-icon"
                onClick={() =>
                  navigate({
                    to: '/schema-registry/subjects/$subjectName/edit-mode',
                    params: { subjectName: subjectNameEncoded },
                  })
                }
                size="icon-xs"
                variant="secondary-ghost"
              >
                <EditIcon />
              </Button>
            )}
          </div>
        </SmallStat>
        <Separator className="h-[2ch]" orientation="vertical" />

        <SmallStat title="Compatibility">
          <div className="flex items-center gap-1">
            {subject.compatibility}
            {canManageSchemaRegistry !== false && (
              <Button
                data-testid="schema-details-edit-compatibility-icon"
                onClick={() =>
                  navigate({
                    to: '/schema-registry/subjects/$subjectName/edit-compatibility',
                    params: { subjectName: subjectNameEncoded },
                  })
                }
                size="icon-xs"
                variant="secondary-ghost"
              >
                <EditIcon />
              </Button>
            )}
          </div>
        </SmallStat>
        <Separator className="h-[2ch]" orientation="vertical" />

        <SmallStat title="Active Versions">
          {subject.schemas.count((x: { isSoftDeleted?: boolean }) => !x.isSoftDeleted)}
        </SmallStat>
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="schema-details-add-version-btn"
              disabled={canCreateSchemas === false}
              onClick={() =>
                navigate({
                  to: '/schema-registry/subjects/$subjectName/add-version',
                  params: { subjectName: subjectNameEncoded },
                })
              }
              variant="outline"
            >
              Add new version
            </Button>
          </TooltipTrigger>
          {canCreateSchemas === false && (
            <TooltipContent side="top">You don't have the 'canCreateSchemas' permission</TooltipContent>
          )}
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="schema-details-delete-subject-btn"
              disabled={canDeleteSchemas === false}
              onClick={() => handleDeleteSubject(isSoftDeleted ?? false)}
              variant="outline"
            >
              Delete subject
            </Button>
          </TooltipTrigger>
          {canDeleteSchemas === false && (
            <TooltipContent side="top">You don't have the 'canDeleteSchemas' permission</TooltipContent>
          )}
        </Tooltip>
      </div>

      {/* Definition / Diff */}
      <Tabs data-testid="schema-details-tabs" defaultValue="definition">
        <TabsList variant="underline">
          <TabsTrigger value="definition">Definition</TabsTrigger>
          <TabsTrigger value="diff">Version diff</TabsTrigger>
        </TabsList>
        <TabsContent value="definition">
          <SubjectDefinition subject={subject} />
        </TabsContent>
        <TabsContent value="diff">
          <VersionDiff subject={subject} />
        </TabsContent>
      </Tabs>

      <DeleteDialog
        onConfirm={() => executeDeleteSubject(false)}
        onOpenChange={(open) => {
          if (!open) setSubjectDeleteKind(null);
        }}
        open={subjectDeleteKind === 'soft'}
        schemaVersionName={subjectNameRaw}
      />
      <PermanentDeleteDialog
        onConfirm={() => executeDeleteSubject(true)}
        onOpenChange={(open) => {
          if (!open) setSubjectDeleteKind(null);
        }}
        open={subjectDeleteKind === 'permanent'}
        schemaVersionName={subjectNameRaw}
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
  const navigate = useNavigate({ from: '/schema-registry/subjects/$subjectName/' });
  const search = routeApi.useSearch();
  const queryClient = useQueryClient();

  const subjectData = p.subject;

  const { data: userData } = useGetIdentityQuery();
  const deleteVersionMutation = useDeleteSchemaVersionMutation();
  const createSchemaMutation = useCreateSchemaMutation();

  type UserDataType = NonNullable<typeof userData>;

  const queryVersion = search.version;
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
  const [versionDeleteKind, setVersionDeleteKind] = useState<'soft' | 'permanent' | null>(null);

  // Show notification and update URL if requested version doesn't exist
  useEffect(() => {
    if (versionNumber && !requestedVersionExists) {
      toast.warning(`Version ${versionNumber} not found`, {
        description: `Showing version ${fallbackVersion} instead`,
      });
      navigate({ search: { version: String(fallbackVersion) }, replace: true });
    }
  }, [versionNumber, requestedVersionExists, fallbackVersion, navigate]);

  // When URL is "latest", sync selectedVersion with the actual latest version from data
  if (queryVersion === 'latest' && fallbackVersion && selectedVersion !== fallbackVersion) {
    setSelectedVersion(fallbackVersion);
  }

  const schema = subjectData.schemas.first((x) => x.version === selectedVersion);

  if (!schema && selectedVersion !== defaultVersion) {
    setSelectedVersion(defaultVersion);
  }

  if (!schema) {
    return null;
  }

  const canCreateSchemas = (userData as UserDataType | undefined)?.permissions?.schemaRegistry?.includes(
    SchemaRegistryCapability.WRITE
  );
  const canDeleteSchemas = (userData as UserDataType | undefined)?.permissions?.schemaRegistry?.includes(
    SchemaRegistryCapability.DELETE
  );

  const handleVersionChange = (value: number) => {
    navigate({ search: { version: String(value) } });
    setSelectedVersion(value);
  };

  const handlePermanentDelete = () => {
    setVersionDeleteKind('permanent');
  };

  const executePermanentDelete = () => {
    deleteVersionMutation.mutate(
      { subjectName: subjectData.name, version: schema.version, permanent: true },
      {
        onSuccess: async () => {
          toast.success('Schema version permanently deleted');

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
            navigate({ to: '/schema-registry' });
          }
        },
        onError: (err) => {
          toast.error('Failed to permanently delete schema version', { description: String(err) });
        },
      }
    );
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
          toast.success(`Schema ${subjectData.name} ${schema.version} has been recovered`, {
            description: `Schema ID: ${result.id}`,
          });

          // Navigate to the latest active version after recovery
          navigate({
            to: '/schema-registry/subjects/$subjectName',
            params: { subjectName: encodeURIComponent(subjectData.name) },
            search: { version: 'latest' },
          });
        },
        onError: (err) => {
          toast.error(`Failed to recover schema ${subjectData.name} ${schema.version}`, {
            description: String(err),
          });
        },
      }
    );
  };

  const handleSoftDelete = () => {
    setVersionDeleteKind('soft');
  };

  const executeSoftDelete = () => {
    deleteVersionMutation.mutate(
      { subjectName: subjectData.name, version: schema.version, permanent: false },
      {
        onSuccess: () => {
          toast.success('Schema version deleted', { description: 'You can recover or permanently delete it.' });
        },
        onError: (err) => {
          toast.error('Failed to delete schema version', { description: String(err) });
        },
      }
    );
  };

  return (
    <div className="flex gap-10">
      {/* Left Side */}
      <div className="flex min-w-0 grow flex-col gap-4">
        {/* Version Select / Delete / Recover */}
        <div className="flex items-end gap-2">
          <Label text="Version">
            <div className="w-[200px]">
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
            </div>
          </Label>
          <div className="ml-4 flex h-9 items-center" data-testid="schema-definition-schema-id">
            Schema ID: {schema.id}
          </div>

          {schema.isSoftDeleted ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="ml-auto"
                    data-testid="schema-definition-permanent-delete-btn"
                    disabled={canDeleteSchemas === false}
                    onClick={handlePermanentDelete}
                    variant="outline"
                  >
                    Permanent delete
                  </Button>
                </TooltipTrigger>
                {canDeleteSchemas === false && (
                  <TooltipContent side="top">You don't have the 'canDeleteSchemas' permission</TooltipContent>
                )}
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    data-testid="schema-definition-recover-btn"
                    disabled={canCreateSchemas === false}
                    onClick={handleRecover}
                    variant="outline"
                  >
                    Recover
                  </Button>
                </TooltipTrigger>
                {canCreateSchemas === false && (
                  <TooltipContent side="top">You don't have the 'canCreateSchemas' permission</TooltipContent>
                )}
              </Tooltip>
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="ml-auto"
                  data-testid="schema-definition-delete-version-btn"
                  disabled={canDeleteSchemas === false}
                  onClick={handleSoftDelete}
                  variant="outline"
                >
                  Delete
                </Button>
              </TooltipTrigger>
              {canDeleteSchemas === false && (
                <TooltipContent side="top">You don't have the 'canDeleteSchemas' permission</TooltipContent>
              )}
            </Tooltip>
          )}
        </div>

        {/* Deleted Hint */}
        {Boolean(schema.isSoftDeleted) && (
          <Alert data-testid="schema-definition-soft-deleted-alert" variant="warning">
            <AlertTitle>Soft-deleted schema</AlertTitle>
            <AlertDescription>
              This schema has been soft-deleted. It is still required by other schemas. It remains readable.
            </AlertDescription>
          </Alert>
        )}

        {/* Code Block */}
        <DynamicCodeBlock
          code={getFormattedSchemaText(schema)}
          lang={schemaTypeToCodeBlockLanguage(schema.type)}
          testId="schema-definition-code-block"
        />
      </div>

      {/* References Box */}
      <div>
        <SchemaReferences schema={schema} subject={subjectData} />
      </div>

      <DeleteDialog
        onConfirm={executeSoftDelete}
        onOpenChange={(open) => {
          if (!open) setVersionDeleteKind(null);
        }}
        open={versionDeleteKind === 'soft'}
        schemaVersionName={`${subjectData.name} version ${schema.version}`}
      />
      <PermanentDeleteDialog
        onConfirm={executePermanentDelete}
        onOpenChange={(open) => {
          if (!open) setVersionDeleteKind(null);
        }}
        open={versionDeleteKind === 'permanent'}
        schemaVersionName={`${subjectData.name} version ${schema.version}`}
      />
    </div>
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

  if (!schemaLeft) {
    setSelectedVersionLeft(subject.versions[0]?.version ?? 1);
  }

  if (!schemaRight) {
    setSelectedVersionRight(subject.versions[0]?.version ?? 1);
  }

  if (!(schemaLeft && schemaRight)) {
    return null;
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Two version selectors */}
      <div className="grid min-w-0 grid-cols-2 gap-4">
        <div className="w-full">
          <div className="flex items-end gap-2">
            <Label text="Version">
              <div className="w-[200px]">
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
              </div>
            </Label>
            <div className="ml-4 flex h-9 items-center" data-testid="schema-diff-schema-id-left">
              Schema ID: {schemaLeft.id}
            </div>
          </div>
        </div>

        <div className="w-full">
          <div className="flex items-end gap-2">
            <Label text="Version">
              <div className="w-[200px]">
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
              </div>
            </Label>
            <div className="ml-4 flex h-9 items-center" data-testid="schema-diff-schema-id-right">
              Schema ID: {schemaRight.id}
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
};

const SchemaMetadataSection = ({ schema }: { schema: SchemaRegistryVersionedSchema }) => {
  const metadata = schema.metadata;
  const properties = metadata?.properties;
  const hasProperties = properties && Object.keys(properties).length > 0;

  return (
    <>
      <h3 className="mt-20 font-bold text-lg" data-testid="schema-metadata-heading">
        Metadata
      </h3>
      <p className="mb-4">Metadata associated with this schema version.</p>

      <p className="mb-3 font-bold">Properties</p>

      {hasProperties ? (
        <Table testId="schema-metadata-properties">
          <TableHeader>
            <TableRow>
              <TableHead width="sm">Key</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(properties).map(([key, value]) => (
              <TableRow key={key}>
                <TableCell weight="semibold">{key}</TableCell>
                <TableCell>{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No properties</EmptyTitle>
            <EmptyDescription>No properties defined for this schema version.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
};

const SchemaReferences = (p: { subject: SchemaRegistrySubjectDetails; schema: SchemaRegistryVersionedSchema }) => {
  const { subject, schema } = p;
  const version = schema.version;

  // Fetch referenced by data using React Query
  const { data: referencedByData } = useSchemaReferencedByQuery(subject.name, version);

  return (
    <>
      <SchemaMetadataSection schema={schema} />

      <h3 className="mt-20 font-bold text-lg" data-testid="schema-references-heading">
        References
      </h3>
      <p className="mb-6">Schemas that are required by this version.</p>

      {schema.references.length > 0 ? (
        <ul className="list-disc pl-5" data-testid="schema-references-list">
          {schema.references.map((ref) => {
            const parsed = parseSubjectContext(ref.subject);
            return (
              <li key={ref.name + ref.subject + ref.version}>
                <Link
                  data-testid={`schema-reference-link-${ref.subject}`}
                  params={{ subjectName: encodeURIComponentPercents(ref.subject) }}
                  search={{ version: String(ref.version) }}
                  to="/schema-registry/subjects/$subjectName"
                >
                  {parsed.context !== 'default' && <span className="text-gray-400">:.{parsed.context}:</span>}
                  {parsed.displayName}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>This schema has no references.</p>
      )}

      <h3 className="mt-20 font-bold text-lg" data-testid="schema-referenced-by-heading">
        Referenced By
      </h3>
      <p className="mb-6">Schemas that reference this version.</p>

      {referencedByData && referencedByData.length > 0 ? (
        <ul className="list-disc pl-5" data-testid="schema-referenced-by-list">
          {referencedByData
            .flatMap((x) => x.usages)
            .map((ref) => {
              const parsed = parseSubjectContext(ref.subject);
              return (
                <li key={ref.subject + ref.version}>
                  <Link
                    data-testid={`schema-referenced-by-link-${ref.subject}`}
                    params={{ subjectName: encodeURIComponentPercents(ref.subject) }}
                    search={{ version: String(ref.version) }}
                    to="/schema-registry/subjects/$subjectName"
                  >
                    {parsed.context !== 'default' && <span className="text-gray-400">:.{parsed.context}:</span>}
                    {parsed.displayName}
                  </Link>
                </li>
              );
            })}
        </ul>
      ) : (
        <p>This schema has no incoming references.</p>
      )}
    </>
  );
};

export default SchemaDetailsView;
