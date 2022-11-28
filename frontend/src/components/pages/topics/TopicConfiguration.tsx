import { InfoCircleFilled } from '@ant-design/icons';
import { PencilIcon } from '@heroicons/react/solid';
import { Icon } from '@redpanda-data/ui';
import { Button, Input, Modal, Tooltip } from 'antd';
import { action, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { Component } from 'react';
import { ConfigEntryExtended } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { OptionGroup } from '../../../utils/tsxUtils';
import './TopicConfiguration.scss';

@observer
export default class ConfigurationEditor extends Component<{
    targetTopic: string | null, // topic name, or null if default configs
    entries: ConfigEntryExtended[]
}> {
    @observable isEditting = false;


    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        const entries = this.props.entries;
        const categories = entries.groupInto(x => x.category);

        return <>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <Button type="primary" style={{ width: '10em' }} onClick={this.toggleEdit} >
                    {this.isEditting ? 'Save' : 'Edit'}
                </Button>
                <div style={{ marginRight: 'auto' }} />

                <OptionGroup
                    options={{
                        'Structured View': 'structured',
                        'Table View': 'table',
                    }}
                    value={uiSettings.topicList.configViewType}
                    onChange={e => (uiSettings.topicList.configViewType = e)}
                />
            </div>
            {categories.map(x => <ConfigGroup key={x.key} groupName={x.key} entries={entries} />)}
        </>
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
    isEditting?: boolean;
    entries: ConfigEntryExtended[]
}) => {

    return <div className={'configGroup ' + (p.isEditting ? 'isEditting' : '')}>
        {p.groupName && <div className="configGroupTitle">{p.groupName}</div>}
        <div className="configGroupTable">
            {p.entries.map(e => <ConfigEntry key={e.name} entry={e} isEditting={p.isEditting} />)}
        </div>
    </div>
});

const ConfigEntry = observer((p: {
    isEditting?: boolean;
    entry: ConfigEntryExtended;
}) => {

    const entry = p.entry;

    const defaultValue = entry.synonyms && entry.synonyms.last()?.value;

    return <>
        <span className="configName">{p.entry.name}</span>
        <span className="configIcon documentation">
            {entry.documentation &&
                <Tooltip overlay={entry.documentation}><Icon as={InfoCircleFilled} /></Tooltip>
            }
        </span>
        {p.isEditting
            ? <Input value={String(entry.currentValue)} onChange={e => entry.currentValue = e.target.value} />
            : <span className="configValue">{entry.value}</span>
        }
        <span className="configIcon editted">
            {defaultValue &&
                <Tooltip overlay={<>Editted. Default value: <code>{defaultValue}</code></>}><Icon as={PencilIcon} /></Tooltip>
            }
        </span>
    </>
});


// topic default config
// topic specific config
