import { Col, Descriptions, Row, Select, Statistic, Table } from 'antd';
import Card from '../../misc/Card';
import { observer } from 'mobx-react';
import React from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { PageComponent, PageInitHelper } from '../Page';
import './Schema.Details.css';
import { DefaultSkeleton, Label } from '../../../utils/tsxUtils';
import { motion } from 'framer-motion';
import { animProps } from '../../../utils/animationProps';
import { KowlJsonView } from '../../misc/KowlJsonView';
import { sortField } from '../../misc/common';

const { Option } = Select;

export interface SchemaDetailsProps {
    subjectName: string;
    query: {
        version: number;
    };
}

function renderSchemaDataList(entries: string[][]) {
    return (
        <Descriptions bordered size="small" colon={true} layout="horizontal" column={1}>
            {entries
                .filter(([_, text]) => text !== undefined)
                .map(([label, text]) => (
                    <Descriptions.Item label={label}>{text}</Descriptions.Item>
                ))}
        </Descriptions>
    );
}

function renderOptions(options: number[] = []) {
    return options.map((option) => <Option value={option}>Version {option}</Option>);
}

@observer
class SchemaDetailsView extends PageComponent<SchemaDetailsProps> {
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

    componentDidUpdate({ query: { version } }: SchemaDetailsProps) {
        if (this.props.query.version !== version) {
            this.refreshData(true);
        }
    }

    render() {
        if (!api.SchemaDetails) return DefaultSkeleton;

        const {
            schemaId,
            schema: { type, name, namespace, doc, fields },
        } = api.SchemaDetails;
        return (
            <motion.div {...animProps} key={'b'} style={{ margin: '0 1rem' }}>
                <Card>
                    <Row>
                        <Statistic title="Subject Name" value={this.props.subjectName}></Statistic>
                        <Statistic title="Subject ID" value={schemaId}></Statistic>
                    </Row>
                </Card>
                <Card>
                    <Row gutter={[32, 8]}>
                        <Col span="24">
                            <span>
                                <Label text="Version">
                                    <Select defaultValue={this.props.query.version} onChange={(version) => appGlobal.history.push(`/schema-registry/${this.props.subjectName}?version=${version}`)}>
                                        {renderOptions(api.SchemaDetails?.registeredVersions)}
                                    </Select>
                                </Label>
                            </span>
                        </Col>
                    </Row>
                    <Row gutter={32}>
                            <KowlJsonView
                                src={api.SchemaDetails || {}}
                                style={{
                                    border: 'solid thin lightgray',
                                    borderRadius: '.25em',
                                    padding: '1em 1em 1em 2em',
                                    marginBottom: '1.5rem',
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
                                    { title: 'Name', dataIndex: 'name', className: 'whiteSpaceDefault', sorter: sortField('name') },
                                    { title: 'Type', dataIndex: 'type', className: 'whiteSpaceDefault', sorter: sortField('type') },
                                    { title: 'Default', dataIndex: 'default', className: 'whiteSpaceDefault' },
                                    { title: 'Documentation', dataIndex: 'doc', className: 'whiteSpaceDefault' },
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
            </motion.div>
        );
    }
}

export default SchemaDetailsView;
