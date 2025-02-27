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

import { observer } from 'mobx-react';
import React from 'react';
import type { RefObject } from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { Button, DefaultSkeleton, InlineSkeleton } from '../../../utils/tsxUtils';
import { PageComponent, type PageInitHelper } from '../Page';

import './Schema.List.scss';
import { TrashIcon } from '@heroicons/react/outline';
import {
  Alert,
  AlertIcon,
  Checkbox,
  DataTable,
  Divider,
  Empty,
  Flex,
  SearchField,
  Skeleton,
  Text,
  VStack,
} from '@redpanda-data/ui';
import { action, makeObservable, observable } from 'mobx';
import PageContent from '../../misc/PageContent';
import type SearchBar from '../../misc/SearchBar';
import Section from '../../misc/Section';
import { SmallStat } from '../../misc/SmallStat';
import { openDeleteModal, openPermanentDeleteModal } from './modals';

import {
  Box,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Heading,
  Spinner,
  createStandaloneToast,
} from '@redpanda-data/ui';
import { Link } from 'react-router-dom';
import type { SchemaRegistrySubject } from '../../../state/restInterfaces';
import { encodeURIComponentPercents } from '../../../utils/utils';

const { ToastContainer, toast } = createStandaloneToast();

function renderRequestErrors(requestErrors?: string[]) {
  if (!requestErrors || requestErrors.length === 0) {
    return null;
  }

  return (
    <Section>
      <div className="SchemaList__error-card">
        {requestErrors.map((errorMessage, idx) => (
          <Alert key={idx} marginTop="1em" status="error">
            <AlertIcon />
            <div>{errorMessage}</div>
          </Alert>
        ))}
      </div>
    </Section>
  );
}

function renderNotConfigured() {
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
}

