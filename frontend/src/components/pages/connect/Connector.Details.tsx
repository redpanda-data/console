/* eslint-disable no-useless-escape */
import { CheckCircleTwoTone, ExclamationCircleTwoTone, WarningTwoTone } from '@ant-design/icons';
import { Button, message, notification } from 'antd';
import { motion } from 'framer-motion';
import { autorun, IReactionDisposer, makeObservable, observable, untracked } from 'mobx';
import { observer } from 'mobx-react';
import { CSSProperties } from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { ApiError } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { animProps } from '../../../utils/animationProps';
import { Code } from '../../../utils/tsxUtils';
import Card from '../../misc/Card';
import { sortField } from '../../misc/common';
import { KowlTable } from '../../misc/KowlTable';
import { PageComponent, PageInitHelper } from '../Page';


import './helper';

// React Editor
import Editor from "@monaco-editor/react";

// Monaco Type
import * as monacoType from 'monaco-editor/esm/vs/editor/editor.api';
import { StatisticsCard } from './helper';
export type Monaco = typeof monacoType;

// eslint-disable-next-line @typescript-eslint/no-var-requires
// const monacoProtoLint = require('monaco-proto-lint');

// const protoLangConf: monacoType.languages.LanguageConfiguration = {
//     indentationRules: {
//         // ^.*\{[^}'']*$
//         increaseIndentPattern: /^.*\{[^}'']*$/,
//         // ^(.*\*/)?\s*\}.*$
//         decreaseIndentPattern: /^(.*\*\/)?\s*\}.*$/,
//     },
//     wordPattern: /(-?\d*\.\d\w*)|([^`~!@#%^&*()\-=+[{\]}\\|;:'",.<>/?\s]+)(\.proto){0,1}/g,
//     comments: {
//         lineComment: '//',
//         blockComment: ['/*', '*/']
//     },
//     brackets: [
//         ['{', '}'],
//         ['[', ']'],
//         ['(', ')'],
//         ['<', '>'],
//     ],
//     folding: {
//         markers: {
//             start: new RegExp("^\\s*<!--\\s*#?region\\b.*-->"),
//             end: new RegExp("^\\s*<!--\\s*#?endregion\\b.*-->")
//         },
//         offSide: true,
//     }
// }


function onBeforeEditorMount(m: Monaco) {
    // monacoProtoLint.default(m);
    // m.languages.setLanguageConfiguration('protobuf', protoLangConf);

    // m.editor.defineTheme('proto-custom', {
    //     base: 'vs',
    //     inherit: true,
    //     rules: [
    //         { token: 'comment', foreground: '#66747B' }
    //     ],
    //     colors: {
    //         "comment": "#66747B",
    //         "editorLineNumber.foreground": "#aaa",
    //     }
    // })
}

function onMountEditor(editor: any, monaco: any) {
    // editor is actually type: monaco.editor.IStandaloneCodeEditor
    // editor.setValue(logText);
}



@observer
class KafkaConnectorDetails extends PageComponent<{ clusterName: string, connector: string }> {

    @observable placeholder = 5;
    @observable currentConfig: string = "";

    autoRunDisposer: IReactionDisposer | undefined;
    showConfigUpdated = false;

    constructor(p: any) {
        super(p);
        makeObservable(this);

        this.autoRunDisposer = autorun(() => {
            // update config in editor
            const clusterName = this.props.clusterName;
            const connectorName = this.props.connector;

            const cluster = api.connectConnectors?.clusters.first(c => c.clusterName == clusterName);
            const connector = cluster?.connectors.first(c => c.name == connectorName);

            const currentConfig = untracked(() => this.currentConfig);
            const isInitialUpdate = !currentConfig;
            const newConfig = connector?.jsonConfig ?? '';
            if (newConfig && newConfig != currentConfig) {
                console.log('updating config', { oldConf: currentConfig, newConf: newConfig })
                this.currentConfig = newConfig;
                if (!isInitialUpdate) message.info('Shown config has been updated');
            }
        });
    }

