import { EditorProps, Monaco } from '@monaco-editor/react';
import { Button, Modal, ModalProps as AntdModalProps, Result, Select } from "antd";
import { action, computed, observable } from "mobx";
import { Observer, observer } from "mobx-react";
import React, { Component } from "react";
import { api } from "../../../../state/backendApi";
import { CompressionType } from "../../../../state/restInterfaces";
import { toJson } from "../../../../utils/jsonUtils";
import { Code, Label } from "../../../../utils/tsxUtils";
import KowlEditor, { IStandaloneCodeEditor } from "../../../misc/KowlEditor";
import Tabs, { Tab } from "../../../misc/tabs/Tabs";
import HeadersEditor from "./Headers";

type AutoModalProps = Omit<AntdModalProps, 'visible' | 'afterClose' | 'onCancel' | 'onOk' | 'modalRender'>;


// Create a wrapper for <Modal/>  takes care of rendering depending on 'visible'
// - keeps rendering the modal until its close animation is actually finished
// - automatically renders content for states like 'Loading' (disable controls etc) or 'Error' (display error and allow trying again)
export function createAutoModal<TShowArg, TModalState>(options: {
    modalProps: AutoModalProps,
    // called when the returned 'show()' method is called.
    // Return the state for your modal here
    onCreate: (arg: TShowArg) => TModalState,
    // return the component that will handle editting the modal-state (that you returned from 'onCreate')
    content: (state: TModalState) => React.ReactElement,
    // called when the user clicks the Ok button; do network requests in here
    // return some JSX (or null) to show the success page, or throw an error if anything went wrong to show the error page
    onOk: (state: TModalState) => Promise<JSX.Element | undefined>,
    // used to determine whether or not the 'ok' button is enabled
    isOkEnabled: (state: TModalState) => boolean,
    // called when the user clicks 'Close'. When the user clicks 'Ok', the 'onOk' handler is called, and once it returns (without throwing any errors) the dialog is
    // considered to be in the 'success' state (where the return of onOk is shown, stuff like "Successfully created XYZ entries"), the only remaining available button is "Close",
    // and once the user clicks it 'onComplete' will be called.
    onComplete: (state: TModalState) => void,
}) {

    let showArg: TShowArg | null = null;
    let userState: TModalState | undefined = undefined;
    const state = observable({
        modalProps: null as AntdModalProps | null,
        visible: false,
        loading: false,
        result: null as null | { error?: any, returnValue?: JSX.Element; },
    }, undefined, { defaultDecorator: observable.ref });

    // Called by user to create a new modal instance
    const show = action((arg: TShowArg) => {
        showArg = arg;
        userState = options.onCreate(arg);
        state.modalProps = Object.assign({}, options.modalProps, {
            onCancel: () => {
                state.visible = false;
                state.result = null;
            },
            onOk: async () => {
                if (state.result?.error) {
                    state.result = null;
                    return;
                }

                try {
                    state.loading = true;
                    state.result = {
                        returnValue: await options.onOk(userState!) ?? undefined,
                        error: null,
                    };
                } catch (e) {
                    state.result = { error: e };
                }
                finally {
                    state.loading = false;
                }
            },
            afterClose: () => {
                showArg = null;
                state.modalProps = null;
                state.result = null;
                state.visible = false;
                state.loading = false;
            },
        });
        state.visible = true;
    });

    const renderError = (err: any) => {
        return <div>
            <h5>Error</h5>
            <Code>{toJson(err)}</Code>
        </div>;
    };

    const renderSuccess = (response: JSX.Element | null) => {
        return <div>
            <Result style={{ margin: 0, padding: 0, marginTop: '1em' }} status="success"
                title="Success"
                subTitle={<>
                    {response}
                </>}
                extra={<Button type="primary" size='large' style={{ width: '16rem' }} onClick={() => state.visible = false}>Close</Button>}
            />
        </div>;
    };

    // The component the user uses to render/mount into the jsx tree
    const Comp = <Observer>{(() => {
        if (!state.modalProps) return null;

        let content: JSX.Element;
        let isOkEnabled = true;

        if (state.result?.error)
            content = renderError(state.result.error);
        else if (state.result?.returnValue)
            content = renderSuccess(state.result.returnValue);
        else {
            content = options.content(userState!);
            isOkEnabled = options.isOkEnabled(userState!);
        }

        // If there is any result (error or success) we don't need a cancel button anymore
        const buttonProps: AntdModalProps = state.result?.error
            ? propsOnError
            : state.result?.returnValue
                ? propsOnSuccess
                : { okButtonProps: { disabled: !isOkEnabled } };

        return <Modal {...state.modalProps} {...buttonProps} visible={state.visible} confirmLoading={state.loading}>
            {content}
        </Modal>;
    })}</Observer>;

    return { show, Comp };
}

