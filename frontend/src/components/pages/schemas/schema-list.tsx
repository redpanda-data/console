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

// Redpanda UI (legacy)
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Checkbox,
  createStandaloneToast,
  DataTable,
  Divider,
  Flex,
  SearchField,
  Spinner,
  Text,
  Tooltip,
} from '@redpanda-data/ui';
// Routing and state management
import { Link } from '@tanstack/react-router';
// Icons
import { ArchiveIcon, EditIcon, InfoIcon, TrashIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from 'components/redpanda-ui/components/drawer';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { parseAsBoolean, parseAsString, useQueryState } from 'nuqs';
import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DeleteDialog, PermanentDeleteDialog } from './modals';
import { SchemaContextSelector } from './schema-context-selector';
import {
  ALL_CONTEXT_ID,
  CONTEXT_PREFIX_RE,
  DEFAULT_CONTEXT_ID,
  deriveContexts,
  isNamedContext,
  parseSubjectContext,
} from './schema-context-utils';
import { SchemaNotConfiguredPage } from './schema-not-configured';
// Custom hooks
import { useQueryStateWithCallback } from '../../../hooks/use-query-state-with-callback';
// API hooks
import {
  useDeleteSchemaSubjectMutation,
  useListSchemasQuery,
  useSchemaCompatibilityQuery,
  useSchemaDetailsQuery,
  useSchemaModeQuery,
  useSchemaRegistryContextsQuery,
  useSchemaUsagesByIdQuery,
} from '../../../react-query/api/schema-registry';
// Global state
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import type { SchemaRegistrySubject } from '../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../state/supported-features';
import { uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/ui-state';
// Utility components and functions
import { encodeURIComponentPercents } from '../../../utils/utils';
// Layout components
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { SmallStat } from '../../misc/small-stat';

const { ToastContainer, toast } = createStandaloneToast();

const RequestErrors: FC<{ requestErrors?: string[] }> = ({ requestErrors }) => {
  if (!requestErrors || requestErrors.length === 0) {
    return null;
  }

  return (
    <Section>
      {requestErrors.map((errorMessage) => (
        <Alert key={errorMessage} marginTop="1em" status="error">
          <AlertIcon />
          <div>{errorMessage}</div>
        </Alert>
      ))}
    </Section>
  );
};

const SchemaList: FC = () => {
  const schemaRegistryContextsSupported = useSupportedFeaturesStore((s) => s.schemaRegistryContexts);
  const [isHelpSidebarOpen, setIsHelpSidebarOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useQueryState('q', parseAsString.withDefault(''));

  const [showSoftDeleted, setShowSoftDeleted] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => {
        uiSettings.schemaList.showSoftDeleted = val;
      },
      getDefaultValue: () => uiSettings.schemaList.showSoftDeleted,
    },
    'showSoftDeleted',
    parseAsBoolean
  );

  const [selectedContext, setSelectedContext] = useQueryState('context', parseAsString.withDefault(DEFAULT_CONTEXT_ID));
  const { data: schemaSubjects, isLoading, isError, refetch: refetchSchemas } = useListSchemasQuery();
  const { data: contexts } = useSchemaRegistryContextsQuery(schemaRegistryContextsSupported);
  const { data: schemaMode, refetch: refetchMode } = useSchemaModeQuery();
  const { data: schemaCompatibility, refetch: refetchCompatibility } = useSchemaCompatibilityQuery();
  const deleteSchemaMutation = useDeleteSchemaSubjectMutation();
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'soft' | 'permanent'; name: string } | null>(null);

  // Parse schema ID from search query
  const schemaIdSearch = useMemo(() => {
    const trimmedValue = quickSearch.trim();
    const searchAsNum = Number(trimmedValue);
    return trimmedValue.length && !Number.isNaN(searchAsNum) ? searchAsNum : null;
  }, [quickSearch]);

  const { data: schemaUsages, isLoading: isLoadingSchemaVersionMatches } = useSchemaUsagesByIdQuery(schemaIdSearch);

  const refreshData = useCallback(() => {
    refetchMode();
    refetchCompatibility();
    api.refreshSchemaTypes();
    refetchSchemas();
  }, [refetchSchemas, refetchMode, refetchCompatibility]);

  const derivedContexts = useMemo(
    () => (schemaRegistryContextsSupported ? deriveContexts(contexts ?? [], schemaSubjects ?? []) : []),
    [contexts, schemaSubjects, schemaRegistryContextsSupported]
  );

  // Reset to default if the selected context no longer exists (e.g. deleted server-side).
  // Wait until both contexts and subjects have loaded to avoid resetting during partial data.
  const contextsLoaded = contexts !== undefined;
  const subjectsLoaded = schemaSubjects !== undefined;
  useEffect(() => {
    if (
      contextsLoaded &&
      subjectsLoaded &&
      derivedContexts.length > 0 &&
      !derivedContexts.some((c) => c.id === selectedContext)
    ) {
      setSelectedContext(DEFAULT_CONTEXT_ID);
    }
  }, [derivedContexts, selectedContext, setSelectedContext, contextsLoaded, subjectsLoaded]);

  // Use context-specific mode/compat when a named context is selected
  const { displayMode, displayCompat } = useMemo(() => {
    const ctx = derivedContexts.find((c) => c.id === selectedContext);
    const useContextLevel = ctx && isNamedContext(selectedContext) && schemaRegistryContextsSupported;
    return {
      displayMode: useContextLevel ? ctx.mode : schemaMode,
      displayCompat: useContextLevel ? ctx.compatibility : schemaCompatibility,
    };
  }, [derivedContexts, selectedContext, schemaRegistryContextsSupported, schemaMode, schemaCompatibility]);

  useEffect(() => {
    uiState.pageBreadcrumbs = [{ title: 'Schema Registry', linkTo: '/schema-registry' }];
    appGlobal.onRefresh = () => refreshData();
  }, [refreshData]);

  const isAllContext = schemaRegistryContextsSupported && selectedContext === ALL_CONTEXT_ID;

  const filteredSubjects = useMemo(() => {
    let subjects = schemaSubjects ?? [];

    // Filter by context
    if (schemaRegistryContextsSupported && selectedContext !== ALL_CONTEXT_ID) {
      if (selectedContext === DEFAULT_CONTEXT_ID) {
        subjects = subjects.filter((s) => !CONTEXT_PREFIX_RE.test(s.name));
      } else {
        const prefix = `:${selectedContext}:`;
        subjects = subjects.filter((s) => s.name.startsWith(prefix));
      }
    }

    // Filter by soft-deleted status
    if (!showSoftDeleted) {
      subjects = subjects.filter((x) => !x.isSoftDeleted);
    }

    // Filter by search query
    const searchQuery = quickSearch;
    if (searchQuery) {
      // Find by schema ID
      const filterAsNumber = Number(searchQuery.trim());
      if (Number.isNaN(filterAsNumber)) {
        // Find by regex or string matching
        try {
          const quickSearchRegExp = new RegExp(searchQuery, 'i');
          subjects = subjects.filter((subject) => Boolean(subject.name.match(quickSearchRegExp)));
        } catch (_e) {
          const searchLower = searchQuery.toLowerCase();
          subjects = subjects.filter((subject) => subject.name.toLowerCase().includes(searchLower));
        }
      } else {
        const matchingSubjectNames = new Set(schemaUsages?.map((s) => s.subject) ?? []);
        subjects = subjects.filter((subject) => matchingSubjectNames.has(subject.name));
      }
    }

    return subjects;
  }, [schemaSubjects, quickSearch, showSoftDeleted, schemaUsages, schemaRegistryContextsSupported, selectedContext]);

  if (schemaMode === null) {
    return <SchemaNotConfiguredPage />;
  }

  return (
    <PageContent key="b">
      <ToastContainer />
      {/* Statistics Bar */}
      <Flex alignItems="center" data-testid="schema-list-stats" gap="1rem">
        <SmallStat title={isNamedContext(selectedContext) && schemaRegistryContextsSupported ? 'Context mode' : 'Mode'}>
          <Flex alignItems="center" gap="1.5">
            {displayMode ?? <Skeleton variant="text" width="sm" />}
            <Tooltip
              hasArrow
              isDisabled={api.userData?.canManageSchemaRegistry !== false}
              label="You don't have the 'canManageSchemaRegistry' permission"
              placement="top"
            >
              <Button
                aria-label="Edit mode"
                data-testid="schema-list-edit-mode-btn"
                disabled={api.userData?.canManageSchemaRegistry === false}
                onClick={() =>
                  isNamedContext(selectedContext) && schemaRegistryContextsSupported
                    ? appGlobal.historyPush(
                        `/schema-registry/contexts/${encodeURIComponent(selectedContext)}/edit-mode`
                      )
                    : appGlobal.historyPush('/schema-registry/edit-mode')
                }
                size="icon-xs"
                variant="secondary-ghost"
              >
                <EditIcon />
              </Button>
            </Tooltip>
          </Flex>
        </SmallStat>
        <Divider height="2ch" orientation="vertical" />
        <SmallStat
          title={
            isNamedContext(selectedContext) && schemaRegistryContextsSupported
              ? 'Context compatibility'
              : 'Compatibility'
          }
        >
          <Flex alignItems="center" gap="1.5">
            {displayCompat ?? <Skeleton variant="text" width="sm" />}
            <Tooltip
              hasArrow
              isDisabled={api.userData?.canManageSchemaRegistry !== false}
              label="You don't have the 'canManageSchemaRegistry' permission"
              placement="top"
            >
              <Button
                aria-label="Edit compatibility"
                data-testid="schema-list-edit-compatibility-btn"
                disabled={api.userData?.canManageSchemaRegistry === false}
                onClick={() =>
                  isNamedContext(selectedContext) && schemaRegistryContextsSupported
                    ? appGlobal.historyPush(
                        `/schema-registry/contexts/${encodeURIComponent(selectedContext)}/edit-compatibility`
                      )
                    : appGlobal.historyPush('/schema-registry/edit-compatibility')
                }
                size="icon-xs"
                variant="secondary-ghost"
              >
                <EditIcon />
              </Button>
            </Tooltip>
          </Flex>
        </SmallStat>
      </Flex>

      {schemaRegistryContextsSupported && (
        <SchemaContextSelector
          contexts={derivedContexts}
          onContextChange={setSelectedContext}
          selectedContext={selectedContext}
        />
      )}

      <div className="my-4 flex items-center gap-2">
        <Button
          data-testid="schema-list-create-btn"
          disabled={api.userData?.canCreateSchemas === false}
          onClick={() =>
            isNamedContext(selectedContext) && schemaRegistryContextsSupported
              ? appGlobal.historyPush(`/schema-registry/contexts/${encodeURIComponent(selectedContext)}/create`)
              : appGlobal.historyPush('/schema-registry/create')
          }
          variant="primary"
        >
          Create new schema
        </Button>
      </div>

      <RequestErrors />

      <Drawer direction="right" onOpenChange={setIsHelpSidebarOpen} open={isHelpSidebarOpen}>
        <DrawerContent aria-labelledby="schema-help-title" className="w-[600px] sm:max-w-[600px]" role="dialog">
          <DrawerHeader className="border-b">
            <DrawerTitle data-testid="schema-help-title" id="schema-help-title">
              Schema Search Help
            </DrawerTitle>
          </DrawerHeader>

          <div className="space-y-6 p-4">
            <section aria-labelledby="filtering-heading" className="space-y-3">
              <h3 className="font-semibold text-gray-900" id="filtering-heading">
                Filtering schemas
              </h3>
              <p className="text-base text-gray-600 leading-relaxed">
                There are two ways to filter schemas, and they work a little differently.
              </p>
            </section>

            <div className="space-y-4 pl-4">
              <section aria-labelledby="schema-id-heading" className="space-y-2">
                <h3 className="font-semibold text-base text-gray-900" id="schema-id-heading">
                  Schema ID
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  If a number matches a schema ID, the results include all subjects referencing that schema.
                </p>
              </section>

              <section aria-labelledby="subject-name-heading" className="space-y-2">
                <h3 className="font-semibold text-base text-gray-900" id="subject-name-heading">
                  Subject name
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  To search subject names, enter that specific name or a regex.
                </p>
              </section>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {(() => {
        if (isLoading) {
          return (
            <Section>
              <Skeleton size="xl" width="full" />
            </Section>
          );
        }

        if (isError) {
          return (
            <Section>
              <Alert status="error">
                <AlertIcon />
                Error loading schemas
              </Alert>
            </Section>
          );
        }

        return (
          <Section>
            <Flex justifyContent={'space-between'} pb={3}>
              <Flex alignItems="center" gap="2">
                <SearchField
                  data-testid="schema-list-search-field"
                  placeholderText="Filter by subject name or schema ID..."
                  searchText={quickSearch ?? ''}
                  setSearchText={setQuickSearch}
                  width="350px"
                />
                <Tooltip hasArrow label="Help with schema search" placement="top">
                  <Box
                    alignItems="center"
                    cursor="pointer"
                    data-testid="schema-search-help"
                    display="inline-flex"
                    onClick={() => setIsHelpSidebarOpen(true)}
                  >
                    <InfoIcon />
                  </Box>
                </Tooltip>
                <Spinner display={isLoadingSchemaVersionMatches ? undefined : 'none'} size="md" />
              </Flex>
              <Checkbox
                data-testid="schema-list-show-soft-deleted-checkbox"
                isChecked={showSoftDeleted}
                onChange={(e) => {
                  setShowSoftDeleted(e.target.checked);
                }}
              >
                Show soft-deleted
              </Checkbox>
            </Flex>

            <DataTable<SchemaRegistrySubject>
              columns={[
                {
                  header: 'Name',
                  accessorKey: 'name',
                  size: Number.POSITIVE_INFINITY,
                  cell: ({
                    row: {
                      original: { name, isSoftDeleted },
                    },
                  }) => {
                    const parsed = parseSubjectContext(name);
                    return (
                      <Box whiteSpace="break-spaces" wordBreak="break-word">
                        <Flex alignItems="center" gap={2}>
                          <Link
                            data-testid="schema-registry-table-name"
                            params={{ subjectName: encodeURIComponentPercents(name) }}
                            search={{ version: 'latest' }}
                            to="/schema-registry/subjects/$subjectName"
                          >
                            {isAllContext && parsed.context !== 'default' && (
                              <span className="text-gray-400">:.{parsed.context}:</span>
                            )}
                            {isAllContext || isNamedContext(selectedContext) ? parsed.displayName : name}
                          </Link>
                          {isSoftDeleted && (
                            <Tooltip
                              hasArrow
                              label="This subject has been soft-deleted. It can be restored or permanently deleted."
                            >
                              <Box data-testid="schema-list-soft-deleted-icon">
                                <ArchiveIcon height={16} style={{ color: 'dimgrey' }} width={16} />
                              </Box>
                            </Tooltip>
                          )}
                        </Flex>
                      </Box>
                    );
                  },
                },
                ...(isAllContext
                  ? [
                      {
                        header: 'Context',
                        id: 'context',
                        size: 120,
                        cell: ({ row }: { row: { original: SchemaRegistrySubject } }) => {
                          const { context } = parseSubjectContext(row.original.name);
                          return (
                            <Badge bg="gray.50" color="gray.700" size="sm" variant="subtle">
                              {context === 'default' ? 'Default' : `.${context}`}
                            </Badge>
                          );
                        },
                      },
                    ]
                  : []),
                { header: 'Type', cell: ({ row: { original: r } }) => <SchemaTypeColumn name={r.name} />, size: 100 },
                {
                  header: 'Compatibility',
                  cell: ({ row: { original: r } }) => <SchemaCompatibilityColumn name={r.name} />,
                  size: 100,
                },
                {
                  header: 'Mode',
                  cell: ({ row: { original: r } }) => <SchemaModeColumn name={r.name} />,
                  size: 100,
                },
                {
                  header: 'Latest Version',
                  cell: ({ row: { original: r } }) => <LatestVersionColumn name={r.name} />,
                  size: 100,
                },
                {
                  header: '',
                  id: 'actions',
                  cell: ({ row: { original: r } }) => (
                    <Button
                      aria-label="Delete schema"
                      data-testid={`schema-list-delete-btn-${r.name}`}
                      disabled={api.userData?.canDeleteSchemas === false}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();

                        setDeleteTarget({ kind: r.isSoftDeleted ? 'permanent' : 'soft', name: r.name });
                      }}
                      size="icon-sm"
                      variant="secondary-ghost"
                    >
                      <TrashIcon />
                    </Button>
                  ),
                  size: 1,
                },
              ]}
              data={filteredSubjects}
              pagination
              rowClassName={(row) => (row.original.isSoftDeleted ? 'text-gray-400' : '')}
              sorting
            />
          </Section>
        );
      })()}

      <DeleteDialog
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteSchemaMutation.mutate(
            { subjectName: deleteTarget.name, permanent: false },
            {
              onSuccess: () => {
                toast({
                  status: 'success',
                  duration: 4000,
                  isClosable: false,
                  title: 'Subject soft-deleted',
                });
              },
              onError: (err) => {
                toast({
                  status: 'error',
                  duration: null,
                  isClosable: true,
                  title: 'Failed to soft-delete subject',
                  description: String(err),
                });
              },
            }
          );
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        open={deleteTarget?.kind === 'soft'}
        schemaVersionName={deleteTarget?.name ?? ''}
      />
      <PermanentDeleteDialog
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteSchemaMutation.mutate(
            { subjectName: deleteTarget.name, permanent: true },
            {
              onSuccess: () => {
                toast({
                  status: 'success',
                  duration: 4000,
                  isClosable: false,
                  title: 'Subject permanently deleted',
                });
              },
              onError: (err) => {
                toast({
                  status: 'error',
                  duration: null,
                  isClosable: true,
                  title: 'Failed to permanently delete subject',
                  description: String(err),
                });
              },
            }
          );
        }}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        open={deleteTarget?.kind === 'permanent'}
        schemaVersionName={deleteTarget?.name ?? ''}
      />
    </PageContent>
  );
};

