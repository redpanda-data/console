import { DashIcon, PlusIcon, XIcon } from '@primer/octicons-react';
import { Button, Input, Select } from 'antd';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { Component, MouseEvent, useEffect, useState } from 'react';
import { TopicConfigEntry } from '../../../../state/restInterfaces';
import { Label } from '../../../../utils/tsxUtils';
import { prettyBytes, prettyMilliseconds, titleCase } from '../../../../utils/utils';
import './CreateTopicModal.scss';


type CreateTopicModalState = {
    topicName: string; // required

    partitions?: number;
    replicationFactor?: number;
    minInSyncReplicas?: number;

    cleanupPolicy: 'delete' | 'compact';  // required

    retentionTimeMs: number;
    retentionTimeUnit: RetentionTimeUnit

    retentionSize: number;
    retentionSizeUnit: RetentionSizeUnit,

    additionalConfig: TopicConfigEntry[];

    defaults: {
        readonly retentionTime: string | undefined;
        readonly retentionBytes: string | undefined;
        readonly replicationFactor: string | undefined;
        readonly partitions: string | undefined;
        readonly cleanupPolicy: string | undefined;
        readonly minInSyncReplicas: string | undefined;
    }
};

type Props = {
    state: CreateTopicModalState
};


@observer
export class CreateTopicModalContent extends Component<Props> {


    render() {
        const state = this.props.state;

        return <div className="createTopicModal" >

            <div style={{ display: 'flex', gap: '2em', flexDirection: 'column' }}>
                <Label text="Topic Name">
                    <Input value={state.topicName} onChange={e => state.topicName = e.target.value} width="100%" autoFocus />
                </Label>

                <div style={{ display: 'flex', gap: '2em' }}>
                    <Label text="Partitions" style={{ flexBasis: '160px' }}>
                        <NumInput
                            value={state.partitions} onChange={e => state.partitions = e}
                            placeholder={state.defaults.partitions}
                            min={1}
                        />
                    </Label>
                    <Label text="Replication Factor" style={{ flexBasis: '160px' }}>
                        <NumInput
                            value={state.replicationFactor}
                            onChange={e => state.replicationFactor = e}
                            min={1}
                            placeholder={state.defaults.replicationFactor}
                        />
                    </Label>
                    <Label text="Min In-Sync Replicas" style={{ flexBasis: '160px' }}>
                        <NumInput
                            value={state.minInSyncReplicas}
                            onChange={e => state.minInSyncReplicas = e}
                            min={1}
                            placeholder={state.defaults.minInSyncReplicas}
                        />
                    </Label>
                </div>

                <div style={{ display: 'flex', gap: '2em' }}>
                    <Label text="Cleanup Policy" style={{ flexBasis: '160px' }}>
                        <Select options={[
                            { value: 'delete' },
                            { value: 'compact' },
                        ]}
                            defaultValue={state.cleanupPolicy}
                            onChange={e => state.cleanupPolicy = e}
                            style={{ width: '100%' }} />
                    </Label>
                    <Label text="Retention Time" style={{ flexBasis: '220px', flexGrow: 1 }}>
                        <RetentionTimeSelect
                            value={state.retentionTimeMs} onChangeValue={x => state.retentionTimeMs = x}
                            unit={state.retentionTimeUnit} onChangeUnit={x => state.retentionTimeUnit = x}
                            defaultConfigValue={state.defaults.retentionTime}
                        />
                    </Label>
                    <Label text="Retention Size" style={{ flexBasis: '220px', flexGrow: 1 }}>
                        <RetentionSizeSelect
                            value={state.retentionSize} onChangeValue={x => state.retentionSize = x}
                            unit={state.retentionSizeUnit} onChangeUnit={x => state.retentionSizeUnit = x}
                            defaultConfigValue={state.defaults.retentionBytes}
                        />
                    </Label>
                </div>

                <div>
                    <h4 style={{ fontSize: '13px' }}>Additional Configuration</h4>
                    <KeyValuePairEditor entries={state.additionalConfig} />
                </div>
            </div>

        </div>;
    }
}


