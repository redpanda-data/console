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
import { Select, Tooltip } from "antd";
import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Component } from "react";
import { api } from "../../../../state/backendApi";
import { CompressionType, EncodingType } from "../../../../state/restInterfaces";
import { Label } from "../../../../utils/tsxUtils";
import KowlEditor, { IStandaloneCodeEditor } from "../../../misc/KowlEditor";
import Tabs, { Tab } from "../../../misc/tabs/Tabs";
import HeadersEditor from "./Headers";

export type { Props as PublishMessageModalProps };
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

type EncodingOption = {
    value: EncodingType,
    label: string,
    tooltip: string, // React.ReactNode | (() => React.ReactNode),
};
const encodingOptions: EncodingOption[] = [
    { value: 'none', label: 'None (Tombstone)', tooltip: "Message value will be null" },
    { value: 'utf8', label: 'Text', tooltip: 'Text in the editor will be encoded to UTF-8 bytes' },
    { value: 'base64', label: 'Binary (Base64)', tooltip: 'Message value is binary, represented as a base64 string in the editor' },
    { value: 'json', label: 'JSON', tooltip: 'Syntax higlighting for JSON, otherwise the same as raw' }
];


@observer
export class PublishMessagesModalContent extends Component<Props> {
    availableCompressionTypes = Object.entries(CompressionType).map(([label, value]) => ({ label, value })).filter(t => t.value != CompressionType.Unknown);

    render() {
        return <div className="publishMessagesModal" >

            <div style={{ display: 'flex', gap: '1em', flexWrap: 'wrap' }}>
                <Label text='Topics'>
                    <Select style={{ minWidth: '300px' }}
                        mode='multiple'
                        allowClear showArrow showSearch
                        options={this.availableTopics}
                        value={this.props.state.topics}
                        onChange={action((v: string[]) => {
                            this.props.state.topics = v;
                            if (this.availablePartitions.length == 2) // auto + one partition
                                this.props.state.partition = 0; // partition 0
                            if (this.availablePartitions.length == 1)
                                this.props.state.partition = -1; // auto
                        })}
                    />
                </Label>

                <Label text='Partition'>
                    <Select style={{ minWidth: '140px' }}
                        disabled={this.availablePartitions.length <= 1}
                        options={this.availablePartitions}
                        value={this.props.state.partition}
                        onChange={(v, d) => {
                            this.props.state.partition = v;
                            console.log('selected partition change: ', { v: v, d: d });
                        }}
                    />
                </Label>

                <Label text='Compression Type'>
                    <Select style={{ minWidth: '160px' }}
                        options={this.availableCompressionTypes}
                        value={this.props.state.compressionType}
                        onChange={(v, d) => this.props.state.compressionType = v}
                    />
                </Label>

                <Label text="Type">
                    <Select<EncodingType> value={this.props.state.encodingType} onChange={e => this.props.state.encodingType = e} style={{ minWidth: '150px' }} virtual={false}>
                        {encodingOptions.map(x =>
                            <Select.Option key={x.value} value={x.value}>
                                <Tooltip overlay={x.tooltip} mouseEnterDelay={0} mouseLeaveDelay={0} placement='right'>
                                    <div>{x.label}</div>
                                </Tooltip>
                            </Select.Option>)}
                    </Select>
                </Label>
            </div>

            <Tabs tabs={this.tabs} defaultSelectedTabKey='value'
                wrapperStyle={{ marginTop: '1em', minHeight: '320px' }}
                tabButtonStyle={{ maxWidth: '150px' }}
                barStyle={{ marginBottom: '.5em' }}
                contentStyle={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}
            />
        </div>;
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

        const valueLanguage = (tab !== 'value' && r.encodingType === 'json')
            ? 'json'
            : undefined;

        if (tab === 'headers')
            return <><HeadersEditor items={r.headers} /></>

        if (tab === 'key')
            return <><KowlEditor key={tab} {...common} value={r.key} onChange={x => r.key = x ?? ''} /></>

        if (tab === 'value')
            return <><KowlEditor key={tab} {...common} value={r.value} onChange={x => r.value = x ?? ''} language={valueLanguage} /></>

        return <></>
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
            "editor.background": "#fcfcfc",
            "editor.foreground": "#ff0000",

            "editorGutter.background": "#00000018",

            "editor.lineHighlightBackground": "#aaaaaa20",
            "editor.lineHighlightBorder": "#00000000",
            "editorLineNumber.foreground": "#8c98a8",

            "scrollbarSlider.background": '#ff0000',
            // "editorOverviewRuler.border": "#0000",
            "editorOverviewRuler.background": "#606060",
            "editorOverviewRuler.currentContentForeground": "#ff0000"
            //         background: #0001;
            // border-left: 1px solid #0002;
        },
        rules: []
    })
    monaco.editor.setTheme('kowl');
}
