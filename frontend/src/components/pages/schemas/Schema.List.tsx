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

// Icons
import { ArchiveIcon, TrashIcon } from '@heroicons/react/outline';
import { InfoIcon } from '@primer/octicons-react';
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
import { parseAsBoolean, parseAsString, useQueryState } from 'nuqs';
import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
// Routing and state management
import { Link } from 'react-router-dom';
// Custom hooks
import { useQueryStateWithCallback } from '../../../hooks/useQueryStateWithCallback';
// API hooks
import {
  useDeleteSchemaMutation,
  useListSchemasQuery,
  useSchemaCompatibilityQuery,
  useSchemaDetailsQuery,
  useSchemaModeQuery,
} from '../../../react-query/api/schema';
// Global state
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import type { SchemaRegistrySubject } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/uiState';
// Utility components and functions
import { Button, InlineSkeleton } from '../../../utils/tsxUtils';
import { encodeURIComponentPercents } from '../../../utils/utils';
// Layout components
import PageContent from '../../misc/PageContent';
import Section from '../../misc/Section';
import { SmallStat } from '../../misc/SmallStat';
// Redpanda UI Registry components
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '../../redpanda-ui/components/drawer';
// Local modals
import { openDeleteModal, openPermanentDeleteModal } from './modals';

const { ToastContainer, toast } = createStandaloneToast();