export function NumInput(p: {
    value: number | undefined, onChange: (n: number | undefined) => void,
    placeholder?: string,
    min?: number, max?: number,
    disabled?: boolean,
    addonBefore?: React.ReactNode; addonAfter?: React.ReactNode;
    className?: string,
}) {
    // We need to keep track of intermediate values.
    // Otherwise, typing '2e' for example, would be rejected.
    // But the user might still add '5', and '2e5' is a valid number.
    const [editValue, setEditValue] = useState((p.value == null) ? undefined : String(p.value));
    useEffect(() => setEditValue((p.value == null) ? undefined : String(p.value)), [p.value]);

    const commit = (x: number | undefined) => {
        if (p.disabled) return;
        if (x != null && p.min != null && x < p.min) x = p.min;
        if (x != null && p.max != null && x > p.max) x = p.max;
        setEditValue(x == undefined ? x : String(x));
        p.onChange?.(x);
    };

    const changeBy = (dx: number) => commit((p.value ?? 0) + dx);
    const increment = (e: MouseEvent) => { changeBy(+1); e.preventDefault(); }
    const decrement = (e: MouseEvent) => { changeBy(-1); e.preventDefault(); }

    return <Input
        className={'numericInput ' + (p.className ?? '')}
        style={{ minWidth: '150px', width: '100%' }}
        spellCheck={false}
        placeholder={p.placeholder}
        disabled={p.disabled}

        value={(p.disabled && p.placeholder && p.value == null) ? undefined : editValue}
        onChange={e => {
            setEditValue(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value != '' && !Number.isNaN(n))
                p.onChange?.(n);
            else
                p.onChange?.(undefined);
        }}

        onWheel={e => changeBy(-Math.sign(e.deltaY))}

        suffix={!p.disabled &&
            <span className="btnWrapper" style={{ userSelect: 'none' }}>
                <span className="stepBtn dec" onMouseDownCapture={decrement}><DashIcon size={16} /></span>
                <span className="stepBtn inc" onMouseDownCapture={increment}><PlusIcon size={16} /></span>
            </span>
        }

        onBlur={() => {
            const s = editValue;
            if (s == undefined || s == '') {
                // still a valid value, meaning "default"
                commit(undefined);
                return;
            }

            const n = Number(s);
            if (!Number.isFinite(n)) {
                commit(undefined);
                return;
            }
            commit(n);
        }}

        addonBefore={p.addonBefore}
        addonAfter={p.addonAfter}
    />
}


export type RetentionTimeUnit = keyof typeof timeFactors;
const timeFactors = {
    'default': -1,
    'infinite': Number.POSITIVE_INFINITY,

    'ms': 1,
    'seconds': 1000,
    'minutes': 1000 * 60,
    'hours': 1000 * 60 * 60,
    'days': 1000 * 60 * 60 * 24,
    'months': 1000 * 60 * 60 * 24 * (365 / 12),
    'years': 1000 * 60 * 60 * 24 * 365,
} as const;

function RetentionTimeSelect(p: {
    value: number,
    unit: RetentionTimeUnit,
    onChangeValue: (v: number) => void,
    onChangeUnit: ((u: RetentionTimeUnit) => void),
    defaultConfigValue?: string | undefined,
}) {
    const { value, unit } = p;
    const numDisabled = unit == 'default' || unit == 'infinite';

    let placeholder: string | undefined;
    if (unit == 'default' && p.defaultConfigValue != null) {
        if (Number.isFinite(Number(p.defaultConfigValue)))
            placeholder = prettyMilliseconds(p.defaultConfigValue, { showLargeAsInfinite: true, showNullAs: 'default', verbose: true, unitCount: 2 });
        else placeholder = 'default';
    }
    if (unit == 'infinite')
        placeholder = 'Infinite';

    return <NumInput
        value={numDisabled ? undefined : value}
        onChange={x => p.onChangeValue(x ?? -1)}
        min={0}
        placeholder={placeholder}
        disabled={numDisabled}

        addonAfter={<Select
            style={{ minWidth: '90px' }}
            value={unit}
            onChange={u => {
                if (u == 'default') {
                    // * -> default
                    // save as milliseconds
                    p.onChangeValue(value * timeFactors[unit]);
                } else {
                    // * -> real
                    // convert to new unit
                    const factor = unit == 'default' ? 1 : timeFactors[unit];
                    const ms = value * factor;
                    let newValue = ms / timeFactors[u];
                    if (Number.isNaN(newValue))
                        newValue = 0;
                    if (/\.\d{4,}/.test(String(newValue)))
                        newValue = Math.round(newValue);
                    p.onChangeValue(newValue);
                }
                p.onChangeUnit(u);
            }}
            options={
                Object.entries(timeFactors).map(([name]) => {
                    const isSpecial = name == 'default' || name == 'infinite';
                    return {
                        value: name,
                        label: isSpecial ? titleCase(name) : name,
                        style: isSpecial ? { fontStyle: 'italic' } : undefined,
                    };
                })
            }
        />}
    />
}