@observer
class SchemaList extends PageComponent<{}> {
  @observable searchBar: RefObject<SearchBar<any>> = React.createRef();
  @observable filteredSchemaSubjects: { name: string }[];
  @observable isLoadingSchemaVersionMatches = false;
  @observable isHelpSidebarOpen = false;

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Schema Registry';
    p.addBreadcrumb('Schema Registry', '/schema-registry');
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force?: boolean) {
    api.refreshSchemaCompatibilityConfig(force);
    api.refreshSchemaMode(force);
    api.refreshSchemaSubjects(force);
    api.refreshSchemaTypes(force);

    // Forcing a refresh means clearing cached information
    // For all the above calls this happens automatically, but schema usages are a cached map
    api.schemaUsagesById.clear();
  }

  isFilterMatch(filterString: string, subject: SchemaRegistrySubject) {
    // Find by schema ID
    const filterAsNumber = Number(filterString.trim());
    if (!Number.isNaN(filterAsNumber)) {
      console.log('finding by num', { num: filterAsNumber });
      // Filter is a number, lets see if we can find a matching schema(-version)
      const schemas = api.schemaUsagesById.get(filterAsNumber);
      const matches = schemas?.filter((s) => s.subject === subject.name);
      if (matches && matches.length > 0) {
        for (const m of matches) console.log(`found match: ${m.subject} v${m.version}`);
        return true;
      }
    }

    // Find by regex
    try {
      const quickSearchRegExp = new RegExp(filterString, 'i');
      if (subject.name.match(quickSearchRegExp)) return true;
    } catch {}

    // Find by normal string matching
    return subject.name.toLowerCase().includes(filterString.toLowerCase());
  }

  componentDidMount() {
    this.triggerSearchBySchemaId();
  }

  triggerSearchBySchemaId() {
    const trimmedValue = uiSettings.schemaList.quickSearch.trim();
    const searchAsNum = Number(trimmedValue);
    if (trimmedValue.length && !Number.isNaN(searchAsNum)) {
      // Keep calling it to keep the list updated
      // Extra calls (even when we already have data) will be automatically caught by caching
      this.isLoadingSchemaVersionMatches = true;
      api.refreshSchemaUsagesById(searchAsNum).finally(() => (this.isLoadingSchemaVersionMatches = false));
    }
  }

  render() {
    if (api.schemaOverviewIsConfigured === false) return renderNotConfigured();
    if (api.schemaSubjects === undefined) return DefaultSkeleton; // request in progress

    let filteredSubjects = api.schemaSubjects;
    if (uiSettings.schemaList.quickSearch) {
      filteredSubjects = filteredSubjects
        .filter(
          (x) => uiSettings.schemaList.showSoftDeleted || (!uiSettings.schemaList.showSoftDeleted && !x.isSoftDeleted),
        )
        .filter((s) => this.isFilterMatch(uiSettings.schemaList.quickSearch, s));
    }

    return (
      <PageContent key="b">
        <ToastContainer />
        {/* Statistics Bar */}
        <Flex gap="1rem" alignItems="center">
          <SmallStat title="Mode">{api.schemaMode ?? <InlineSkeleton width="100px" />}</SmallStat>
          <Divider height="2ch" orientation="vertical" />
          <SmallStat title="Compatibility">{api.schemaCompatibility ?? <InlineSkeleton width="100px" />}</SmallStat>
        </Flex>

        <Button
          variant="outline"
          mb="4"
          width="fit-content"
          onClick={() => appGlobal.history.push('/schema-registry/edit-compatibility')}
          disabledReason={
            api.userData?.canManageSchemaRegistry === false
              ? "You don't have the 'canManageSchemaRegistry' permission"
              : undefined
          }
        >
          Edit compatibility
        </Button>

        {renderRequestErrors()}

        <Flex alignItems="center" gap="4">
          <SearchField
            width="350px"
            searchText={uiSettings.schemaList.quickSearch}
            setSearchText={action((filterText) => {
              uiSettings.schemaList.quickSearch = filterText;
              this.triggerSearchBySchemaId();
            })}
            placeholderText="Filter by subject name or schema ID..."
          />
          <Spinner size="md" display={this.isLoadingSchemaVersionMatches ? undefined : 'none'} />
        </Flex>

        <Button
          textDecoration="underline"
          mr="auto"
          cursor="pointer"
          mb=".5rem"
          onClick={() => (this.isHelpSidebarOpen = true)}
          data-testid="schema-search-help"
          variant="link"
          paddingInline={0}
          fontWeight={400}
        >
          Help with schema search
        </Button>
        <Drawer
          isOpen={this.isHelpSidebarOpen}
          placement="right"
          size="md"
          onClose={() => (this.isHelpSidebarOpen = false)}
        >
          <DrawerOverlay />
          <DrawerContent>
            <DrawerCloseButton />
            <DrawerHeader data-testid="schema-search-header">Schema Search Help</DrawerHeader>

            <DrawerBody>
              <Heading size="md" mt={4}>
                Filtering schemas
              </Heading>
              There are two ways to filter schemas, and they work a little differently.
              <Heading size="md" mt={4}>
                Schema ID
              </Heading>
              If a number matches a schema ID, the results include all subjects referencing that schema.
              <Heading size="md" mt={4}>
                Subject name
              </Heading>
              To search subject names, enter that specific name or a regex.
            </DrawerBody>
          </DrawerContent>
        </Drawer>

        <Section>
          <Flex justifyContent={'space-between'} pb={3}>
            <Button
              colorScheme="brand"
              onClick={() => appGlobal.history.push('/schema-registry/create')}
              disabledReason={
                api.userData?.canCreateSchemas === false
                  ? "You don't have the 'canCreateSchemas' permission"
                  : undefined
              }
            >
              Create new schema
            </Button>
            <Checkbox
              isChecked={uiSettings.schemaList.showSoftDeleted}
              onChange={(e) => (uiSettings.schemaList.showSoftDeleted = e.target.checked)}
            >
              Show soft-deleted
            </Checkbox>
          </Flex>

          <DataTable<SchemaRegistrySubject>
            data={filteredSubjects}
            pagination
            sorting
            columns={[
              {
                header: 'Name',
                accessorKey: 'name',
                size: Number.POSITIVE_INFINITY,
                cell: ({
                  row: {
                    original: { name },
                  },
                }) => (
                  <Box wordBreak="break-word" whiteSpace="break-spaces">
                    <Link
                      data-testid="schema-registry-table-name"
                      to={`/schema-registry/subjects/${encodeURIComponentPercents(name)}?version=latest`}
                    >
                      {name}
                    </Link>
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
                          api
                            .deleteSchemaSubject(r.name, true)
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
                        openDeleteModal(r.name, () => {
                          api
                            .deleteSchemaSubject(r.name, false)
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
                    <TrashIcon />
                  </Button>
                ),
                size: 1,
              },
            ]}
          />
        </Section>
      </PageContent>
    );
  }
}

const SchemaTypeColumn = observer((p: { name: string }) => {
  const details = api.schemaDetails.get(p.name);
  if (!details) {
    api.refreshSchemaDetails(p.name);
    return <Skeleton height="15px" />;
  }

  return <>{details.type}</>;
});

const SchemaCompatibilityColumn = observer((p: { name: string }) => {
  const details = api.schemaDetails.get(p.name);
  if (!details) {
    api.refreshSchemaDetails(p.name);
    return <Skeleton height="15px" />;
  }

  return <>{details.compatibility}</>;
});

const LatestVersionColumn = observer((p: { name: string }) => {
  const details = api.schemaDetails.get(p.name);
  if (!details) {
    api.refreshSchemaDetails(p.name);
    return <Skeleton height="15px" />;
  }

  if (details.latestActiveVersion < 0) {
    return <></>;
  }

  return <>{details.latestActiveVersion}</>;
});

export default SchemaList;
