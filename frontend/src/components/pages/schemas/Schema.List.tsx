import React from 'react';
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
import { SchemaOverviewRequestError } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';

import './Schema.List.scss';

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

    initPage(p: PageInitHelper): void {
        p.title = 'Schema Registry';
        p.addBreadcrumb('Schema Registry', '/schema-registry');
        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }
    refreshData(force?: boolean) {
        api.refreshSchemaOverview(force);
    }
    render() {
        if (!api.SchemaOverview) return DefaultSkeleton;

        const { mode, compatibilityLevel, subjects, requestErrors } = { ...api.SchemaOverview };

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
                    {subjects.length === 0 ? (
                        <Empty />
                    ) : (
                        <Table
                            // TODO: quick search?
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
                            dataSource={subjects}
                            pagination={this.paginationConfig}
                            onChange={(pagination) => {
                                if (pagination.pageSize) uiSettings.schemaList.pageSize = pagination.pageSize;
                                this.paginationConfig.current = pagination.current;
                                this.paginationConfig.pageSize = pagination.pageSize;
                            }}
                        ></Table>
                    )}
                </Card>
            </motion.div>
        );
    }
}

export default SchemaList;