export type RetentionSizeUnit = keyof typeof sizeFactors;
const sizeFactors = {
    'default': -1,
    'infinite': Number.POSITIVE_INFINITY,

    'Bit': 1,
    'KiB': 1024,
    'MiB': 1024 * 1024,
    'GiB': 1024 * 1024 * 1024,
    'TiB': 1024 * 1024 * 1024 * 1024,
} as const;

function RetentionSizeSelect(p: {
    value: number,
    unit: RetentionSizeUnit,
    onChangeValue: (v: number) => void,
    onChangeUnit: (u: RetentionSizeUnit) => void,
    defaultConfigValue?: string | undefined,
}) {
    const { value, unit } = p;
    const numDisabled = unit == 'default' || unit == 'infinite';

    let placeholder: string | undefined;
    if (unit == 'default') {
        if (p.defaultConfigValue != null && p.defaultConfigValue != '' && Number.isFinite(Number(p.defaultConfigValue))) {
            placeholder = prettyBytes(p.defaultConfigValue, { showLargeAsInfinite: true, showNullAs: 'default' });
        } else {
            placeholder = 'default';
        }
    }
    if (unit == 'infinite')
        placeholder = 'Infinite';

    return <NumInput
        value={numDisabled ? undefined : value}
        onChange={x => p.onChangeValue(x ?? -1)}
        min={0}
        placeholder={placeholder}
        disabled={numDisabled}

        addonAfter={<Select
            style={{ minWidth: '90px' }}
            value={unit}
            onChange={u => {
                if (u == 'default') {
                    // * -> default
                    // save as milliseconds
                    p.onChangeValue(value * sizeFactors[unit]);
                } else {
                    // * -> real
                    // convert to new unit
                    const factor = unit == 'default' ? 1 : sizeFactors[unit];
                    const ms = value * factor;
                    let newValue = ms / sizeFactors[u];
                    if (Number.isNaN(newValue))
                        newValue = 0;
                    if (/\.\d{4,}/.test(String(newValue)))
                        newValue = Math.round(newValue);
                    p.onChangeValue(newValue);
                }
                p.onChangeUnit(u);
            }}
            options={
                Object.entries(sizeFactors).map(([name]) => {
                    const isSpecial = name == 'default' || name == 'infinite';
                    return {
                        value: name,
                        label: isSpecial ? titleCase(name) : name,
                        style: isSpecial ? { fontStyle: 'italic' } : undefined,
                    };
                })
            }
        />}
    />
}


const KeyValuePairEditor = observer((p: { entries: TopicConfigEntry[] }) => {

    return <div className="keyValuePairEditor">
        {p.entries.map((x, i) => <KeyValuePair key={String(i)} entries={p.entries} entry={x} />)}

        <Button
            type="dashed"
            className="addButton"
            onClick={() => { p.entries.push({ name: '', value: '' }) }}
        >
            <PlusIcon />

            Add Entry
        </Button>
    </div>
});

const KeyValuePair = observer((p: { entries: TopicConfigEntry[], entry: TopicConfigEntry }) => {
    const { entry } = p;

    return <div className="inputGroup" style={{ width: '100%' }}>
        <Input placeholder="Property Name..." style={{ flexBasis: '30%' }} spellCheck={false} value={entry.name} onChange={e => entry.name = e.target.value} />
        <Input placeholder="Property Value..." style={{ flexBasis: '60%' }} spellCheck={false} value={entry.value} onChange={e => p.entry.value = e.target.value} />
        <Button className="iconButton deleteButton"
            onClick={(event) => {
                event.stopPropagation();
                p.entries.remove(p.entry);
            }}>
            <XIcon />
        </Button>
    </div>
});

export type { Props as CreateTopicModalProps };
export type { CreateTopicModalState };




export type DataSizeUnit = keyof typeof dataSizeFactors;
const dataSizeFactors = {
    'infinite': Number.POSITIVE_INFINITY,

    'Byte': 1,
    'KiB': 1024,
    'MiB': 1024 * 1024,
    'GiB': 1024 * 1024 * 1024,
    'TiB': 1024 * 1024 * 1024 * 1024,
} as const;


