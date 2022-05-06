import { TrashIcon } from '@primer/octicons-react';
import { Button, Input, InputNumber, InputNumberProps, Select } from "antd";
import { observer } from "mobx-react";
import { Component, useState } from "react";
import { Label } from "../../../../utils/tsxUtils";

export type { Props as CreateTopicModalProps };
export type { State as CreateTopicModalState };

type State = Props['state'];

type Props = {
    state: {
        topicName: string; // required

        partitions?: number;
        replicationFactor?: number;
        minInSyncReplicas?: number;

        cleanupPolicy: 'delete' | 'compact';  // required
        retentionTimeMs?: number;
        retentionSize?: number;

        additionalConfig: { name: string; value: string }[];
    }
};


@observer
export class CreateTopicModalContent extends Component<Props> {
    render() {
        const state = this.props.state;

        return <div className="createTopicModal" >

            <div style={{ display: 'flex', gap: '2em', flexDirection: 'column' }}>
                <Label text='Topic Name' required>
                    <Input value={state.topicName} onChange={e => state.topicName = e.target.value} width='100%' />
                </Label>

                <div style={{ display: 'flex', gap: '2em' }}>
                    <Label text="Partitions" style={{ flexBasis: '160px' }}>
                        <NumInput placeholder='12 (default)' value={state.partitions} onChange={e => state.partitions = e} min={1} />
                    </Label>
                    <Label text="Replication Factor" style={{ flexBasis: '160px' }}>
                        <NumInput placeholder='1 (default)' value={state.replicationFactor} onChange={e => state.replicationFactor = e} min={1} />
                    </Label>
                    <Label text="Min In-Sync Replicas" style={{ flexBasis: '160px' }}>
                        <NumInput placeholder='1 (default)' value={state.minInSyncReplicas} onChange={e => state.minInSyncReplicas = e} min={1} />
                    </Label>
                </div>

                <div style={{ display: 'flex', gap: '2em' }}>
                    <Label text="Cleanup Policy" required style={{ flexBasis: '350px' }}>
                        <Select options={[
                            { value: 'delete' },
                            { value: 'compact' },
                        ]}
                            defaultValue={state.cleanupPolicy}
                            onChange={e => state.cleanupPolicy = e}
                            style={{ width: '100%' }} />
                    </Label>
                    <Label text="Retention Time" style={{ flexBasis: '220px' }}>
                        <NumInput placeholder='7 days (default)' value={state.retentionTimeMs} onChange={e => state.retentionTimeMs = e} min={1} />
                    </Label>
                    <Label text="Retention Size" style={{ flexBasis: '220px' }}>
                        <NumInput placeholder='10 GB (default)' value={state.retentionSize} onChange={e => state.retentionSize = e} min={1} />
                    </Label>
                </div>

                <div>
                    <h4 style={{ opacity: '0.5' }}>Additional Configurations</h4>
                    {/* <div style={{ display: 'grid', gridTemplateColumns: '5fr 10fr auto' }}> */}
                    <div className='inputGroup' style={{ width: '100%' }}>
                        <Select disabled placeholder='Select a property...' style={{ flexBasis: '30%' }} />
                        <Input disabled placeholder='Enter a value...' style={{ flexBasis: '60%' }} />
                        <Button disabled className="iconButton" icon={<TrashIcon />} />
                    </div>
                    {/* </div> */}
                </div>
            </div>

        </div>;
    }
}


const NumInput = (
    p: Pick<InputNumberProps<number | string>, 'value' | 'min' | 'max'> & {
        placeholder?: string,
        onChange: (n: number | undefined) => void,
    },
) => {
    let { value, min, max, onChange, ...props } = p;
    const [isValid, setValid] = useState(true);

    const errorStatus = { status: !isValid ? 'error' : undefined };

    return <InputNumber<string>
        style={{ minWidth: '150px', width: '100%' }}
        precision={0}


        {...props}

        defaultValue={coerceValue(p.value)}
        min={coerceValue(min)}
        max={coerceValue(max)}
        onChange={e => {
            let ok = false;
            if (typeof e === 'string' || typeof e === 'number') {
                const n = Number(e);
                if (!Number.isNaN(n)) {
                    p.onChange?.(n);
                    ok = true;
                }
            }
            setValid(ok);
        }}

        {...errorStatus}

        stringMode={true}
        // upHandler={null}
        // downHandler={null}
        keyboard
    />
};


const coerceValue = (x: number | string | null | undefined): string | undefined => {
    if (typeof x === 'number') return String(x);
    if (x == null) return undefined;
    return x;
};