const RequestErrors: FC<{ requestErrors?: string[] }> = ({ requestErrors }) => {
  if (!requestErrors || requestErrors.length === 0) {
    return null;
  }

  return (
    <Section>
      {requestErrors.map((errorMessage, idx) => (
        <Alert key={idx} marginTop="1em" status="error">
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
          <a target="_blank" rel="noopener noreferrer" href="https://docs.redpanda.com/docs/manage/console/">
            <Button variant="solid">Redpanda Console Config Documentation</Button>
          </a>
        </VStack>
      </Section>
    </PageContent>
  );
};

const SchemaList: FC = () => {
  const [isLoadingSchemaVersionMatches, setIsLoadingSchemaVersionMatches] = useState(false);
  const [isHelpSidebarOpen, setIsHelpSidebarOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useQueryState('q', parseAsString.withDefault(''));

  const [showSoftDeleted, setShowSoftDeleted] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => {
        uiSettings.schemaList.showSoftDeleted = val;
      },
      getDefaultValue: () => {
        return uiSettings.schemaList.showSoftDeleted;
      },
    },
    'showSoftDeleted',
    parseAsBoolean,
  );

  const { data: schemaSubjects, isLoading, isError, refetch: refetchSchemas } = useListSchemasQuery();
  const { data: schemaMode, refetch: refetchMode } = useSchemaModeQuery();
  const { data: schemaCompatibility, refetch: refetchCompatibility } = useSchemaCompatibilityQuery();
  const deleteSchemaMutation = useDeleteSchemaMutation();

  const refreshData = useCallback(() => {
    refetchMode();
    refetchCompatibility();
    api.refreshSchemaTypes();
    refetchSchemas();

    // Forcing a refresh means clearing cached information
    // For all the above calls this happens automatically, but schema usages are a cached map
    api.schemaUsagesById.clear();
  }, [refetchSchemas, refetchMode, refetchCompatibility]);

  useEffect(() => {
    uiState.pageBreadcrumbs = [{ title: 'Schema Registry', linkTo: '/schema-registry' }];
    appGlobal.onRefresh = () => refreshData();
  }, [refreshData]);

  const triggerSearchBySchemaId = useCallback(() => {
    const trimmedValue = quickSearch.trim();
    const searchAsNum = Number(trimmedValue);
    if (trimmedValue.length && !Number.isNaN(searchAsNum)) {
      // Keep calling it to keep the list updated
      // Extra calls (even when we already have data) will be automatically caught by caching
      setIsLoadingSchemaVersionMatches(true);
      api.refreshSchemaUsagesById(searchAsNum).finally(() => setIsLoadingSchemaVersionMatches(false));
    }
  }, [quickSearch]);

  useEffect(() => {
    triggerSearchBySchemaId();
  }, [triggerSearchBySchemaId]);

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
      if (!Number.isNaN(filterAsNumber)) {
        const schemas = api.schemaUsagesById.get(filterAsNumber);
        const matchingSubjectNames = new Set(schemas?.map((s) => s.subject) ?? []);
        subjects = subjects.filter((subject) => matchingSubjectNames.has(subject.name));
      } else {
        // Find by regex or string matching
        try {
          const quickSearchRegExp = new RegExp(searchQuery, 'i');
          subjects = subjects.filter((subject) => Boolean(subject.name.match(quickSearchRegExp)));
        } catch (_e) {
          const searchLower = searchQuery.toLowerCase();
          subjects = subjects.filter((subject) => subject.name.toLowerCase().includes(searchLower));
        }
      }
    }

    return subjects;
  }, [schemaSubjects, quickSearch, showSoftDeleted]);

  if (api.schemaOverviewIsConfigured === false) return <NotConfigured />;

  return (
    <PageContent key="b">
      <ToastContainer />
      {/* Statistics Bar */}
      <Flex gap="1rem" alignItems="center">
        <SmallStat title="Mode">{schemaMode ?? <InlineSkeleton width="100px" />}</SmallStat>
        <Divider height="2ch" orientation="vertical" />
        <SmallStat title="Compatibility">{schemaCompatibility ?? <InlineSkeleton width="100px" />}</SmallStat>
      </Flex>

      <Button
        variant="outline"
        mb="4"
        width="fit-content"
        onClick={() => appGlobal.historyPush('/schema-registry/edit-compatibility')}
        disabledReason={
          api.userData?.canManageSchemaRegistry === false
            ? "You don't have the 'canManageSchemaRegistry' permission"
            : undefined
        }
      >
        Edit compatibility
      </Button>

      <RequestErrors />

      <Flex alignItems="center" gap="2">
        <SearchField
          width="350px"
          searchText={quickSearch ?? ''}
          setSearchText={setQuickSearch}
          placeholderText="Filter by subject name or schema ID..."
        />
        <Tooltip label="Help with schema search" hasArrow placement="top">
          <Box
            cursor="pointer"
            onClick={() => setIsHelpSidebarOpen(true)}
            data-testid="schema-search-help"
            display="inline-flex"
            alignItems="center"
          >
            <InfoIcon />
          </Box>
        </Tooltip>
        <Spinner size="md" display={isLoadingSchemaVersionMatches ? undefined : 'none'} />
      </Flex>
      <Drawer
        open={isHelpSidebarOpen}
        onOpenChange={setIsHelpSidebarOpen}
        testId="schema-search-help-sheet"
        direction="right"
      >
        <DrawerContent
          className="w-[600px] sm:max-w-[600px]"
          testId="schema-search-help-content"
          role="dialog"
          aria-labelledby="schema-help-title"
        >
          <DrawerHeader className="border-b">
            <DrawerTitle id="schema-help-title">Schema Search Help</DrawerTitle>
          </DrawerHeader>

          <div className="space-y-6 p-4">
            <section className="space-y-3" aria-labelledby="filtering-heading">
              <h3 id="filtering-heading" className="font-semibold text-gray-900">
                Filtering schemas
              </h3>
              <p className="text-base text-gray-600 leading-relaxed">
                There are two ways to filter schemas, and they work a little differently.
              </p>
            </section>

            <div className="space-y-4 pl-4">
              <section className="space-y-2" aria-labelledby="schema-id-heading">
                <h3 id="schema-id-heading" className="text-base font-semibold text-gray-900">
                  Schema ID
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  If a number matches a schema ID, the results include all subjects referencing that schema.
                </p>
              </section>

              <section className="space-y-2" aria-labelledby="subject-name-heading">
                <h3 id="subject-name-heading" className="text-base font-semibold text-gray-900">
                  Subject name
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  To search subject names, enter that specific name or a regex.
                </p>
              </section>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {isLoading ? (
        <Section>
          <Skeleton height="400px" />
        </Section>
      ) : isError ? (
        <Section>
          <Alert status="error">
            <AlertIcon />
            Error loading schemas
          </Alert>
        </Section>
      ) : (
        <Section>
          <Flex justifyContent={'space-between'} pb={3}>
            <Button
              colorScheme="brand"
              onClick={() => appGlobal.historyPush('/schema-registry/create')}
              disabledReason={
                api.userData?.canCreateSchemas === false
                  ? "You don't have the 'canCreateSchemas' permission"
                  : undefined
              }
            >
              Create new schema
            </Button>
            <Checkbox
              isChecked={showSoftDeleted}
              onChange={(e) => {
                setShowSoftDeleted(e.target.checked);
              }}
            >
              Show soft-deleted
            </Checkbox>
          </Flex>

          <DataTable<SchemaRegistrySubject>
            data={filteredSubjects}
            pagination
            sorting
            rowClassName={(row) => (row.original.isSoftDeleted ? 'text-gray-400' : '')}
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
                  <Box wordBreak="break-word" whiteSpace="break-spaces">
                    <Flex alignItems="center" gap={2}>
                      <Link
                        data-testid="schema-registry-table-name"
                        to={`/schema-registry/subjects/${encodeURIComponentPercents(name)}?version=latest`}
                      >
                        {name}
                      </Link>
                      {isSoftDeleted && (
                        <Tooltip
                          label="This subject has been soft-deleted. It can be restored or permanently deleted."
                          hasArrow
                        >
                          <Box>
                            <ArchiveIcon width={16} height={16} style={{ color: 'var(--chakra-colors-gray-400)' }} />
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
                    variant="icon"
                    height="16px"
                    color="gray.500"
                    disabledReason={
                      api.userData?.canDeleteSchemas === false
                        ? "You don't have the 'canDeleteSchemas' permission"
                        : undefined
                    }
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
                            },
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
                            },
                          );
                        });
                      }
                    }}
                  >
                    <TrashIcon />
                  </Button>
                ),
                size: 1,
              },
            ]}
          />
        </Section>
      )}
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