const styleHidden = { style: { display: 'none' } };
const propsOnError = { cancelButtonProps: styleHidden, okText: "Back" } as AntdModalProps;
const propsOnSuccess = { footer: null, title: null } as AntdModalProps; //  cancelButtonProps: styleHidden, okButtonProps: styleHidden,

type EncodingType =
    | "none"   // use null as value, aka tombstone
    | "utf8"   // use text as it is, use utf8 to get bytes
    | "base64" // text is base64, so server should just use base64decode to get the bytes
    | "json"   // parse the text as json, stringify it again to reduce whitespace, use utf8 to get bytes

export type { Props as ModalContentProps };
type Props = {
    state: {
        topics: string[];
        partition: number;
        compressionType: CompressionType;

        key: string;
        keyEncoding?: EncodingType;

        value: string;
        valueEncoding?: EncodingType;

        headers: { key: string; value: string; }[];
        isTombstone: boolean;
    }
};

@observer
export class PublishMessagesModalContent extends Component<Props> {
    availableCompressionTypes = Object.entries(CompressionType).map(([label, value]) => ({ label, value })).filter(t => t.value != CompressionType.Unknown);

    render() {
        return <div>
            <Observer>{() =>
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
                            onChange={(v, d) => {
                                this.props.state.compressionType = v;
                                console.log('selected compressionType change: ', { v: v, d: d });
                            }}
                        />
                    </Label>
                </div>
            }</Observer>

            <Tabs tabs={this.tabs} defaultSelectedTabKey='value'
                wrapperStyle={{ marginTop: '1em' }}
                tabButtonStyle={{ maxWidth: '150px' }}
                barStyle={{ marginBottom: '.5em' }}
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

    Editor = ({ tab }: { tab: 'headers' | 'key' | 'value' }): JSX.Element => {
        const common = { height: '240px', path: tab, onMount: setTheme } as EditorProps;
        const r = this.props.state;

        if (tab === 'headers')
            return <HeadersEditor items={r.headers} />

        if (tab === 'key')
            return <KowlEditor key={tab} {...common} value={r.key} onChange={x => r.key = x ?? ''} />

        if (tab === 'value')
            return <KowlEditor key={tab} {...common} value={r.value} onChange={x => r.value = x ?? ''} language="json" />

        return <></>
    }

    tabs: Tab[] = [
        { key: 'headers', title: 'Headers', content: <div><this.Editor tab='headers' /></div> },
        { key: 'key', title: 'Key', content: <div><this.Editor tab='key' /></div> },
        { key: 'value', title: 'Value', content: <div><this.Editor tab='value' /></div> }
    ];
}

function setTheme(editor: IStandaloneCodeEditor, monaco: Monaco) {
    monaco.editor.defineTheme('kowl', {
        base: 'vs',
        inherit: true,
        colors: {
            "editor.background": "#eeeeee20",
            "editor.foreground": "#ff0000",

            "editorGutter.background": "#00000018",

            "editor.lineHighlightBackground": "#aaaaaa20",
            "editor.lineHighlightBorder": "#00000000",

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
function setHeaderSchema(editor: IStandaloneCodeEditor, monaco: Monaco): void {
    const jsonDefaults = monaco.languages.json.jsonDefaults;
    jsonDefaults.setDiagnosticsOptions({
        validate: true,
        enableSchemaRequest: false,
        schemas: [headerSchema],
        allowComments: true,
    });
}

const headerSchemaUri = "schema://root/headers.json";

const headerSchema = {
    uri: headerSchemaUri,
    fileMatch: ["*"],
    schema: {
        type: "array",
        items: {
            type: "object",
            additionalProperties: false,
            properties: {
                key: { type: "string" },
                value: { type: "string" },
            },
            requiredProperties: ["key", "value"]
        }
    }
};

const exampleHeader = `
[
    // First header entry
    {
        // Name of the header, this should be a normal string.
        "key": "Name",

        // Depending on the options the value will be:
        // - stringified to JSON ,
        // - submitted as a raw string
        // - base64 decoded before it is sent to kafka
        "value": "Value of the header."
    }
]
`.trim();