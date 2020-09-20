import { Card, Col, PageHeader, Row, Table } from 'antd';
import { observer } from 'mobx-react';
import React from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { PageComponent, PageInitHelper } from '../Page';
import ReactJson from 'react-json-view';
import './Schema.Details.css';

export interface SchemaDetailsProps {
    subjectName: string;
    query: {
        version: number;
    };
}

function renderSchemaDataList(entries: string[][]) {
    return (
        <dl>
            {entries.map(([key, value]) => (
                <div>
                    <dt className="schemaDataTerm">{key}</dt>
                    <dd className="schemaDataDefinition">{value}</dd>
                </div>
            ))}
        </dl>
    );
}

@observer
class SchemaDetails extends PageComponent<SchemaDetailsProps> {
    initPage(p: PageInitHelper): void {
        const {
            subjectName,
            query: { version },
        } = this.props;
        p.title = subjectName;
        p.addBreadcrumb('Schema Registry', '/schema-registry');
        p.addBreadcrumb(subjectName, `/schema-registry/${subjectName}?version=${version}`);
        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force?: boolean) {
        api.refreshSchemaDetails(this.props.subjectName, this.props.query.version, force);
    }

    render() {
        // TODO: version chooser
        // TODO: crud / edit actions already available?
        // TODO: handle schema details null better than now
        const {
            schemaId,
            schema: { type = '', name = '', namespace = '', doc = '', fields = [] },
        } = api.SchemaDetails || { schema: {} };
        return (
            <>
                <PageHeader title={this.props.subjectName} />
                <Card>
                    <p>
                        Subject ID: <strong>{schemaId}</strong>
                    </p>
                    <Row gutter={32}>
                        <Col span="12">
                            <ReactJson
                                src={api.SchemaDetails || {}}
                                style={{
                                    border: 'solid thin lightgray',
                                    borderRadius: '.25em',
                                    padding: '1em 1em 1em 2em',
                                }}
                            />
                        </Col>
                        <Col span="12">
                            {renderSchemaDataList([
                                ['type', type],
                                ['name', name],
                                ['namespace', namespace],
                                ['doc', doc],
                            ])}
                            <Table
                                columns={[
                                    { title: 'Name', dataIndex: 'name' },
                                    { title: 'Type', dataIndex: 'type' },
                                    { title: 'Default', dataIndex: 'default' },
                                    { title: 'Documentation', dataIndex: 'doc' }
                                ]}
                                dataSource={fields}
                                pagination={false}
                                style={{
                                    maxWidth: '100%'
                                }}
                            ></Table>
                        </Col>
                    </Row>
                </Card>
            </>
        );
    }
}

export default SchemaDetails;