    initPage(p: PageInitHelper): void {
        const clusterName = this.props.clusterName;
        const connector = this.props.connector;
        p.title = connector;
        p.addBreadcrumb("Kafka Connect", `/kafka-connect`);
        p.addBreadcrumb(clusterName, `/kafka-connect/${clusterName}`);
        p.addBreadcrumb(connector, `/kafka-connect/${clusterName}/${connector}`);



        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshConnectClusters(force);
    }

    componentWillUnmount() {
        if (this.autoRunDisposer) {
            this.autoRunDisposer();
            this.autoRunDisposer = undefined;
        }
    }

    render() {
        const clusterName = this.props.clusterName;
        const connectorName = this.props.connector;

        const settings = uiSettings.kafkaConnect;
        const cluster = api.connectConnectors?.clusters.first(c => c.clusterName == clusterName);
        const connector = cluster?.connectors.first(c => c.name == connectorName);

        const state = connector?.state.toLowerCase();
        const isRunning = state == 'running';

        const tasks = connector?.tasks ?? [];

        return (
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <StatisticsCard />

                {/* Main Card */}
                <Card>
                    {/* Title + Pause/Restart */}
                    <div style={{ display: 'flex', alignItems: 'center', margin: '.5em 0', paddingLeft: '2px' }}>
                        <span style={{ display: 'inline-flex', gap: '.5em', alignItems: 'center' }}>
                            <span style={{ fontSize: '17px', display: 'inline-block' }}>{isRunning ? okIcon : warnIcon}</span>
                            <span style={{ fontSize: 'medium', fontWeight: 600, lineHeight: '0px', marginBottom: '1px' }}>{connectorName}</span>
                            <span style={{ fontSize: 'small', opacity: 0.5 }}>({state ?? '<empty>'})</span>
                        </span>

                        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '.5em', fontSize: '12px' }}>
                            <Button onClick={async () => {
                                let f: () => Promise<ApiError | null>;
                                if (isRunning)
                                    f = () => api.pauseConnector(clusterName, connectorName);
                                else
                                    f = () => api.resumeConnector(clusterName, connectorName);

                                await f();
                                this.refreshData(true);
                            }}>
                                {isRunning ? 'Pause' : 'Resume'}
                            </Button>
                            <Button onClick={async () => {
                                await api.restartConnector(clusterName, connectorName);
                                this.refreshData(true);
                            }}>Restart</Button>
                        </span>
                    </div>

                    {/* Editor */}
                    <div style={{ marginTop: '1em' }}>
                        <div style={{ border: '1px solid hsl(0deg, 0%, 90%)', borderRadius: '2px' }}>
                            <Editor
                                beforeMount={onBeforeEditorMount}
                                onMount={onMountEditor}

                                // theme="vs-dark"
                                // defaultLanguage="typescript"

                                // theme='myCoolTheme'
                                // language='mySpecialLanguage'

                                language='json'
                                value={this.currentConfig}
                                onChange={(v, e) => {
                                    if (v) {
                                        if (!this.currentConfig && !v)
                                            return; // dont replace undefiend with empty (which would trigger our 'autorun')
                                        this.currentConfig = v;
                                    }
                                }}

                                // language='yaml'
                                // defaultValue={yamlText}

                                // language='protobuf'
                                // defaultValue={protoText}
                                // theme='proto-custom'

                                options={{
                                    minimap: {
                                        enabled: false,
                                    },
                                    roundedSelection: false,
                                    padding: {
                                        top: 4,
                                    },
                                    showFoldingControls: 'always',
                                    glyphMargin: false,
                                    scrollBeyondLastLine: false,
                                    lineNumbersMinChars: 4,
                                    scrollbar: {
                                        alwaysConsumeMouseWheel: false,
                                    },
                                    fontSize: 12,
                                    occurrencesHighlight: false,
                                    foldingHighlight: false,
                                    selectionHighlight: false,
                                }}

