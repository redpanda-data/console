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

import { EditorProps, Monaco } from '@monaco-editor/react';
import { Select } from 'antd';
import { computed } from 'mobx';
import { observer } from 'mobx-react';
import { Component } from 'react';
import { api } from '../../../../state/backendApi';
import { Label } from '../../../../utils/tsxUtils';
import KowlEditor, { IStandaloneCodeEditor } from '../../../misc/KowlEditor';
import Tabs, { Tab } from '../../../misc/tabs/Tabs';
import HeadersEditor from './Headers';
import { Box, Flex, Heading, Tooltip } from '@redpanda-data/ui';
import { titleCase } from '../../../../utils/utils';
import { CompressionType, PayloadEncoding } from '../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { proto3 } from '@bufbuild/protobuf';

type PayloadOptions = {
    encoding: PayloadEncoding | 'base64';
    data: string;

    // Schema name
    schemaName?: string;
    schemaVersion?: number;
    schemaId?: number;

    protobufIndex?: number; // if encoding is protobuf, we also need an index
}

type Props = {
    state: {
        topic: string;
        partition: number;
        compressionType: CompressionType;

        headers: { key: string; value: string; }[];

        key: PayloadOptions;
        value: PayloadOptions;
    }
};

export type { Props as PublishMessageModalProps };



@observer
export class PublishMessagesModalContent extends Component<Props> {
    compressionTypes = proto3.getEnumType(CompressionType).values
        // .filter(x => x.no != CompressionType.UNSPECIFIED)
        .map(x => ({ label: x.localName, value: x.no as CompressionType }))

    render() {
        return (
            <div className="publishMessagesModal">
                <div style={{ display: 'flex', gap: '1em', flexWrap: 'wrap' }}>
                    {/* <Label text="Topics">
                        <Select
                            style={{ minWidth: '300px' }}
                            mode="multiple"
                            allowClear
                            showArrow
                            showSearch
                            options={this.availableTopics}
                            value={this.props.state.topics}
                            onChange={action((v: string[]) => {
                                this.props.state.topics = v;
                                if (this.availablePartitions.length == 2)
                                    // auto + one partition
                                    this.props.state.partition = 0; // partition 0
                                if (this.availablePartitions.length == 1) this.props.state.partition = -1; // auto
                            })}
                        />
                    </Label> */}

                    <Label text="Partition">
                        <Select
                            style={{ minWidth: '140px' }}
                            disabled={this.availablePartitions.length <= 1}
                            options={this.availablePartitions}
                            value={this.props.state.partition}
                            onChange={(v, d) => {
                                this.props.state.partition = v;
                                console.log('selected partition change: ', { v: v, d: d });
                            }}
                        />
                    </Label>

                    <Label text="Compression Type">
                        <Select
                            style={{ minWidth: '160px' }}
                            options={this.compressionTypes}
                            value={this.props.state.compressionType}
                            onChange={v => (this.props.state.compressionType = v)}
                        />
                    </Label>
                </div>

                <Tabs tabs={this.tabs} defaultSelectedTabKey="value" />
            </div>
        );
    }

    @computed get availableTopics() {
        return api.topics?.map(t => ({ value: t.topicName })) ?? [];
    }

    @computed get availablePartitions() {
        const partitions: { label: string, value: number; }[] = [
            { label: 'Auto (CRC32)', value: -1 },
        ];

        const count = api.topics?.first(t => t.topicName == this.props.state.topic)?.partitionCount;
        if (count == undefined) {
            // topic not found
            return partitions;
        }

        if (count == 1) {
            // only one partition to select
            return partitions;
        }

        for (let i = 0; i < count; i++) {
            partitions.push({ label: `Partition ${i}`, value: i });
        }

        return partitions;
    }

