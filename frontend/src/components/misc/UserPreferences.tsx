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

import { Component, FC } from 'react';
import { observer, useLocalObservable } from 'mobx-react';
import { Menu, Modal, Input, InputNumber } from 'antd';
import { clearSettings, uiSettings } from '../../state/ui';
import { Label, navigatorClipboardErrorHandler } from '../../utils/tsxUtils';
import { makeObservable, observable, transaction } from 'mobx';
import { ToolsIcon } from '@primer/octicons-react';
import { Button, Checkbox, Flex, IconButton, useToast } from '@redpanda-data/ui';

type Action = () => void;

const settingsTabs: { name: string, component: FC }[] = [
    { name: 'Statistics Bar', component: () => <StatsBarTab /> },
    { name: 'Json Viewer', component: () => <JsonViewerTab /> },
    { name: 'Import/Export', component: () => <ImportExportTab /> },
    { name: 'Auto Refresh', component: () => <AutoRefreshTab /> },

    // pagination position
    // { name: "Message Search", component: () => <MessageSearchTab /> },
];


@observer
export class UserPreferencesButton extends Component {
    @observable isOpen = false;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {

        return <>
            <UserPreferencesDialog visible={this.isOpen} onClose={() => this.isOpen = false} />
            <IconButton
                className="hoverButton userPreferencesButton"
                variant="outline"
                aria-label="user preferences"
                icon={<ToolsIcon size={17} />}
                onClick={() => this.isOpen = true}
            />
        </>;
    }
}

@observer
export class UserPreferencesDialog extends Component<{ visible: boolean, onClose: Action }> {
    @observable selectedTab: string = settingsTabs[0].name;
    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        const {visible, onClose} = this.props;
        const tab = settingsTabs.first(t => t.name == this.selectedTab);

