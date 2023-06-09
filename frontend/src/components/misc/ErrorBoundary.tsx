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

import React, { CSSProperties } from 'react';
import { observer } from 'mobx-react';
import { makeObservable, observable } from 'mobx';
import { toJson } from '../../utils/jsonUtils';
import { Layout, message, Space } from 'antd';
import { CopyOutlined, CloseOutlined } from '@ant-design/icons';
import { envVarDebugAr } from '../../utils/env';
import { NoClipboardPopover } from './NoClipboardPopover';
import { isClipboardAvailable } from '../../utils/featureDetection';
import { ObjToKv } from '../../utils/tsxUtils';
import StackTrace from 'stacktrace-js';
import { Button, Icon } from '@redpanda-data/ui';

const { Content } = Layout;

// background       rgb(35, 35, 35)
// div              rgba(206, 17, 38, 0.1)
// title            rgb(232, 59, 70)
// foreground
//    - main        rgb(252, 207, 207)
//    - highligh    rgb(204, 102, 102)
//    - secondary   rgb(135, 142, 145)

const valueStyle: CSSProperties = {
    whiteSpace: 'pre-wrap',
    lineBreak: 'anywhere',

    fontSize: '12px',
    background: 'rgba(20,20,20,0.05)',
    borderRadius: '2px',
    padding: '1rem',
}

interface InfoItem {
    name: string;
    value: string | (() => any);
}

@observer
export class ErrorBoundary extends React.Component<{ children?: React.ReactNode }> {
    @observable hasError = false;
    error: Error | null = null;
    errorInfo: object | null = null;
    @observable decodingDone: boolean = false;

    @observable infoItems: InfoItem[] = [];

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    componentDidCatch(error: Error | null, errorInfo: object) {
        this.error = error;
        this.errorInfo = errorInfo;
        this.decodingDone = false;

        this.infoItems = [];

        // Type
        if (this.error?.name && this.error.name.toLowerCase() != 'error')
            this.infoItems.push({ name: 'Type', value: this.error.name });

        // Message
        if (this.error?.message)
            this.infoItems.push({ name: 'Message', value: this.error.message });
        else
            this.infoItems.push({ name: 'Message', value: '(no message)' });

        // Call Stack
        if (this.error?.stack) {
            const dataHolder = observable({
                value: null as null | any,
            });

            this.infoItems.push({
                name: 'Stack (Decoded)', value: () => {
                    if (dataHolder.value == null) return <>
                        <div style={{ fontSize: '2rem' }}>Decoding stack trace, please wait...</div>
                    </>;
                    return dataHolder.value;
                }
            });

            StackTrace.fromError(this.error).then(frames => {
                // Decode Success
                dataHolder.value = frames.join('\n');
                this.decodingDone = true;
            }).catch(err => {
                // Decode Error
                dataHolder.value = 'Unable to decode stacktrace\n' + String(err);
                this.decodingDone = true;
            });


            // Normal stack trace
            let s = this.error.stack;
            // remove "Error: " prefix
            s = s.removePrefix('error:').trim();
            // remove the error message as well, leaving only the stack trace
            if (this.error.message && s.startsWith(this.error.message))
                s = s.slice(this.error.message.length).trimStart();
            this.infoItems.push({ name: 'Stack (Raw)', value: s });
        }

        // Component Stack
        if (this.errorInfo && (this.errorInfo as any).componentStack)
            this.infoItems.push({ name: 'Components', value: (this.errorInfo as any).componentStack });
        else
            this.infoItems.push({
                name: 'Components', value: this.errorInfo
                    ? '(componentStack not set) errorInfo as Json: \n' + toJson(this.errorInfo)
                    : '(errorInfo was not set)'
            });


        // EnvVars
        try {
            const padLength = envVarDebugAr.max(e => e.name.length);
            this.infoItems.push({
                name: 'Environment',
                value: envVarDebugAr.map(e => e.name.padEnd(padLength) + ': ' + e.value).join('\n')
            })
        } catch (ex) {
            this.infoItems.push({ name: 'Environment', value: '(error retreiving env list)' });
        }

        // Location
        try {
            const locationItems = ObjToKv({
                'Protocol': window?.location?.protocol ?? '<null>',
                'Path': window?.location?.pathname ?? '<null>',
                'Search': window?.location?.search ?? '<null>',
                'Hash': window?.location?.hash ?? '<null>',
            });
            const padLength = locationItems.max(e => e.key.length);
            this.infoItems.push({
                name: 'Location',
                value: locationItems.map(e => e.key.padEnd(padLength) + ': ' + e.value).join('\n')
            })
        } catch (ex) {
            this.infoItems.push({ name: 'Location', value: '(error printing location, please include the url in your bug report)' });
        }

        this.hasError = true;
    }

    copyError() {
        let data = '';

        for (const e of this.infoItems) {
            const str = getStringFromInfo(e);
            data += `${e.name}:\n${str}\n\n`;
        }

        navigator.clipboard.writeText(data);
        message.success('All info copied to clipboard!', 5);
    }

    dismiss() {
        this.error = null;
        this.errorInfo = null;
        this.hasError = false;
        this.decodingDone = false;
    }

    render() {
        if (!this.hasError) return this.props.children;

        return <Layout style={{ minHeight: '100vh', overflow: 'visible', padding: '2rem 4rem' }}>
            <div>
                <h1>Rendering Error!</h1>
                <p>Please report this at <a style={{ textDecoration: 'underline', fontWeight: 'bold' }} href="https://github.com/redpanda-data/console/issues">our GitHub Repo</a></p>
                <Space size={'large'} style={{ marginTop: '0', marginBottom: '2rem' }}>
                    <Button variant="primary" size="large" style={{ width: '16rem' }} onClick={() => this.dismiss()}>
                        <Icon as={CloseOutlined} />
                        Dismiss
                    </Button>
                    <NoClipboardPopover>
                        <Button variant="ghost" size="large"
                            disabled={!isClipboardAvailable || !this.decodingDone}
                            isLoading={!this.decodingDone}
                            onClick={() => this.copyError()}>
                            <Icon as={CopyOutlined} />
                            Copy Info
                        </Button>
                    </NoClipboardPopover>
                </Space>
            </div>
            <Content>
                <Space direction="vertical" size={30} style={{ width: '100%' }}>
                    {this.infoItems.map(e => <InfoItemDisplay key={e.name} data={e} />)}
                </Space>
            </Content>
        </Layout>
    }
}

function getStringFromInfo(info: InfoItem) {
    if (!info) return '';

    if (typeof info.value === 'string') return info.value;
    try {
        const r = info.value();
        return String(r);
    } catch (err) {
        return 'Error calling infoItem func: ' + err;
    }
}

@observer
export class InfoItemDisplay extends React.Component<{ data: InfoItem }> {

    render() {
        const title = this.props.data.name;
        const value = this.props.data.value;
        let content: any;
        if (typeof value === 'string') {
            content = value;
        }
        else {
            try {
                content = value();
            } catch (err) {
                content = 'error rendering: ' + String(err);
            }
        }

        if (typeof content === 'string') {
            content = content.replace(/\n\s*/g, '\n').trim();
        }

        return (
            <div>
                <h2>{title}</h2>
                <pre style={valueStyle}>{content}</pre>
            </div>
        )
    }
}
