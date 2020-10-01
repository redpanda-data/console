import React, { RefObject } from 'react';
import { observer } from 'mobx-react';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { Alert, Empty, Row, Statistic, Table } from 'antd';
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
        if (!api.SchemaOverview) return DefaultSkeleton;
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
