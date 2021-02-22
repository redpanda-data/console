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
import { observable } from 'mobx';

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
                            Schema Registry is not configured in Kowl.
                            <br />
                            To view all registered schemas, their documentation and their versioned history simply provide the connection credentials in the Kowl config.
                        </p>
                    </div>

                    {/* todo: fix link once we have a better guide */}
                    <a target="_blank" rel="noopener noreferrer" href="https://github.com/cloudhut/kowl/blob/master/docs/config/kowl.yaml">
                        <Button type="primary">Kowl Config Documentation</Button>
                    </a>
                </Empty>
            </Card>
        </motion.div>
    );
}

@observer
class SchemaList extends PageComponent<{}> {
    paginationConfig = makePaginationConfig(uiSettings.schemaList.pageSize);
    @observable searchBar: RefObject<SearchBar<any>> = React.createRef();
    @observable filteredSchemaSubjects: { name: string }[];

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

        // todo: what if there are lets say 5 schemas, but all we got was 5 entries in 'requestErrors' instead?
        if (api.schemaOverview.subjects.length <= 0) return <Empty />;

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

                    <Table
                        size="middle"
                        rowClassName={() => 'hoverLink'}
                        rowKey="name"
                        onRow={({ name }) => ({
                            onClick: () => appGlobal.history.push(`/schema-registry/${name}`),
                        })}
                        columns={[
                            { title: 'Name', dataIndex: 'name', sorter: sortField('name'), defaultSortOrder: 'ascend' },
                            // { title: 'Compatibility Level', dataIndex: 'compatibilityLevel', sorter: sortField('compatibilityLevel'), width: 150 },
                            // { title: 'Versions', dataIndex: 'versionsCount', sorter: sortField('versionsCount'), width: 80 },
                            // { title: 'Latest Version', dataIndex: 'latestVersion', sorter: sortField('versionsCount'), width: 80 },
                        ]}
                        dataSource={this.filteredSchemaSubjects ?? []}
                        pagination={this.paginationConfig}
                        onChange={(pagination) => {
                            if (pagination.pageSize) uiSettings.schemaList.pageSize = pagination.pageSize;
                            this.paginationConfig.current = pagination.current;
                            this.paginationConfig.pageSize = pagination.pageSize;
                        }}
                    ></Table>
                </Card>
            </motion.div>
        );
    }
}

export default SchemaList;
