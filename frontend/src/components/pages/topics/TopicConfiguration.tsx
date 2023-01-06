import { InfoCircleOutlined } from '@ant-design/icons';
import { PencilIcon } from '@heroicons/react/solid';
import { Icon } from '@redpanda-data/ui';
import { Input, Modal, Popover, Radio, Select } from 'antd';
import { action, makeObservable, observable } from 'mobx';
import { Observer, observer } from 'mobx-react';
import { Component } from 'react';
import { ConfigEntryExtended } from '../../../state/restInterfaces';
import { formatConfigValue } from '../../../utils/formatters/ConfigValueFormatter';
import { DataSizeSelect, DurationSelect, NumInput } from './CreateTopicModal/CreateTopicModal';
import './TopicConfiguration.scss';
import Search from 'antd/lib/input/Search';
import { ModalFunc } from 'antd/lib/modal/confirm';


@observer
export default class ConfigurationEditor extends Component<{
    targetTopic: string | null, // topic name, or null if default configs
        entries: ConfigEntryExtended[],
        onForceRefresh: () => void,
}> {
    @observable isEditting = false;
    @observable filter: string | undefined = undefined;

    modal: ReturnType<ModalFunc> | null = null;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    @action.bound editConfig(configEntry: ConfigEntryExtended) {
        if (this.modal) {
            this.modal.destroy();
        }

        this.modal = Modal.confirm({
            title: 'Edit ' + configEntry.name,
            width: '80%',
            style: { minWidth: '400px', maxWidth: '600px', top: '50px' },
            bodyStyle: { paddingTop: '1em' },

            okText: 'Save',

            closable: false,
            keyboard: false,
            maskClosable: false,

            content: <Observer>{() => {
                return <div>
                    <div>Edit <code>{configEntry.name}</code> configuration for topic <code>{this.props.targetTopic}</code>.</div>
                    <div style={{ padding: '1em', background: '#eee', color: '#444' }}>{configEntry.documentation}</div>

                    <div style={{ fontWeight: 'bold' }}>Value</div>
                    <Radio.Group value="default">
                        <Radio value="default">Default</Radio>
                        <Radio value="override">Custom</Radio>
                    </Radio.Group>
                </div>
            }}</Observer>,
        });
    }

    render() {
        let entries = this.props.entries;
        const filter = this.filter;
        if (filter)
            entries = entries.filter(x =>
                x.name.includes(filter) ||
                (x.value ?? '').includes(filter) ||
                (x.documentation ?? '').includes(filter)
            );

        const categories = entries.groupInto(x => x.category);
        for (const e of categories)
            if (!e.key)
                e.key = 'Other';

        return <div style={{ paddingTop: '1em' }}>
            <div className="configGroupTable">
                <Search className="searchBar"
                    value={this.filter}
                    placeholder="Filter"
                    onChange={e => this.filter = e.target.value} allowClear
                />
                {categories.map(x => <ConfigGroup key={x.key} groupName={x.key} entries={x.items} onEditEntry={this.editConfig} />)}
            </div>
        </div>
    }

    @action.bound toggleEdit() {
        const entries = this.props.entries;

        if (!this.isEditting) {
            // start editting
            for (const e of entries)
                e.currentValue = e.value;
        } else {
            // save new config
            // const newEntries = entries.map(x => ({
            //     key: x.name,
            //     op: 'SET',
            //     value: x.currentValue
            // } as PatchTopicConfigsEntry));

            Modal.error({
                title: 'Error Title',
                content: 'Error Content'

            });
            return;

        }
        this.isEditting = !this.isEditting;

    }
}

const ConfigGroup = observer((p: {
    groupName?: string;
    onEditEntry: (configEntry: ConfigEntryExtended) => void;
    entries: ConfigEntryExtended[]
}) => {

    return <>
        <div className="configGroupSpacer" />
        {p.groupName && <div className="configGroupTitle">{p.groupName}</div>}
        {p.entries.map(e => <ConfigEntry key={e.name} entry={e} onEditEntry={p.onEditEntry} />)}
    </>
});

const ConfigEntry = observer((p: {
    isEditting?: boolean;
    onEditEntry: (configEntry: ConfigEntryExtended) => void;
    entry: ConfigEntryExtended;
}) => {

    const entry = p.entry;
    // const defaultValue = entry.synonyms && entry.synonyms.last()?.value;

    const friendlyValue = formatConfigValue(entry.name, entry.value, 'friendly');

    return <>
        <span className="configName">
            {p.entry.name}
        </span>

        <span className="configValue">
            {friendlyValue}
        </span>

        <span className="isEditted" >
            {entry.isExplicitlySet && 'Edited'}
        </span>

        <span className="spacer">
        </span>

        <span className="configButtons">
            <span className="btnEdit" onClick={() => p.onEditEntry(p.entry)}>
                <Icon as={PencilIcon} />
            </span>
            {entry.documentation &&
                <Popover overlayClassName="configDocumentationTooltip" content={<div style={{ maxWidth: '400px' }}>{entry.documentation}</div>}>
                    <Icon as={InfoCircleOutlined} />
                </Popover>
            }
        </span>
    </>
});

export const ConfigEntryEditor = observer((p: {
    entry: ConfigEntryExtended;
}) => {
    const entry = p.entry;
    switch (entry.frontendFormat) {
        case 'BOOLEAN':
            return <Select value={entry.currentValue} onChange={c => entry.currentValue = c}
                options={[
                    { value: 'false', label: 'False' },
                    { value: 'true', label: 'True' },
                ]}
            />

        case 'SELECT':
            return <Select value={entry.currentValue} onChange={e => entry.currentValue = e}>
                {(entry.enumValues ?? []).map(v => <Select.Option key={v}>
                    {v}
                </Select.Option>)}
            </Select>
        case 'MULTI_SELECT':
            return <Select value={entry.currentValue} onChange={e => entry.currentValue = e} mode="multiple">
                {(entry.enumValues ?? []).map(v => <Select.Option key={v}>
                    {v}
                </Select.Option>)}
            </Select>

        case 'BYTE_SIZE':
            return <DataSizeSelect valueBytes={Number(entry.currentValue ?? 0)} onChange={e => entry.currentValue = e} />
        case 'DURATION':
            return <DurationSelect valueMilliseconds={Number(entry.currentValue ?? 0)} onChange={e => entry.currentValue = e} />

        case 'PASSWORD':
        case 'RATIO':
            return <div>unknown config type</div>

        case 'INTEGER':
            return <NumInput value={Number(entry.currentValue)} onChange={e => entry.currentValue = Math.round(e ?? 0)} />

        case 'DECIMAL':
            return <NumInput value={Number(entry.currentValue)} onChange={e => entry.currentValue = e} />

        case 'STRING':
        default:
            return <Input value={String(entry.currentValue)} onChange={e => entry.currentValue = e.target.value} />
    }
});



// topic default config
// topic specific config