const SchemaTypeColumn: FC<{ name: string }> = ({ name }) => {
  const { data: details, isLoading } = useSchemaDetailsQuery(name);

  if (isLoading || !details) {
    return <Skeleton variant="text" />;
  }

  const getSchemaTypeBadgeProps = (type: string) => {
    switch (type) {
      case 'AVRO':
        return { bg: 'blue.50', color: 'blue.700', variant: 'subtle' as const };
      case 'PROTOBUF':
        return { bg: 'teal.50', color: 'teal.700', variant: 'subtle' as const };
      case 'JSON':
        return { bg: 'orange.50', color: 'orange.700', variant: 'subtle' as const };
      default:
        return { bg: 'gray.50', color: 'gray.700', variant: 'subtle' as const };
    }
  };

  const badgeProps = getSchemaTypeBadgeProps(details.type);

  return (
    <Badge size="sm" {...badgeProps}>
      {details.type}
    </Badge>
  );
};

const SchemaCompatibilityColumn: FC<{ name: string }> = ({ name }) => {
  const { data: details, isLoading } = useSchemaDetailsQuery(name);

  if (isLoading || !details) {
    return <Skeleton variant="text" />;
  }

  return <>{details.compatibility}</>;
};

const SchemaModeColumn: FC<{ name: string }> = ({ name }) => {
  const { data: details, isLoading } = useSchemaDetailsQuery(name);

  if (isLoading || !details) {
    return <Skeleton variant="text" />;
  }

  return <>{details.mode}</>;
};

const LatestVersionColumn: FC<{ name: string }> = ({ name }) => {
  const { data: details, isLoading } = useSchemaDetailsQuery(name);

  if (isLoading || !details) {
    return <Skeleton variant="text" />;
  }

  if (details.latestActiveVersion < 0) {
    return <Text color="gray.500">None</Text>;
  }

  return <>{details.latestActiveVersion}</>;
};

export default SchemaList;
