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
import { action, computed } from 'mobx';
import { observer } from 'mobx-react';
import { Component } from 'react';
import { api } from '../../../../state/backendApi';
import { CompressionType, EncodingType } from '../../../../state/restInterfaces';
import { Label } from '../../../../utils/tsxUtils';
import KowlEditor, { IStandaloneCodeEditor } from '../../../misc/KowlEditor';
import Tabs, { Tab } from '../../../misc/tabs/Tabs';
import HeadersEditor from './Headers';
import { Box, Flex, isMultiValue, Select, Tooltip } from '@redpanda-data/ui';
import { SingleSelect } from '../../../misc/Select';

type Props = {
    state: {
        topics: string[];
        partition: number;
        compressionType: CompressionType;

        encodingType: EncodingType;

        key: string;
        // keyEncoding?: EncodingType;

        value: string;
        // valueEncoding?: EncodingType;

        headers: { key: string; value: string; }[];
    }
};

export type { Props as PublishMessageModalProps };

type EncodingOption = {
    value: EncodingType,
    label: string,
    tooltip: string, // React.ReactNode | (() => React.ReactNode),
};
const encodingOptions: EncodingOption[] = [
    { value: 'none', label: 'None (Tombstone)', tooltip: 'Message value will be null' },
    { value: 'utf8', label: 'Text', tooltip: 'Text in the editor will be encoded to UTF-8 bytes' },
    { value: 'base64', label: 'Binary (Base64)', tooltip: 'Message value is binary, represented as a base64 string in the editor' },
    { value: 'json', label: 'JSON', tooltip: 'Syntax higlighting for JSON, otherwise the same as raw' }
];

@observer
export class PublishMessagesModalContent extends Component<Props> {
    availableCompressionTypes = Object.entries(CompressionType).map(([label, value]) => ({ label, value })).filter(t => t.value != CompressionType.Unknown);

    render() {
        return (
            <Flex gap={4} flexDirection="column">
                <Box>
                    <Label text="Topics">
                        <Select<string>
                            isMulti
                            // TODO - change type of value to only contain values instead of objects with labels
                            value={this.props.state.topics.map((name) => ({
                                label: name,
                                value: name,
                            }))}
                            options={this.availableTopics}
                            onChange={action((v) => {
                                // TODO - improve TS support to take isMulti into account
                                if (isMultiValue(v)) {
                                    this.props.state.topics = v.map(({value}) => value);
                                    if (this.availablePartitions.length == 2) {
                                        // auto + one partition
                                        this.props.state.partition = 0; // partition 0
                                    }
                                    if (this.availablePartitions.length == 1) {
                                        this.props.state.partition = -1; // auto
                                    }
                                }
                            })}
                        />
                    </Label>
                </Box>

                <Flex gap={4} flexWrap="wrap">

                    <Box width={160}>
                        <Label text="Partition">
                            <SingleSelect
                                options={this.availablePartitions}
                                value={this.props.state.partition}
                                onChange={(v) => {
                                    this.props.state.partition = v;
                                }}
                            />
                        </Label>
                    </Box>

                    <Box width={180}>
                        <Label text="Compression Type">
                            <SingleSelect<CompressionType>
                                options={this.availableCompressionTypes}
                                value={this.props.state.compressionType}
                                onChange={(v) => (this.props.state.compressionType = v)}
                            />
                        </Label>
                    </Box>

                    <Box width={160}>
                        <Label text="Type">
                            <SingleSelect<EncodingType> options={encodingOptions.map(x => ({
                                label: (
                                    <Tooltip label={x.tooltip} placement="right" hasArrow>
                                        {x.label}
                                    </Tooltip>
                                ),
                                value: x.value
                            }))} value={this.props.state.encodingType} onChange={e => (this.props.state.encodingType = e)} />
                        </Label>
                    </Box>
                </Flex>

                <Tabs tabs={this.tabs} defaultSelectedTabKey="value" />
            </Flex>
        );
    }

    @computed get availableTopics() {
        return api.topics?.map(t => ({ value: t.topicName })) ?? [];
    }

    @computed get availablePartitions() {
        const partitions: { label: string, value: number; }[] = [
            { label: 'Auto (CRC32)', value: -1 },
        ];

        if (this.props.state.topics.length != 1) {
            // multiple topics, must use 'auto'
            return partitions;
        }

        const count = api.topics?.first(t => t.topicName == this.props.state.topics[0])?.partitionCount;
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
        const common = { path: tab, onMount: setTheme } as EditorProps;
        const r = this.props.state;

        const valueLanguage = (r.encodingType === 'json')
            ? 'json'
            : undefined;

        let result = <></>

        if (tab === 'headers')
            result = <><HeadersEditor items={r.headers} /></>

        if (tab === 'key')
            result = <><KowlEditor key={tab} {...common} value={r.key} onChange={x => r.key = x ?? ''} /></>

        if (tab === 'value')
            result = <><KowlEditor key={tab} {...common} value={r.value} onChange={x => r.value = x ?? ''} language={valueLanguage} /></>

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