    renderEditor(tab: 'headers' | 'key' | 'value') {
        const r = this.props.state;

        let result = <></>

        if (tab === 'headers')
            result = <><HeadersEditor items={r.headers} /></>
        else
            result = <>
                <MessagePayloadEditor
                    title={titleCase(tab)}
                    payload={tab == 'key' ? r.key : r.value}
                />
            </>


        // wrapperStyle={{ marginTop: '1em', minHeight: '320px' }}
        // tabButtonStyle={{ maxWidth: '150px' }}
        // barStyle={{ marginBottom: '.5em' }}
        // contentStyle={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}
        result = <Box display="flex" flexDirection="column" flexGrow={1} minHeight="320px">
            {result}
        </Box>

        return result;
    }

    tabs: Tab[] = [
        { key: 'headers', title: 'Headers', content: () => this.renderEditor('headers') },
        { key: 'key', title: 'Key', content: () => this.renderEditor('key') },
        { key: 'value', title: 'Value', content: () => this.renderEditor('value') }
    ];
}


function encodingToLanguage(encoding: PayloadEncoding | 'base64') {
    if (encoding == PayloadEncoding.AVRO) return 'json';
    if (encoding == PayloadEncoding.JSON) return 'json';
    if (encoding == PayloadEncoding.PROTOBUF) return 'protobuf';
    return undefined;
}


const MessagePayloadEditor = observer((p: {
    title: string,
    payload: PayloadOptions,
}) => {

    const payload = p.payload;


    return <Flex>
        <Heading>{p.title}</Heading>

        <Box>
            <Label text="Type">
                <Select<PayloadEncoding | 'base64'>
                    value={payload.encoding}
                    onChange={e => payload.encoding = e}
                    style={{ minWidth: '150px' }}
                    virtual={false}
                >
                    {encodingOptions.map(x => (
                        <Select.Option key={x.value} value={x.value}>
                            <Tooltip label={x.tooltip} placement="right" hasArrow>
                                <div>{x.label}</div>
                            </Tooltip>
                        </Select.Option>
                    ))}
                </Select>
            </Label>

            <Label text="Schema">
                <div>placeholder</div>

            </Label>
        </Box>


        <KowlEditor
            key={p.title}
            {...{ path: p.title, onMount: setTheme } as EditorProps}
            value={payload.data}
            onChange={x => payload.data = x ?? ''}
            language={encodingToLanguage(payload.encoding)}
        />
    </Flex>
});

type EncodingOption = {
    value: PayloadEncoding | 'base64',
    label: string,
    tooltip: string, // React.ReactNode | (() => React.ReactNode),
};
const encodingOptions: EncodingOption[] = [
    { value: PayloadEncoding.NULL, label: 'Null', tooltip: 'Message value will be null' },
    { value: PayloadEncoding.TEXT, label: 'Text', tooltip: 'Text in the editor will be encoded to UTF-8 bytes' },
    { value: PayloadEncoding.JSON, label: 'JSON', tooltip: 'Syntax higlighting for JSON, otherwise the same as text' },

    { value: PayloadEncoding.AVRO, label: 'Avro', tooltip: 'The given JSON will be serialized using the selected schema' },
    { value: PayloadEncoding.PROTOBUF, label: 'Protobuf', tooltip: 'The given JSON will be serialized using the selected schema' },

    { value: 'base64', label: 'Binary (Base64)', tooltip: 'Message value is binary, represented as a base64 string in the editor' },
];

function setTheme(editor: IStandaloneCodeEditor, monaco: Monaco) {
    monaco.editor.defineTheme('kowl', {
        base: 'vs',
        inherit: true,
        colors: {
            'editor.background': '#fcfcfc',
            'editor.foreground': '#ff0000',

            'editorGutter.background': '#00000018',

            'editor.lineHighlightBackground': '#aaaaaa20',
            'editor.lineHighlightBorder': '#00000000',
            'editorLineNumber.foreground': '#8c98a8',

            'scrollbarSlider.background': '#ff0000',
            // "editorOverviewRuler.border": "#0000",
            'editorOverviewRuler.background': '#606060',
            'editorOverviewRuler.currentContentForeground': '#ff0000'
            //         background: #0001;
            // border-left: 1px solid #0002;
        },
        rules: []
    })
    monaco.editor.setTheme('kowl');
}
