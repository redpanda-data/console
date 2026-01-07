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
  Empty,
  Flex,
  SearchField,
  Skeleton,
  Spinner,
  Text,
  Tooltip,
  VStack,
} from '@redpanda-data/ui';
// Icons
import { ArchiveIcon, InfoIcon, TrashIcon } from 'components/icons';
import { parseAsBoolean, parseAsString, useQueryState } from 'nuqs';
import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
// Routing and state management
import { Link } from 'react-router-dom';

// Local modals
import { openDeleteModal, openPermanentDeleteModal } from './modals';
// Custom hooks
import { useQueryStateWithCallback } from '../../../hooks/use-query-state-with-callback';
// API hooks
import {
  useDeleteSchemaSubjectMutation,
  useListSchemasQuery,
  useSchemaCompatibilityQuery,
  useSchemaDetailsQuery,
  useSchemaModeQuery,
  useSchemaUsagesByIdQuery,
} from '../../../react-query/api/schema-registry';
// Global state
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import type { SchemaRegistrySubject } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/ui-state';
// Utility components and functions
import { Button, InlineSkeleton } from '../../../utils/tsx-utils';
import { encodeURIComponentPercents } from '../../../utils/utils';
// Layout components
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { SmallStat } from '../../misc/small-stat';
// Redpanda UI Registry components
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '../../redpanda-ui/components/drawer';

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

const NotConfigured: FC = () => {
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
          <a href="https://docs.redpanda.com/docs/manage/console/" rel="noopener noreferrer" target="_blank">
            <Button variant="solid">Redpanda Console Config Documentation</Button>
          </a>
        </VStack>
      </Section>
    </PageContent>
  );
};

const SchemaList: FC = () => {
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

  const { data: schemaSubjects, isLoading, isError, refetch: refetchSchemas } = useListSchemasQuery();
  const { data: schemaMode, refetch: refetchMode } = useSchemaModeQuery();
  const { data: schemaCompatibility, refetch: refetchCompatibility } = useSchemaCompatibilityQuery();
  const deleteSchemaMutation = useDeleteSchemaSubjectMutation();

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

  useEffect(() => {
    uiState.pageBreadcrumbs = [{ title: 'Schema Registry', linkTo: '/schema-registry' }];
    appGlobal.onRefresh = () => refreshData();
  }, [refreshData]);

  const filteredSubjects = useMemo(() => {
    let subjects = schemaSubjects ?? [];

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
  }, [schemaSubjects, quickSearch, showSoftDeleted, schemaUsages]);

  if (api.schemaOverviewIsConfigured === false) {
    return <NotConfigured />;
  }

  return (
    <PageContent key="b">
      <ToastContainer />
      {/* Statistics Bar */}
      <Flex alignItems="center" data-testid="schema-list-stats" gap="1rem">
        <SmallStat title="Mode">{schemaMode ?? <InlineSkeleton width="100px" />}</SmallStat>
        <Divider height="2ch" orientation="vertical" />
        <SmallStat title="Compatibility">{schemaCompatibility ?? <InlineSkeleton width="100px" />}</SmallStat>
      </Flex>

      <Button
        data-testid="schema-list-edit-compatibility-btn"
        disabledReason={
          api.userData?.canManageSchemaRegistry === false
            ? "You don't have the 'canManageSchemaRegistry' permission"
            : undefined
        }
        mb="4"
        onClick={() => appGlobal.historyPush('/schema-registry/edit-compatibility')}
        variant="outline"
        width="fit-content"
      >
        Edit compatibility
      </Button>

      <RequestErrors />

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
              <Skeleton height="400px" />
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
              <Button
                colorScheme="brand"
                data-testid="schema-list-create-btn"
                disabledReason={
                  api.userData?.canCreateSchemas === false
                    ? "You don't have the 'canCreateSchemas' permission"
                    : undefined
                }
                onClick={() => appGlobal.historyPush('/schema-registry/create')}
              >
                Create new schema
              </Button>
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
                  }) => (
                    <Box whiteSpace="break-spaces" wordBreak="break-word">
                      <Flex alignItems="center" gap={2}>
                        <Link
                          data-testid="schema-registry-table-name"
                          to={`/schema-registry/subjects/${encodeURIComponentPercents(name)}?version=latest`}
                        >
                          {name}
                        </Link>
                        {Boolean(isSoftDeleted) && (
                          <Tooltip
                            hasArrow
                            label="This subject has been soft-deleted. It can be restored or permanently deleted."
                          >
                            <Box data-testid="schema-list-soft-deleted-icon">
                              <ArchiveIcon height={16} style={{ color: 'var(--chakra-colors-gray-400)' }} width={16} />
                            </Box>
                          </Tooltip>
                        )}
                      </Flex>
                    </Box>
                  ),
                },
                { header: 'Type', cell: ({ row: { original: r } }) => <SchemaTypeColumn name={r.name} />, size: 100 },
                {
                  header: 'Compatibility',
                  cell: ({ row: { original: r } }) => <SchemaCompatibilityColumn name={r.name} />,
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
                      color="gray.500"
                      data-testid={`schema-list-delete-btn-${r.name}`}
                      disabledReason={
                        api.userData?.canDeleteSchemas === false
                          ? "You don't have the 'canDeleteSchemas' permission"
                          : undefined
                      }
                      height="16px"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();

                        if (r.isSoftDeleted) {
                          openPermanentDeleteModal(r.name, () => {
                            deleteSchemaMutation.mutate(
                              { subjectName: r.name, permanent: true },
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
                          });
                        } else {
                          openDeleteModal(r.name, () => {
                            deleteSchemaMutation.mutate(
                              { subjectName: r.name, permanent: false },
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
                          });
                        }
                      }}
                      variant="icon"
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
    </PageContent>
  );
};

const SchemaTypeColumn: FC<{ name: string }> = ({ name }) => {
  const { data: details, isLoading } = useSchemaDetailsQuery(name);

  if (isLoading || !details) {
    return <Skeleton height="15px" />;
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
    return <Skeleton height="15px" />;
  }

  return <>{details.compatibility}</>;
};

const LatestVersionColumn: FC<{ name: string }> = ({ name }) => {
  const { data: details, isLoading } = useSchemaDetailsQuery(name);

  if (isLoading || !details) {
    return <Skeleton height="15px" />;
  }

  if (details.latestActiveVersion < 0) {
    return <Text color="gray.500">None</Text>;
  }

  return <>{details.latestActiveVersion}</>;
};

export default SchemaList;
