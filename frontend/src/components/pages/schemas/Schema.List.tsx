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
import { Empty, } from 'antd';
import { appGlobal } from '../../../state/appGlobal';
import { sortField } from '../../misc/common';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { SchemaOverviewRequestError } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';

import './Schema.List.scss';
import SearchBar from '../../misc/SearchBar';
import { makeObservable, observable } from 'mobx';
import { KowlTable } from '../../misc/KowlTable';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { Alert, AlertIcon, Button, Checkbox, Flex } from '@redpanda-data/ui';
import { Statistic } from '../../misc/Statistic';

function renderRequestErrors(requestErrors?: SchemaOverviewRequestError[]) {
    if (!requestErrors || requestErrors.length === 0) {
        return null;
    }

    return (
        <Section>
            <div className="SchemaList__error-card">
                {requestErrors.map(({ errorMessage, requestDescription }, idx) => (
                    <Alert key={idx} marginTop="1em" status="error">
                        <AlertIcon />
                        <div>{errorMessage}</div>
                        <div>{requestDescription}</div>
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
                <Empty description={null}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h2>Not Configured</h2>

                        <p>
                            Schema Registry is not configured in Redpanda Console.
                            <br />
                            To view all registered schemas, their documentation and their versioned history simply provide the connection credentials in the Redpanda Console config.
                        </p>
                    </div>

                    {/* todo: fix link once we have a better guide */}
                    <a target="_blank" rel="noopener noreferrer" href="https://docs.redpanda.com/docs/manage/console/">
                        <Button variant="solid">Redpanda Console Config Documentation</Button>
                    </a>
                </Empty>
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
        //this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force?: boolean) {
        api.refreshSchemaOverview(force);
    }

    isFilterMatch(filterString: string, subject: { name: string }) {
        return subject.name.toLowerCase().includes(filterString.toLowerCase());
    }

    render() {
        const configRes = {compatibility:'BACKWARD'};
        const modeRes = {mode:'READWRITE'};

        const compatibility = configRes.compatibility;
        const mode = modeRes.mode;
        const subjects = [
            {
                name: 'com.shop.v1.avro.Address',
                isSoftDeleted: false
            },
            {
                name: 'com.shop.v1.avro.Customer',
                isSoftDeleted: false
            },
            {
                name: 'customer-value',
                isSoftDeleted: true
            },
            {
                name: 'owlshop-orders-protobuf-sr-value',
                isSoftDeleted: true
            },
            {
                name: 'shop/v1/address.proto',
                isSoftDeleted: false
            },
            {
                name: 'shop/v1/customer.proto',
                isSoftDeleted: false
            }
        ]

        if (subjects === undefined) return DefaultSkeleton; // request in progress
        if (false) return renderNotConfigured();
        // if (api.schemaOverviewIsConfigured === false) return renderNotConfigured(); // actually no data to display after successful request

        // const { mode, compatibilityLevel, requestErrors } = { ...api.schemaOverview };

        return (
            <PageContent key="b">
                <Section py={4}>
                    <Flex>
                        <Statistic title="Mode" value={mode}></Statistic>
                        <Statistic title="Compatibility Level" value={compatibility}></Statistic>
                    </Flex>
                </Section>

                {renderRequestErrors()}

                <SearchBar<{ name: string }>
                    dataSource={() => (subjects || []).map(str => ({ name: str.name }))}
                    isFilterMatch={this.isFilterMatch}
                    filterText={uiSettings.schemaList.quickSearch}
                    onQueryChanged={(filterText) => (uiSettings.schemaList.quickSearch = filterText)}
                    onFilteredDataChanged={data => this.filteredSchemaSubjects = data}
                />

                <Section>
                    <Flex justifyContent={'space-between'} pb={3}>
                        <Button>Create new schema</Button>
                        <Checkbox
                            isChecked={uiSettings.schemaList.showSoftDeleted}
                            onChange={(e) => {
                                uiSettings.schemaList.showSoftDeleted = e.target.checked
                            }}
                        >
                            Show soft-deleted
                        </Checkbox>
                    </Flex>

                    <KowlTable
                        dataSource={this.filteredSchemaSubjects ?? []}
                        columns={[
                            { title: 'Name', dataIndex: 'name', sorter: sortField('name'), defaultSortOrder: 'ascend' },
                        ]}

                        observableSettings={uiSettings.schemaList}

                        rowClassName={() => 'hoverLink'}
                        rowKey="name"
                        onRow={({ name }) => ({
                            onClick: () => appGlobal.history.push(`/schema-registry/subjects/${encodeURIComponent(name)}/versions/latest`),
                        })}
                    />
                </Section>
            </PageContent>
        );
    }
}

export default SchemaList;