                                height="300px"
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '1em 0', marginBottom: '1.5em' }}>
                            <Button type='primary' ghost style={{ width: '200px' }} disabled={(() => {
                                if (!this.currentConfig) return true;
                                try { JSON.parse(this.currentConfig); }
                                catch (ex: any) { return true; }
                                return false;
                            })()} onClick={async () => {

                                let newConfigObj: object;
                                try {
                                    newConfigObj = JSON.parse(this.currentConfig);
                                } catch (ex: any) {
                                    message.error("Config is not valid json!", 3);
                                    return;
                                }

                                const err = await api.updateConnector(clusterName, connectorName, newConfigObj);
                                if (err) {
                                    notification.error({ message: 'Error', description: 'Unable to update config:\n' + JSON.stringify(err, undefined, 4) });
                                    return;
                                }
                                this.refreshData(true);

                                message.success('New connector config applied!');

                            }}>
                                Update Config
                            </Button>
                        </div>
                    </div>

                    {/* Task List */}
                    <div style={{ marginTop: '1em' }}>
                        <KowlTable
                            dataSource={tasks}
                            columns={[
                                {
                                    title: 'Task', dataIndex: 'taskId', width: 200,
                                    sorter: sortField('taskId'), defaultSortOrder: 'ascend',
                                    render: (v) => <Code>Task-{v}</Code>
                                },
                                {
                                    title: 'Status', dataIndex: 'state', sorter: sortField('state'),
                                    render: v => <>
                                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                            <span style={{ fontSize: '17px', display: 'inline-block', marginRight: '4px' }}>
                                                {v == 'FAILED'
                                                    ? errIcon
                                                    : v == 'RUNNING'
                                                        ? okIcon : warnIcon}
                                            </span>
                                            {v}
                                        </span>
                                    </>
                                },
                                {
                                    title: 'Worker', dataIndex: 'workerId', sorter: sortField('workerId'),
                                    render: (v) => <Code>{v}</Code>
                                },
                                // {
                                //     title: 'Actions', width: 200,
                                //     render: (_, task) => <span style={{ display: 'inline-flex', gap: '.75em', alignItems: 'center' }}>
                                //         {/* Pause/Resume Task */}
                                //         <span className='linkBtn' onClick={() => {
                                //             // if (isRunning) api.pauseConnector(clusterName, connectorName);
                                //             // else api.resumeConnector(clusterName, connectorName);
                                //         }}>
                                //             {task.state.toLowerCase() == 'running' ? 'Pause' : 'Resume'}
                                //         </span>
                                //         {/* Separator */}
                                //         <span className='inlineSeparator' />
                                //         {/* Restart Task */}
                                //         <span className='linkBtn' onClick={() => {
                                //             // if (isRunning) api.pauseConnector(clusterName, connectorName);
                                //             // else api.resumeConnector(clusterName, connectorName);
                                //         }}>
                                //             Restart
                                //         </span>
                                //     </span>
                                // },
                            ]}
                            rowKey='taskId'

                            search={{
                                columnTitle: 'Task',
                                isRowMatch: (row, regex) => regex.test(String(row.taskId)) || regex.test(row.state) || regex.test(row.workerId)
                            }}
                        />
                    </div>
                </Card>
            </motion.div>
        );
    }
}

export default KafkaConnectorDetails;

const okIcon = <CheckCircleTwoTone twoToneColor='#52c41a' />;
const warnIcon = <WarningTwoTone twoToneColor='orange' />;
const errIcon = <ExclamationCircleTwoTone twoToneColor='orangered' />;
const mr05: CSSProperties = { marginRight: '.5em' };

const protoText = `
// [START declaration]
syntax = "proto3";
package tutorial;

import "google/protobuf/timestamp.proto";
// [END declaration]

// [START java_declaration]
option java_multiple_files = true;
option java_package = "com.example.tutorial.protos";
option java_outer_classname = "AddressBookProtos";
// [END java_declaration]

// [START csharp_declaration]
option csharp_namespace = "Google.Protobuf.Examples.AddressBook";
// [END csharp_declaration]

// [START go_declaration]
option go_package = "../tutorial";
// [END go_declaration]

// [START messages]
message Person {
  string name = 1;
  int32 id = 2;  // Unique ID number for this person.
  string email = 3;

  enum PhoneType {
    MOBILE = 0;
    HOME = 1;
    WORK = 2;
  }

  message PhoneNumber {
    string number = 1;
    PhoneType type = 2;
  }

  repeated PhoneNumber phones = 4;

  google.protobuf.Timestamp last_updated = 5;
}

// Our address book file is just one of these.
message AddressBook {
  repeated Person people = 1;
}
// [END messages]
`.trim() + "\n\n";
