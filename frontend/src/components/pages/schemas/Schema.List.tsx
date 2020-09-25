import React from 'react';
import { observer } from 'mobx-react';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { Row, Statistic, Table } from 'antd';
import Card from '../../misc/Card';
import { appGlobal } from '../../../state/appGlobal';
import { motion } from 'framer-motion';
import { animProps } from '../../../utils/animationProps';
import { sortField } from '../../misc/common';

@observer
class SchemaList extends PageComponent<{}> {
    initPage(p: PageInitHelper): void {
        p.title = 'Schema Registry';
        p.addBreadcrumb('Schema Registry', '/schema-registry');
        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true)
    }
    refreshData(force?: boolean) {
        api.refreshSchemaOverview(force);
    }
    render() {
        const { mode, compatibilityLevel, subjects} = {...api.SchemaOverview}
        return (
            <motion.div {...animProps} key={'b'} style={{ margin: '0 1rem' }}>
                <Card>
                    <Row>
                        <Statistic title="Mode" value={mode}></Statistic>
                        <Statistic title="Compatibility Level" value={compatibilityLevel}></Statistic>
                    </Row>
                </Card>
                <Card>
                    <Table
                        // TODO: display any request errors
                        // TODO: quick search?
                        size="middle"
                        onRow={({ name, latestVersion}) => ({
                            onClick: () => appGlobal.history.push(`/schema-registry/${name}?version=${latestVersion}`)
                        })}
                        rowClassName={() => 'hoverLink'}
                        columns={[
                            { title: 'Name', dataIndex: 'name', sorter: sortField('name'), defaultSortOrder: 'ascend' },
                            { title: 'Compatibility Level', dataIndex: 'compatibilityLevel', sorter: sortField('compatibilityLevel'), width: 150 },
                            { title: 'Versions', dataIndex: 'versionsCount', sorter: sortField('versionsCount'), width: 80 },
                            { title: 'Latest Version', dataIndex: 'latestVersion', sorter: sortField('versionsCount'), width: 80 },
                        ]}
                        dataSource={subjects}
                        // TODO: Useful pagination settings
                        pagination={false}
                    ></Table>
                </Card>
            </motion.div>
        );
    }
}

export default SchemaList;
