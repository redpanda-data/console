import { InfoCircleOutlined } from '@ant-design/icons';
import { PencilIcon } from '@heroicons/react/solid';
import { AdjustmentsIcon } from '@heroicons/react/outline'
import { Icon } from '@redpanda-data/ui';
import { Input, message, Modal, Popover, Radio, Select } from 'antd';
import { action, makeObservable, observable } from 'mobx';
import { Observer, observer } from 'mobx-react';
import { Component } from 'react';
import { ConfigEntryExtended } from '../../../state/restInterfaces';
import { formatConfigValue } from '../../../utils/formatters/ConfigValueFormatter';
import { DataSizeSelect, DurationSelect, NumInput } from './CreateTopicModal/CreateTopicModal';
import './TopicConfiguration.scss';
import Search from 'antd/lib/input/Search';
import { ModalFunc } from 'antd/lib/modal/confirm';
import { api } from '../../../state/backendApi';


@observer
export default class ConfigurationEditor extends Component<{
    targetTopic: string | null, // topic name, or null if default configs
        entries: ConfigEntryExtended[],
        onForceRefresh: () => void,
}> {
    @observable isEditting = false;
    @observable filter: string | undefined = undefined;

    modal: ReturnType<ModalFunc> | null = null;
    @observable modalValueType = 'default' as 'default' | 'custom';

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    @action.bound editConfig(configEntry: ConfigEntryExtended) {
        if (this.modal) {
            this.modal.destroy();
        }

        configEntry.currentValue = configEntry.value;

        const defaultEntry = configEntry.synonyms?.last();
        const defaultValue = defaultEntry?.value ?? configEntry.value;
        const defaultSource = defaultEntry?.source ?? configEntry.source;
        const friendlyDefault = formatConfigValue(configEntry.name, defaultValue, 'friendly');
        const initialValueType = configEntry.isExplicitlySet ? 'custom' : 'default';
        this.modalValueType = initialValueType;

        this.modal = Modal.confirm({
            title: <><Icon as={AdjustmentsIcon} /> {'Edit ' + configEntry.name}</>,
            width: '80%',
            style: { minWidth: '400px', maxWidth: '600px', top: '50px' },
            bodyStyle: { paddingTop: '1em' },
            className: 'configModal',

            okText: 'Save changes',

            closable: false,
            keyboard: false,
            maskClosable: false,
            icon: null,

            content: <Observer>{() => {
                const isCustom = this.modalValueType == 'custom';

                return <div>
                    <p>Edit <code>{configEntry.name}</code> configuration for topic <code>{this.props.targetTopic}</code>.</p>
                    <div style={{
                        padding: '1em',
                        background: 'rgb(238, 238, 238)',
                        color: 'hsl(0deg 0% 50%)',
                        borderRadius: '8px',
                        margin: '1em 0'
                    }}>{configEntry.documentation}</div>

                    <div style={{ fontWeight: 'bold', marginBottom: '0.5em' }}>Value</div>
                    <Radio.Group className="valueRadioGroup" value={this.modalValueType} onChange={e => this.modalValueType = e.target.value} >
                        <Radio value="default">
                            <span>Default: </span>
                            <span style={{ fontWeight: 'bold' }}>{friendlyDefault}</span>
                            <div className="subText">Inherited from {defaultSource}</div>
                        </Radio>
                        <Radio value="custom">
                            <span>Custom</span>
                            <div className="subText">Set at topic configuration</div>
                            <div onClick={e => {
                                if (isCustom) {
                                    // If the editor is *already* active, we don't want to propagate clicks out to the radio buttons
                                    // otherwise they will steal focus, closing any select/dropdowns
                                    e.stopPropagation();
                                    e.preventDefault();
                                }
                            }}>
                                <ConfigEntryEditor className={'configEntryEditor ' + (isCustom ? '' : 'disabled')} entry={configEntry} />
                            </div>
                        </Radio>
                    </Radio.Group>
                </div>
            }}</Observer>,

            onOk: async () => {
                // When do we need to apply?
                // -> When the "type" changed (from default to custom or vice-versa)
                // -> When type is "custom" and "currentValue" changed
                // So this excludes the case where value was changed, but the type was "default" before and after
                let needToApply = false;
                if (this.modalValueType != initialValueType)
                    needToApply = true;
                if (this.modalValueType == 'custom' && configEntry.value != configEntry.currentValue)
                    needToApply = true;

                if (!needToApply)
                    return;

                const operation = this.modalValueType == 'custom'
                    ? 'SET'
                    : 'DELETE';

                try {
                    await api.changeTopicConfig(this.props.targetTopic, [
                        {
                            key: configEntry.name,
                            op: operation,
                            value: (operation == 'SET')
                                ? String(configEntry.currentValue)
                                : undefined,
                        }
                    ]);
                    message.success(<>Successfully updated config <code>{configEntry.name}</code></>)
                } catch (err) {
                    console.error('error while applying config change', { err, configEntry });
                }

                this.props.onForceRefresh();
            },
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
                <Popover overlayClassName="configDocumentationTooltip" content={
                    <div style={{ maxWidth: '400px' }}>
                        <div className="configDocuTitle">{entry.name}</div>
                        <div className="configDocuBody">{entry.documentation}</div>
                        <div className="configDocuSource">
                            <span className="title">Value</span>
                            <span>{friendlyValue}</span>
                            <span className="title">Source</span>
                            <span>{entry.source}</span>
                        </div>
                    </div>
                }>
                    <Icon as={InfoCircleOutlined} />
                </Popover>
            }
        </span>
    </>
});

export const ConfigEntryEditor = observer((p: {
    entry: ConfigEntryExtended;
    className?: string;
}) => {
    const entry = p.entry;
    switch (entry.frontendFormat) {
        case 'BOOLEAN':
            return <Select value={entry.currentValue} onChange={c => entry.currentValue = c} className={p.className}
                options={[
                    { value: 'false', label: 'False' },
                    { value: 'true', label: 'True' },
                ]}
            />

        case 'SELECT':
            return <Select value={entry.currentValue} onChange={e => entry.currentValue = e} className={p.className}>
                {(entry.enumValues ?? []).map(v => <Select.Option key={v}>
                    {v}
                </Select.Option>)}
            </Select>
        case 'MULTI_SELECT':
            return <Select value={entry.currentValue} onChange={e => entry.currentValue = e} mode="multiple" className={p.className}>
                {(entry.enumValues ?? []).map(v => <Select.Option key={v}>
                    {v}
                </Select.Option>)}
            </Select>

        case 'BYTE_SIZE':
            return <DataSizeSelect valueBytes={Number(entry.currentValue ?? 0)} onChange={e => entry.currentValue = e} className={p.className} />
        case 'DURATION':
            return <DurationSelect valueMilliseconds={Number(entry.currentValue ?? 0)} onChange={e => entry.currentValue = e} className={p.className} />

        case 'PASSWORD':
        case 'RATIO':
            return <div>unknown config type</div>

        case 'INTEGER':
            return <NumInput value={Number(entry.currentValue)} onChange={e => entry.currentValue = Math.round(e ?? 0)} className={p.className} />

        case 'DECIMAL':
            return <NumInput value={Number(entry.currentValue)} onChange={e => entry.currentValue = e} className={p.className} />

        case 'STRING':
        default:
            return <Input value={String(entry.currentValue)} onChange={e => entry.currentValue = e.target.value} className={p.className} />
    }
});



// topic default config
// topic specific config