@observer
export class DataSizeSelect extends Component<{
    valueBytes: number,
        onChange: (bytes: number) => void,
        className?: string,
}> {

    @observable unit: DataSizeUnit;

    constructor(p: any) {
        super(p);

        const value = this.props.valueBytes;
        this.unit = 'Byte';
        // find best initial unit
        for (const [k, v] of Object.entries(dataSizeFactors)) {
            if (!Number.isFinite(v)) continue;
            const scaledValue = value / v;
            if (scaledValue >= 0 && scaledValue < 1024) {
                this.unit = k as DataSizeUnit;
                break;
            }
        }

        makeObservable(this);
    }

    render() {
        const unit = this.unit;
        const unitValue = this.props.valueBytes / dataSizeFactors[unit];

        const numDisabled = unit == 'infinite' /* || unit == 'default' */;

        let placeholder: string | undefined;
        if (unit == 'infinite')
            placeholder = 'Infinite';

        return <NumInput
            className={this.props.className}
            value={numDisabled ? undefined : unitValue}
            onChange={x => {
                if (x === undefined) {
                    this.props.onChange(0);
                    return;
                }

                const factor = dataSizeFactors[this.unit];
                const bytes = x * factor;
                this.props.onChange(bytes);
            }}
            min={0}
            placeholder={placeholder}
            disabled={numDisabled}

            addonAfter={<Select
                style={{ minWidth: '90px' }}
                value={unit}
                onChange={u => {
                    this.unit = u;
                }}
                options={
                    Object.entries(dataSizeFactors).map(([name]) => {
                        const isSpecial = name == 'default' || name == 'infinite';
                        return {
                            value: name,
                            label: isSpecial ? titleCase(name) : name,
                            style: isSpecial ? { fontStyle: 'italic' } : undefined,
                        };
                    })
                }
            />}
        />
    }
}


export type DurationUnit = keyof typeof durationFactors;
const durationFactors = {
    'default': -1,
    'infinite': Number.POSITIVE_INFINITY,

    'ms': 1,
    'seconds': 1000,
    'minutes': 1000 * 60,
    'hours': 1000 * 60 * 60,
    'days': 1000 * 60 * 60 * 24,
    'months': 1000 * 60 * 60 * 24 * (365 / 12),
    'years': 1000 * 60 * 60 * 24 * 365,
} as const;

@observer
export class DurationSelect extends Component<{
    valueMilliseconds: number,
        onChange: (bytes: number) => void,
        className?: string,
}> {

    @observable unit: DurationUnit;

    constructor(p: any) {
        super(p);

        const value = this.props.valueMilliseconds;
        this.unit = 'ms';
        // find best initial unit
        for (const [k, v] of Object.entries(durationFactors).sort((a, b) => b[1] - a[1]).reverse()) {
            if (!Number.isFinite(v)) continue;
            if (v < 0) continue;

            const scaledValue = value / v;
            if (scaledValue < 1000) continue;

            this.unit = k as DurationUnit;
            break;
        }

        makeObservable(this);
    }

    render() {
        const unit = this.unit;
        const unitValue = this.props.valueMilliseconds / durationFactors[unit];

        const numDisabled = unit == 'infinite' /* || unit == 'default' */;

        let placeholder: string | undefined;
        if (unit == 'infinite')
            placeholder = 'Infinite';

        return <NumInput
            className={this.props.className}
            value={numDisabled ? undefined : unitValue}
            onChange={x => {
                if (x === undefined) {
                    this.props.onChange(0);
                    return;
                }

                const factor = durationFactors[this.unit];
                const bytes = x * factor;
                this.props.onChange(bytes);
            }}
            min={0}
            placeholder={placeholder}
            disabled={numDisabled}

            addonAfter={<Select
                style={{ minWidth: '90px' }}
                value={unit}
                onChange={u => {
                    this.unit = u;
                }}
                options={
                    Object.entries(durationFactors).map(([name]) => {
                        const isSpecial = name == 'default' || name == 'infinite';
                        return {
                            value: name,
                            label: isSpecial ? titleCase(name) : name,
                            style: isSpecial ? { fontStyle: 'italic' } : undefined,
                        };
                    })
                }
            />}
        />
    }
}
