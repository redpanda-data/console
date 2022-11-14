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

import React from 'react';
import { Button, message, Row, Select, Statistic, Table, Tag, Tooltip } from 'antd';
import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { PageComponent, PageInitHelper } from '../Page';
import { DefaultSkeleton, Label, OptionGroup, toSafeString } from '../../../utils/tsxUtils';
import { KowlJsonView } from '../../misc/KowlJsonView';
import { JsonField, JsonFieldType, JsonSchema, Schema, SchemaField, SchemaType } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { ClipboardCopyIcon } from '@heroicons/react/outline';
import { NoClipboardPopover } from '../../misc/NoClipboardPopover';
import { isClipboardAvailable } from '../../../utils/featureDetection';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';

export interface SchemaDetailsProps {
    subjectName: string;
    query: {
        version: number;
    };
}

function renderSchemaType(value: any, _record: SchemaField, _index: number) {
    return toSafeString(value);
}

function convertJsonField(name: string, field: JsonField): SchemaField {

    switch (field.type) {
        case JsonFieldType.ARRAY: {
            let items = undefined;
            if (field.items) {
                const jsonField = convertJsonField(name, field.items);
                items = jsonField.type;
            }

            return {
                name,
                type: {
                    type: field.type,
                    items,
                }
            };
        }
        case JsonFieldType.OBJECT: {
            let fields: Record<string, unknown> | undefined = undefined;
            if (field.properties) {
                fields = {};
                for (const name in field.properties) {
                    const jsonField = convertJsonField(name, field.properties[name]);
                    fields[name] = jsonField.type;
                }
            }
            return {
                name,
                type: {
                    type: field.type,
                    properties: field.properties
                }
            };
        }
        case undefined: {
            if (field.properties) {
                return convertJsonField(name, { ...field, type: JsonFieldType.OBJECT });
            }
            if (field.items) {
                return convertJsonField(name, { ...field, type: JsonFieldType.ARRAY });
            }
            break;
        }
        default: {
            break;
        }
    }
    return {
        name,
        type: field.type,
    };
}

@observer
class SchemaDetailsView extends PageComponent<SchemaDetailsProps> {
    subjectNameRaw: string;
    subjectNameEncoded: string;

