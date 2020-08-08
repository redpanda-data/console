import React, { Component, ReactNode } from 'react';
import { observer } from "mobx-react"
import { Menu, Select, Avatar, Popconfirm, Dropdown, Button, Modal, Input, message } from 'antd';
import { uiSettings } from '../../state/ui';
import { RenderTrap, Spacer } from './common';
import { api } from '../../state/backendApi';
import Icon, { UserOutlined } from '@ant-design/icons';
import { IsBusiness } from '../../utils/env';
import { ChevronDownIcon, ToolsIcon } from '@primer/octicons-v2-react';
import { Label } from '../../utils/tsxUtils';
import { observable } from 'mobx';

const { Option } = Select;
type Action = () => void;

/*
settings:
- import, export, reset
- message search max results options: 10, 50, 500, ...

- statistics bar:
    - enabled: (default: true)
    - (later) size: auto (default), small (just like small width mode, but always), tiny (even more reduced paddings/fonts)
*/
@observer
export class UserPreferencesButton extends Component {
    @observable isOpen = false;

    render() {

        return null;

        return <>
            <UserPreferencesDialog visible={this.isOpen} onClose={() => this.isOpen = false} />
            <Button shape='circle' icon={<ToolsIcon size={17} />} className='hoverButton userPreferencesButton'
                onClick={() => this.isOpen = true}
            />
        </>
    }
}

const settingsTabs: { name: string, component: () => ReactNode }[] = [
    { name: "Statistics Bar", component: () => <StatsBarTab /> },
    { name: "Message Search", component: () => <MessageSearchTab /> },
    { name: "Import/Export", component: () => <ImportExportTab /> },
];

@observer
class UserPreferencesDialog extends Component<{ visible: boolean, onClose: Action }> {
    @observable selectedTab: string = settingsTabs[0].name;

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
                    <Menu mode='vertical' style={{ width: '160px', height: '100%' }} selectedKeys={[this.selectedTab]} onClick={p => this.selectedTab = p.key}>
                        {settingsTabs.map(t => <Menu.Item key={t.name} >{t.name}</Menu.Item>)}
                    </Menu>

                    {/* Content */}
                    <div style={{ flexGrow: 1, padding: '0 20px', display: 'flex', gap: '16px', flexDirection: 'column' }}>
                        <div className='h3' style={{ marginTop: '16px', marginBottom: '8px' }}>{tab?.name}</div>
                        {tab?.component()}
                    </div>
                </div>
            </Modal>
    }
}

@observer
class StatsBarTab extends Component {
    @observable visibility = 'visible';
    render() {
        return (
            <Label text='Visibility'>
                <Select value={this.visibility} onChange={v => this.visibility = v}>
                    <Select.Option value='visible'>Show (default)</Select.Option>
                    <Select.Option value='hidden'>Hide</Select.Option>
                    <Select.Option value='perTopic' disabled>Per Topic (not yet implemented)</Select.Option>
                </Select>
            </Label>
        )
    }
}

@observer
class MessageSearchTab extends Component {
    render() {
        return <>
            <Label text='Max Results'>
                <Input
                    style={{ padding: '2px 8px' }}
                    value={"abc 123"}
                    onChange={e => { }}
                    size='small' />
            </Label>
            <p>You can customize the available options in the </p>

        </>
    }
}

@observer
class ImportExportTab extends Component {
    @observable importCode = '';
    @observable resetConfirm = '';
    render() {
        return <>
            <Label text='Import'>
                <Input
                    style={{ padding: '2px 8px' }}
                    placeholder='paste exported preferences string here'
                    value={this.importCode}
                    onChange={e => { }}
                    onPaste={p => console.log('onPaste event', p)}
                    onPasteCapture={p => console.log('onPasteCapture event', p)}
                    size='small' />
            </Label>

            <Label text='Export'>
                <Button onClick={() => { message.success('Preferences copied to clipboard!') }}>
                    Export User Preferences
                </Button>
            </Label>

            <Label text='Reset'>
                <div>
                    <div>
                        <Input style={{ maxWidth: '360px', marginRight: '8px' }}
                            placeholder='type "reset" here to confirm and enable the button'
                            value={this.resetConfirm}
                            onChange={str => this.resetConfirm = str.target.value} />
                        <Button onClick={() => { message.success('Preferences copied to clipboard!') }} danger disabled={this.resetConfirm != 'reset'}>Reset</Button>
                    </div>
                    <span className='smallText'>Clear all your user settings, resetting them to the default values</span>
                </div>
            </Label>
        </>
    }
}