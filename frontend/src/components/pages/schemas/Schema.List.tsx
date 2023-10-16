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

import React, { RefObject } from 'react';
import { observer } from 'mobx-react';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { appGlobal } from '../../../state/appGlobal';
import { sortField } from '../../misc/common';
import { DefaultSkeleton, InlineSkeleton, Button } from '../../../utils/tsxUtils';
import { uiSettings } from '../../../state/ui';

import './Schema.List.scss';
import SearchBar from '../../misc/SearchBar';
import { makeObservable, observable } from 'mobx';
import { KowlTable } from '../../misc/KowlTable';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { Alert, AlertIcon, Checkbox, Divider, Empty, Flex, Skeleton, VStack, Text } from '@redpanda-data/ui';
import { SmallStat } from '../../misc/SmallStat';
import { TrashIcon } from '@heroicons/react/outline';
import { openDeleteModal, openPermanentDeleteModal } from './modals';

import { createStandaloneToast } from '@chakra-ui/react';
const { ToastContainer, toast } = createStandaloneToast()

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
                        <br/>
                        To view all registered schemas, their documentation and their versioned history simply provide the connection credentials in the Redpanda Console config.
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
    }

    isFilterMatch(filterString: string, subject: { name: string }) {
        return subject.name.toLowerCase().includes(filterString.toLowerCase());
    }

    render() {
        if (api.schemaOverviewIsConfigured == false) return renderNotConfigured();
        if (api.schemaSubjects === undefined) return DefaultSkeleton; // request in progress

        const filteredSubjects = api.schemaSubjects
            .filter(x => uiSettings.schemaList.showSoftDeleted || (!uiSettings.schemaList.showSoftDeleted && !x.isSoftDeleted))
            .filter(x => x.name.toLowerCase().includes(uiSettings.schemaList.quickSearch.toLowerCase()));

        return (
            <PageContent key="b">
                <ToastContainer />
                {/* Statistics Bar */}
                <Flex gap="1rem" alignItems="center">
                    <SmallStat title="Mode">{api.schemaMode ?? <InlineSkeleton width="100px" />}</SmallStat>
                    <Divider height="2ch" orientation="vertical" />
                    <SmallStat title="Compatibility">{api.schemaCompatibility ?? <InlineSkeleton width="100px" />}</SmallStat>
                </Flex>

                <Button variant="outline" mb="4" width="fit-content"
                    onClick={() => appGlobal.history.push('/schema-registry/edit-compatibility')}
                    disabledReason={api.userData?.canManageSchemaRegistry === false ? 'You don\'t have the \'canManageSchemaRegistry\' permission' : undefined}
                >
                    Edit compatibility
                </Button>

                {renderRequestErrors()}

                <SearchBar<{ name: string }>
                    dataSource={() => (api.schemaSubjects || []).map(str => ({ name: str.name }))}
                    isFilterMatch={this.isFilterMatch}
                    filterText={uiSettings.schemaList.quickSearch}
                    onQueryChanged={(filterText) => (uiSettings.schemaList.quickSearch = filterText)}
                    onFilteredDataChanged={data => this.filteredSchemaSubjects = data}
                />

                <Section>
                    <Flex justifyContent={'space-between'} pb={3}>
                        <Button colorScheme="brand"
                            onClick={() => appGlobal.history.push('/schema-registry/create')}
                            disabledReason={api.userData?.canCreateSchemas === false ? 'You don\'t have the \'canCreateSchemas\' permission' : undefined}
                        >
                            Create new schema
                        </Button>
                        <Checkbox
                            isChecked={uiSettings.schemaList.showSoftDeleted}
                            onChange={e => uiSettings.schemaList.showSoftDeleted = e.target.checked}
                        >
                            Show soft-deleted
                        </Checkbox>
                    </Flex>

                    <KowlTable
                        dataSource={filteredSubjects}
                        columns={[
                            { title: 'Name', dataIndex: 'name', sorter: sortField('name'), defaultSortOrder: 'ascend' },
                            { title: 'Type', render: (_, r) => <SchemaTypeColumn name={r.name} />, width: 200 },
                            { title: 'Compatibility', render: (_, r) => <SchemaCompatibilityColumn name={r.name} />, width: 200 },
                            { title: 'Latest Version', render: (_, r) => <LatestVersionColumn name={r.name} />, width: 100 },
                            {
                                title: '', render: (_, r) =>
                                    <Button variant="icon"
                                        height="21px" color="gray.500"
                                        disabledReason={api.userData?.canDeleteSchemas === false ? 'You don\'t have the \'canDeleteSchemas\' permission' : undefined}
                                        onClick={e => {
                                            e.stopPropagation();
                                            e.preventDefault();

                                            if (r.isSoftDeleted) {
                                                openPermanentDeleteModal(r.name, () => {
                                                    api.deleteSchemaSubject(r.name, true)
                                                        .then(async () => {
                                                            toast({
                                                                status: 'success', duration: 4000, isClosable: false,
                                                                title: 'Subject permanently deleted'
                                                            });
                                                            api.refreshSchemaSubjects(true);
                                                        })
                                                        .catch(err => {
                                                            toast({
                                                                status: 'error', duration: null, isClosable: true,
                                                                title: 'Failed to permanently delete subject',
                                                                description: String(err),
                                                            })
                                                        });
                                                })
                                            } else {
                                                openDeleteModal(r.name, () => {
                                                    api.deleteSchemaSubject(r.name, false)
                                                        .then(async () => {
                                                            toast({
                                                                status: 'success', duration: 4000, isClosable: false,
                                                                title: 'Subject soft-deleted'
                                                            });
                                                            api.refreshSchemaSubjects(true);
                                                        })
                                                        .catch(err => {
                                                            toast({
                                                                status: 'error', duration: null, isClosable: true,
                                                                title: 'Failed to soft-delete subject',
                                                                description: String(err),
                                                            })
                                                        });
                                                })
                                            }

                                        }}>
                                        <TrashIcon />
                                    </Button>,
                                width: 1
                            },
                        ]}

                        observableSettings={uiSettings.schemaList}
                        rowClassName={(record) => record.isSoftDeleted ? 'hoverLink subjectSoftDeleted' : 'hoverLink'}
                        rowKey="name"
                        onRow={({ name }) => ({
                            onClick: () => appGlobal.history.push(`/schema-registry/subjects/${encodeURIComponent(name)}?version=latest`),
                        })}
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