    initPage(p: PageInitHelper): void {
        const subjectNameRaw = decodeURIComponent(this.props.subjectName);
        const subjectNameEncoded = encodeURIComponent(subjectNameRaw);
        const version = this.props.query.version;

        p.title = subjectNameRaw;
        p.addBreadcrumb('Schema Registry', '/schema-registry');
        p.addBreadcrumb(subjectNameRaw, `/schema-registry/${subjectNameEncoded}?version=${version}`);
        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    constructor(p: any) {
        super(p);
        this.subjectNameRaw = decodeURIComponent(this.props.subjectName);
        this.subjectNameEncoded = encodeURIComponent(this.subjectNameRaw);
        console.log('constructing details', { props: p, raw: this.subjectNameRaw, enc: this.subjectNameEncoded });
    }

    refreshData(force?: boolean) {
        const encoded = encodeURIComponent(decodeURIComponent(this.props.subjectName))
        const version: number | 'latest' = this.props.query.version ?? 'latest';
        api.refreshSchemaDetails(encoded, version, force);
    }

    componentDidUpdate({ query: { version } }: SchemaDetailsProps) {
        if (this.props.query.version !== version) {
            this.refreshData(true);
        }
    }

    render() {
        const schemaDetails = api.schemaDetails;
        if (!schemaDetails) return DefaultSkeleton;

        const {
            schemaId,
            version,
            compatibility,
            type: schemaType,
            schema,
            rawSchema
        } = schemaDetails;

        let { type, name, namespace, doc, fields } = schema as Schema;
        if (schemaType === SchemaType.JSON) {
            const jsonSchema = schema as JsonSchema;
            ({ type, title: name, description: doc, $id: namespace } = jsonSchema);
            fields = [];
            if (jsonSchema.properties) {
                for (const p in jsonSchema.properties) {
                    const property = jsonSchema.properties[p];
                    fields.push(convertJsonField(p, property));
                }
            }
        }

        // Create the object that will be shown in the JSON Viewer
        // From this new "display object" we can remove the 'rawSchema' that we added
        const jsonViewObject = Object.assign({}, schemaDetails);
        delete (jsonViewObject as any)['rawSchema'];

        const versions = schemaDetails.registeredVersions ?? [];
        const defaultVersion = this.props.query.version ?? (versions.length > 0 ? versions[versions.length - 1] : 'latest');

        return (
            <PageContent key="b">
                <Section py={4}>
                    <Row>
                        <Statistic title="Type" value={schemaType}></Statistic>
                        <Statistic title="Subject" value={this.subjectNameRaw}></Statistic>
                        <Statistic title="Schema ID" value={schemaId}></Statistic>
                        <Statistic title="Version" value={version}></Statistic>
                        <Statistic title="Compatibility" value={compatibility.toLowerCase()} style={{ textTransform: 'capitalize' }}></Statistic>
                    </Row>
                </Section>

                <Section>
                    <div style={{ display: 'flex', alignItems: 'flex-start', columnGap: '1.5em', marginBottom: '1em' }}>
                        <Label text="Version">
                            <Select style={{ minWidth: '200px' }}
                                defaultValue={defaultVersion}
                                onChange={(version) => appGlobal.history.push(`/schema-registry/${this.subjectNameEncoded}?version=${version}`)}
                                disabled={versions.length == 0}
                            >
                                {versions.map(v => <Select.Option value={v} key={v}>Version {v} {v == versions[versions.length - 1] ? '(latest)' : null}</Select.Option>)}
                            </Select>
                        </Label>

                        <Label text="Details" style={{ alignSelf: 'stretch' }}>
                            <div style={{ display: 'inline-flex', flexWrap: 'wrap', minHeight: '32px', alignItems: 'center', rowGap: '.3em' }}>
                                {Object.entries({
                                    'Type': type,
                                    'Name': name,
                                    'Namespace': namespace,
                                }).map(([k, v]) => {
                                    if (!k || v === undefined || v === null) return null;
                                    return <Tag color="blue" key={k}><span style={{ color: '#2d5b86' }}>{k}:</span> {toSafeString(v)}</Tag>
                                })}
                                {!!doc && <a href={doc}>
                                    <Tag color="blue" style={{ cursor: 'pointer' }}><span style={{ color: '#2d5b86' }}>Documentation:</span> <a style={{ textDecoration: 'underline' }} href={doc}>{doc}</a></Tag>
                                </a>}
                            </div>

                        </Label>
                    </div>

                    <div style={{ marginBottom: '1.5em', display: 'flex', gap: '1em' }}>
                        <OptionGroup label=""
                            options={{
                                'Show Fields': 'fields',
                                'Show JSON': 'json',
                            }}
                            value={uiSettings.schemaDetails.viewMode}
                            onChange={s => uiSettings.schemaDetails.viewMode = s}
                        />

                        <NoClipboardPopover placement="top">
                            <div> {/* the additional div is necessary because popovers do not trigger on disabled elements, even on hover */}
                                <Tooltip overlay="Copy raw JSON to clipboard">
                                    <Button
                                        disabled={!isClipboardAvailable}
                                        icon={<ClipboardCopyIcon style={{ width: '18px', color: '#555' }} />}
                                        onClick={() => {
                                            navigator.clipboard.writeText(rawSchema);
                                            message.success('Schema copied to clipboard', 1.2);
                                        }}
                                    />
                                </Tooltip>
                            </div>
                        </NoClipboardPopover>

                    </div>

                    <div>
                        {uiSettings.schemaDetails.viewMode == 'json' &&
                            <KowlJsonView
                                shouldCollapse={false}
                                collapsed={false}
                                src={jsonViewObject}
                                style={{
                                    border: 'solid thin lightgray',
                                    borderRadius: '.25em',
                                    padding: '1em 1em 1em 2em',
                                    marginBottom: '1.5rem',
                                }}
                            />
                        }

                        {uiSettings.schemaDetails.viewMode == 'fields' &&
                            <Table
                                size="small"
                                columns={[
                                    { title: 'Name', dataIndex: 'name', className: 'whiteSpaceDefault', }, // sorter: sortField('name')
                                    { title: 'Type', dataIndex: 'type', className: 'whiteSpaceDefault', render: renderSchemaType }, //  sorter: sortField('type'),
                                    { title: 'Default', dataIndex: 'default', className: 'whiteSpaceDefault' },
                                    { title: 'Documentation', dataIndex: 'doc', className: 'whiteSpaceDefault' },
                                ]}
                                rowKey="name"
                                dataSource={fields}
                                pagination={false}
                                style={{
                                    maxWidth: '100%',
                                    marginTop: '1.5rem',
                                    marginBottom: '1.5rem',
                                }}
                            />
                        }

                    </div>
                </Section>
            </PageContent>
        );
    }
}

export default SchemaDetailsView;

