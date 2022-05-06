import React, { Component, ReactNode } from 'react';
import { observer } from "mobx-react";
import { Menu, Select, Avatar, Popconfirm, Dropdown, Button, Modal, Input, message, Checkbox, InputNumber } from 'antd';
import { clearSettings, uiSettings } from '../../state/ui';
import { RenderTrap, Spacer } from './common';
import { api } from '../../state/backendApi';
import Icon, { UserOutlined } from '@ant-design/icons';
import { IsBusiness } from '../../utils/env';
import { Label } from '../../utils/tsxUtils';
import { makeObservable, observable, transaction } from 'mobx';
import { ToolsIcon } from '@primer/octicons-react';

const { Option } = Select;
type Action = () => void;

const settingsTabs: { name: string, component: () => ReactNode }[] = [
    { name: "Statistics Bar", component: () => <StatsBarTab /> },
    { name: "Json Viewer", component: () => <JsonViewerTab /> },
    { name: "Import/Export", component: () => <ImportExportTab /> },

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
            <Button shape='circle' icon={<ToolsIcon size={17} />} className='hoverButton userPreferencesButton'
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
        const { visible, onClose } = this.props;
        const tab = settingsTabs.first(t => t.name == this.selectedTab);

        return 1 &&
            <Modal centered visible={visible}
                closable={false}
                title={null}
                onOk={onClose}
                onCancel={onClose}

                destroyOnClose={true}

                cancelButtonProps={{ style: { display: 'none' } }}
                maskClosable={true}
                footer={<div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <div style={{ fontFamily: '"Open Sans", sans-serif', fontSize: '10.5px', color: '#828282' }}>
                        Changes are saved automatically
                    </div>
                    <Button type='primary' onClick={onClose} >Close</Button>
                </div>}
                className='preferencesDialog'
                bodyStyle={{ padding: '0', display: 'flex', flexDirection: 'column' }}
            >
                {/* Title */}
                <div className='h3' style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid hsl(0 0% 90% / 1)' }}>
                    User Preferences
                </div>

                {/* Body */}
                <div style={{ display: 'flex', flexGrow: 1 }}>
                    {/* Menu */}
                    <Menu mode='vertical' style={{ width: '160px', height: '100%' }} selectedKeys={[this.selectedTab]} onClick={p => this.selectedTab = p.key.toString()}>
                        {settingsTabs.map(t => <Menu.Item key={t.name} >{t.name}</Menu.Item>)}
                    </Menu>

                    {/* Content */}
                    <div style={{
                        display: 'flex', flexGrow: 1, gap: '16px', flexDirection: 'column',
                        padding: '0 20px', paddingBottom: '40px',
                    }}>
                        <div className='h3' style={{ marginTop: '16px', marginBottom: '8px' }}>{tab?.name}</div>
                        {tab?.component()}
                    </div>
                </div>
            </Modal>;
    }
}



@observer
class StatsBarTab extends Component {
    render() {
        return <div>
            <p>Controls on what pages kowl shows the statistics bar</p>
            <div style={{ display: 'inline-grid', gridAutoFlow: 'row', gridRowGap: '24px', gridColumnGap: '32px', marginRight: 'auto' }}>
                <Label text='Topic Details' >
                    <Checkbox children='Enabled' checked={uiSettings.topicDetailsShowStatisticsBar} onChange={e => uiSettings.topicDetailsShowStatisticsBar = e.target.checked} />
                </Label>
                <Label text='Consumer Group Details' >
                    <Checkbox children='Enabled' checked={uiSettings.consumerGroupDetails.showStatisticsBar} onChange={e => uiSettings.consumerGroupDetails.showStatisticsBar = e.target.checked} />
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
                <Label text='Font Size'>
                    <Input value={settings.fontSize} onChange={e => settings.fontSize = e.target.value} style={{ maxWidth: '150px' }} />
                </Label>
                <Label text='Line Height'>
                    <Input value={settings.lineHeight} onChange={e => settings.lineHeight = e.target.value} style={{ maxWidth: '150px' }} />
                </Label>
                <Label text='Maximum string length before collapsing'>
                    <InputNumber value={settings.maxStringLength} onChange={e => settings.maxStringLength = e} min={0} max={10000} style={{ maxWidth: '150px' }} />
                </Label>
            </div>
        </div>;
    }
}

@observer
class ImportExportTab extends Component {
    @observable importCode = '';
    @observable resetConfirm = '';

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        return <>
            <Label text='Import'>
                <div style={{ display: 'flex' }}>
                    <Input
                        style={{ maxWidth: '360px', marginRight: '8px', fontFamily: 'monospace', fontSize: '0.85em' }} spellCheck={false}
                        placeholder='Paste a previously exported settings string...'
                        value={this.importCode}
                        onChange={e => this.importCode = e.target.value}
                        size='small'
                    />
                    <Button onClick={() => {
                        try {
                            const data = JSON.parse(this.importCode);
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
                                message.warn('Some properties were skipped during import:\n' + skipped.join(', '));
                            else
                                message.success('Settings imported successfully');
                            this.importCode = "";
                        } catch (e) {
                            message.error('Unable to import settings. See console for more information.');
                            console.error('unable to import settings', { error: e });
                        }

                    }}>Import</Button>
                </div>
            </Label>

            <Label text='Export'>
                <Button onClick={() => {
                    try {
                        navigator.clipboard.writeText(JSON.stringify(uiSettings));
                        message.success('Preferences copied to clipboard!');
                    } catch (e) {
                        message.error('Unable to copy settings to clipboard. See console for more information.');
                        console.error('unable to copy settings to clipboard', { error: e });
                    }
                }}>
                    Export User Preferences
                </Button>
            </Label>

            <Label text='Reset'>
                <>
                    <div>
                        <Input style={{ maxWidth: '360px', marginRight: '8px', fontFamily: 'monospace', fontSize: '0.85em' }} spellCheck={false}
                            placeholder='type "reset" here to confirm and enable the button'
                            value={this.resetConfirm}
                            onChange={str => this.resetConfirm = str.target.value} />
                        <Button onClick={() => {
                            clearSettings();
                            message.success('All settings have been reset to their defaults');
                            this.resetConfirm = '';
                        }} danger disabled={this.resetConfirm != 'reset'}>Reset</Button>
                    </div>
                    <span className='smallText'>Clear all your user settings, resetting them to the default values</span>
                </>
            </Label>
        </>;
    }
}