        return (
            <Modal centered open={visible}
                   closable={false}
                   title={null}
                   onOk={onClose}
                   onCancel={onClose}

                   destroyOnClose={true}

                   cancelButtonProps={{style: {display: 'none'}}}
                   maskClosable={true}
                   footer={<div style={{display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'flex-end'}}>
                       <div style={{fontFamily: '"Open Sans", sans-serif', fontSize: '10.5px', color: '#828282'}}>
                           Changes are saved automatically
                       </div>
                       <Button variant="outline" onClick={onClose}>Close</Button>
                   </div>}
                   className="preferencesDialog"
                   bodyStyle={{padding: '0', display: 'flex', flexDirection: 'column'}}
            >
                {/* Title */}
                <div className="h3" style={{display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid hsl(0 0% 90% / 1)'}}>
                    User Preferences
                </div>

                {/* Body */}
                <div style={{display: 'flex', flexGrow: 1}}>
                    {/* Menu */}
                    <Menu mode="vertical" style={{width: '160px', height: '100%'}} selectedKeys={[this.selectedTab]} onClick={p => this.selectedTab = p.key.toString()}>
                        {settingsTabs.map(t => <Menu.Item key={t.name}>{t.name}</Menu.Item>)}
                    </Menu>

                    {/* Content */}
                    <div style={{
                        display: 'flex', flexGrow: 1, gap: '16px', flexDirection: 'column',
                        padding: '0 20px', paddingBottom: '40px',
                    }}>
                        <div className="h3" style={{marginTop: '16px', marginBottom: '8px'}}>{tab?.name}</div>
                        {tab && <tab.component/>}
                    </div>
                </div>
            </Modal>
        );
    }
}



@observer
class StatsBarTab extends Component {
    render() {
        return <div>
            <p>Controls on what pages Redpanda Console shows the statistics bar</p>
            <div style={{ display: 'inline-grid', gridAutoFlow: 'row', gridRowGap: '24px', gridColumnGap: '32px', marginRight: 'auto' }}>
                <Label text="Topic Details" >
                    <Checkbox children="Enabled" isChecked={uiSettings.topicDetailsShowStatisticsBar} onChange={e => uiSettings.topicDetailsShowStatisticsBar = e.target.checked} />
                </Label>
                <Label text="Consumer Group Details" >
                    <Checkbox children="Enabled" isChecked={uiSettings.consumerGroupDetails.showStatisticsBar} onChange={e => uiSettings.consumerGroupDetails.showStatisticsBar = e.target.checked} />
                </Label>
            </div>
        </div>;
    }
}

@observer
class JsonViewerTab extends Component {
    render() {
        const settings = uiSettings.jsonViewer;

        return <div>
            <p>Settings for the JsonViewer</p>

            <div style={{ display: 'inline-grid', gridAutoFlow: 'row', gridRowGap: '24px', gridColumnGap: '32px', marginRight: 'auto' }}>
                <Label text="Font Size">
                    <Input value={settings.fontSize} onChange={e => settings.fontSize = e.target.value} style={{ maxWidth: '150px' }} />
                </Label>
                <Label text="Line Height">
                    <Input value={settings.lineHeight} onChange={e => settings.lineHeight = e.target.value} style={{ maxWidth: '150px' }} />
                </Label>
                <Label text="Maximum string length before collapsing">
                    <InputNumber value={settings.maxStringLength} onChange={e => settings.maxStringLength = (e ?? 200)} min={0} max={10000} style={{ maxWidth: '150px' }} />
                </Label>
                <Label text="Maximum depth before collapsing nested objects">
                    <InputNumber value={settings.collapsed} onChange={e => settings.collapsed = (e ?? 2)} min={1} max={50} style={{ maxWidth: '150px' }} />
                </Label>
            </div>
        </div>;
    }
}

const ImportExportTab: FC = observer(() => {
    const toast = useToast()
    const $state = useLocalObservable<{
        importCode: string;
        resetConfirm: string;
    }>(() => ({
        importCode: '',
        resetConfirm: ''
    }))
    return <>
        <Label text="Import">
            <Flex>
                <Input
                    style={{ maxWidth: '360px', marginRight: '8px', fontFamily: 'monospace', fontSize: '0.85em' }}
                    spellCheck={false}
                    placeholder="Paste a previously exported settings string..."
                    value={$state.importCode}
                    onChange={e => $state.importCode = e.target.value}
                    size="small"
                />
                <Button onClick={() => {
                    try {
                        const data = JSON.parse($state.importCode);
                        const skipped: string[] = [];
                        transaction(() => {
                            for (const k in data) {
                                if (!Reflect.has(uiSettings, k))
                                    skipped.push(k);
                                else
                                    (uiSettings as any)[k] = data[k];
                            }
                        });
                        if (skipped.length > 0)
                            toast({
                                status: 'warning',
                                description: 'Some properties were skipped during import:\n' + skipped.join(', ')
                            })
                        else
                            toast({
                                status: 'success',
                                description: 'Settings imported successfully'
                            })
                        $state.importCode = '';
                    } catch (e) {
                        toast({
                            status: 'error',
                            description: 'Unable to import settings. See console for more information.'
                        })
                        console.error('unable to import settings', { error: e });
                    }

                }}>Import</Button>
            </Flex>
        </Label>

        <Label text="Export">
            <Button onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(uiSettings)).then(() => {
                    toast({
                        status: 'success',
                        description: 'Preferences copied to clipboard!'
                    })
                }).catch(navigatorClipboardErrorHandler)
            }}>
                Export User Preferences
            </Button>
        </Label>

        <Label text="Reset">
            <>
                <Input style={{maxWidth: '360px', marginRight: '8px', fontFamily: 'monospace', fontSize: '0.85em'}} spellCheck={false}
                       placeholder='type "reset" here to confirm and enable the button'
                       value={$state.resetConfirm}
                       onChange={str => $state.resetConfirm = str.target.value}/>
                <Button onClick={() => {
                    clearSettings();
                    toast({
                        status: 'success',
                        description: 'All settings have been reset to their defaults'
                    });
                    $state.resetConfirm = '';
                }} colorScheme="red" isDisabled={$state.resetConfirm !== 'reset'}>Reset</Button>
                <span className="smallText">Clear all your user settings, resetting them to the default values</span>
            </>
        </Label>
    </>;
})

@observer
class AutoRefreshTab extends Component {
    render() {
        return <div>
            <p>Settings for the Auto Refresh Button</p>
            <div style={{ display: 'inline-grid', gridAutoFlow: 'row', gridRowGap: '24px', gridColumnGap: '32px', marginRight: 'auto' }}>
                <Label text="Interval in seconds">
                    <InputNumber
                        value={uiSettings.autoRefreshIntervalSecs}
                        onChange={e => {
                            if (e) {
                                uiSettings.autoRefreshIntervalSecs = e;
                            }
                        }}
                        min={5} max={300}
                        style={{ maxWidth: '150px' }}
                    />
                </Label>
            </div>
        </div>;
    }
}
