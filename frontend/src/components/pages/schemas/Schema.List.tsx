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
import { Alert, Button, Empty, Row, Statistic, Table } from 'antd';
import Card from '../../misc/Card';
import { appGlobal } from '../../../state/appGlobal';
import { motion } from 'framer-motion';
import { animProps } from '../../../utils/animationProps';
import { makePaginationConfig, sortField } from '../../misc/common';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { SchemaOverviewRequestError } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';

import './Schema.List.scss';
import SearchBar from '../../misc/SearchBar';
import { makeObservable, observable } from 'mobx';
import { KowlTable } from '../../misc/KowlTable';

function renderRequestErrors(requestErrors?: SchemaOverviewRequestError[]) {
    if (!requestErrors || requestErrors.length === 0) {
        return null;
    }

    return (
        <Card className="SchemaList__error-card">
            {requestErrors.map(({ errorMessage, requestDescription }) => (
                <Alert type="error" message={errorMessage} description={requestDescription} closable className="SchemaList__alert" />
            ))}
        </Card>
    );
}

function renderNotConfigured() {
    return (
        <motion.div {...animProps} key={'b'} style={{ margin: '0 1rem' }}>
            <Card style={{ padding: '2rem 2rem', paddingBottom: '3rem' }}>
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
                    <a target="_blank" rel="noopener noreferrer" href="https://github.com/redpanda-data/console/blob/master/docs/config/kowl.yaml">
                        <Button type="primary">Redpanda Console Config Documentation</Button>
                    </a>
                </Empty>
            </Card>
        </motion.div>
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
        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force?: boolean) {
        api.refreshSchemaOverview(force);
    }

    isFilterMatch(filterString: string, subject: { name: string }) {
        return subject.name.toLowerCase().includes(filterString.toLowerCase());
    }

    render() {
        if (api.schemaOverview === undefined) return DefaultSkeleton; // request in progress
        if (api.schemaOverview === null || api.schemaOverviewIsConfigured === false) return renderNotConfigured(); // actually no data to display after successful request

        const { mode, compatibilityLevel, requestErrors } = { ...api.schemaOverview };

        return (
            <motion.div {...animProps} key={'b'} style={{ margin: '0 1rem' }}>
                <Card>
                    <Row>
                        <Statistic title="Mode" value={mode}></Statistic>
                        <Statistic title="Compatibility Level" value={compatibilityLevel}></Statistic>
                    </Row>
                </Card>
                {renderRequestErrors(requestErrors)}
                <Card>
                    <SearchBar<{ name: string }>
                        dataSource={() => (api.schemaOverview?.subjects || []).map(str => ({ name: str }))}
                        isFilterMatch={this.isFilterMatch}
                        filterText={uiSettings.schemaList.quickSearch}
                        onQueryChanged={(filterText) => (uiSettings.schemaList.quickSearch = filterText)}
                        onFilteredDataChanged={data => this.filteredSchemaSubjects = data}
                    />

                    <KowlTable
                        dataSource={this.filteredSchemaSubjects ?? []}
                        columns={[
                            { title: 'Name', dataIndex: 'name', sorter: sortField('name'), defaultSortOrder: 'ascend' },
                            // { title: 'Compatibility Level', dataIndex: 'compatibilityLevel', sorter: sortField('compatibilityLevel'), width: 150 },
                            // { title: 'Versions', dataIndex: 'versionsCount', sorter: sortField('versionsCount'), width: 80 },
                            // { title: 'Latest Version', dataIndex: 'latestVersion', sorter: sortField('versionsCount'), width: 80 },
                        ]}

                        observableSettings={uiSettings.schemaList}

                        rowClassName={() => 'hoverLink'}
                        rowKey="name"
                        onRow={({ name }) => ({
                            onClick: () => appGlobal.history.push(`/schema-registry/${name}`),
                        })}
                    />
                </Card>
            </motion.div>
        );
    }
}

export default SchemaList;
