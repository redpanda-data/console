import React, { Component, ReactNode } from 'react';
import { observer } from "mobx-react"
import { Menu, Select, Avatar, Popconfirm, Dropdown, Button, Modal, Input, message, Checkbox } from 'antd';
import { uiSettings } from '../../state/ui';
import { RenderTrap, Spacer } from './common';
import { api } from '../../state/backendApi';
import Icon, { UserOutlined } from '@ant-design/icons';
import { IsBusiness } from '../../utils/env';
import { ChevronDownIcon, ToolsIcon } from '@primer/octicons-v2-react';
import { Label } from '../../utils/tsxUtils';
import { makeObservable, observable } from 'mobx';

const { Option } = Select;
type Action = () => void;

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
        </>
    }
}

const settingsTabs: { name: string, component: () => ReactNode }[] = [
    { name: "Statistics Bar", component: () => <StatsBarTab /> },
    // pagination position
    // { name: "Message Search", component: () => <MessageSearchTab /> },
    // { name: "Import/Export", component: () => <ImportExportTab /> },
];

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

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        return <div>
            <p>Controls on what pages kowl shows the statistics bar</p>

            <div style={{ display: 'inline-grid', gridAutoFlow: 'row', gridRowGap: '24px', gridColumnGap: '32px', marginRight: 'auto' }}>

                {/* <Label text='Brokers' style={{ gridColumn: 1 }}>
                    <Checkbox children='Enabled' checked={uiSettings.brokerList.showStatisticsBar} onChange={e => uiSettings.brokerList.showStatisticsBar = e.target.checked} />
                </Label> */}

                {/* <Label text='Topic List' style={{ gridColumn: 1 }}>
                    <Checkbox children='Enabled' checked={uiSettings.topicList.showStatisticsBar} onChange={e => uiSettings.topicList.showStatisticsBar = e.target.checked} />
                </Label> */}
                <Label text='Topic Details' style={{ gridColumn: 1 }}>
                    <Checkbox children='Enabled' checked={uiSettings.topicDetailsShowStatisticsBar} onChange={e => uiSettings.topicDetailsShowStatisticsBar = e.target.checked} />
                </Label>

                {/* <Label text='Consumer Group List' style={{ gridColumn: 1 }}>
                    <Checkbox children='Enabled' checked={uiSettings.consumerGroupList.showStatisticsBar} onChange={e => uiSettings.consumerGroupList.showStatisticsBar = e.target.checked} />
                </Label> */}
                <Label text='Consumer Group Details' style={{ gridColumn: 1 }}>
                    <Checkbox children='Enabled' checked={uiSettings.consumerGroupDetails.showStatisticsBar} onChange={e => uiSettings.consumerGroupDetails.showStatisticsBar = e.target.checked} />
                </Label>
            </div>
            {/* <Label text='Brokers'>
                <Select value={state.visibility} onChange={v => this.visibility = v}>
                    <Select.Option value='visible'>Show (default)</Select.Option>
                    <Select.Option value='hidden'>Hide</Select.Option>
                    <Select.Option value='perTopic' disabled>Per Topic (not yet implemented)</Select.Option>
                </Select>
            </Label> */}
        </div>
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
                <Input
                    style={{ padding: '2px 8px' }}
                    placeholder='paste exported preferences string here'
                    value={this.importCode}
                    onChange={e => {
                        // todo
                    }}
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