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
import { SchemaOverviewRequestError, SchemaSubject } from '../../../state/restInterfaces';
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
    return <motion.div {...animProps} key={'b'} style={{ margin: '0 1rem' }}>
        <Card style={{ padding: '3rem 2rem' }}>
            <Empty description={<>
                <span>
                    <h2>Not Configured</h2>

                    <p>Kowl has not been configured to connect to any schema registry yet.</p>

                    <p>
                        In in massa non arcu malesuada venenatis in et elit. Praesent finibus, nunc eu bibendum molestie,<br />
                    elit nulla auctor velit, eget placerat nunc lacus ut enim. Proin nec bibendum diam.
                 </p>
                </span>
            </>}>
                {/* todo: fix link once we have a better guide */}
                <a target="_blank" rel="noopener noreferrer" href="https://github.com/cloudhut/kowl/blob/master/docs/config/kowl.yaml">
                    <Button type="primary">
                        Schema Config Documentation
                </Button>
                </a>
            </Empty>
        </Card>
    </motion.div>
}

@observer
class SchemaList extends PageComponent<{}> {
    paginationConfig = makePaginationConfig(uiSettings.schemaList.pageSize);
    @observable searchBar: RefObject<SearchBar<SchemaSubject>> = React.createRef();

    initPage(p: PageInitHelper): void {
        p.title = 'Schema Registry';
        p.addBreadcrumb('Schema Registry', '/schema-registry');
        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force?: boolean) {
        api.refreshSchemaOverview(force);
    }

    isFilterMatch(filterString: string, subject: SchemaSubject) {
        return subject.name.includes(filterString);
    }

    render() {
        if (api.SchemaOverview === undefined) return DefaultSkeleton; // request in progress
        if (api.SchemaOverview === null || api.SchemaOverviewIsConfigured === false)
            return renderNotConfigured(); // actually no data to display after successful request

        // todo: what if there are lets say 5 schemas, but all we got was 5 entries in 'requestErrors' instead?
        if (api.SchemaOverview.subjects.length <= 0) return <Empty />

        const { mode, compatibilityLevel, requestErrors } = { ...api.SchemaOverview };

        const subjects = this.searchBar.current ? this.searchBar.current.data : ([] as SchemaSubject[]);

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
                    <SearchBar<SchemaSubject> dataSource={() => api.SchemaOverview?.subjects || []} ref={this.searchBar} isFilterMatch={this.isFilterMatch} />

                    <Table
                        size="middle"
                        onRow={({ name, latestVersion }) => ({
                            onClick: () => appGlobal.history.push(`/schema-registry/${name}?version=${latestVersion}`),
                        })}
                        rowClassName={() => 'hoverLink'}
                        columns={[
                            { title: 'Name', dataIndex: 'name', sorter: sortField('name'), defaultSortOrder: 'ascend' },
                            { title: 'Compatibility Level', dataIndex: 'compatibilityLevel', sorter: sortField('compatibilityLevel'), width: 150 },
                            { title: 'Versions', dataIndex: 'versionsCount', sorter: sortField('versionsCount'), width: 80 },
                            { title: 'Latest Version', dataIndex: 'latestVersion', sorter: sortField('versionsCount'), width: 80 },
                        ]}
                        rowKey="name"
                        dataSource={subjects}
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
