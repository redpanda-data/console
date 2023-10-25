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

/* eslint-disable no-useless-escape */
import { Select } from 'antd';
import { observer } from 'mobx-react';
import { PropertyWidth } from '../../../../state/restInterfaces';
import { findPopupContainer } from '../../../../utils/tsxUtils';
import { Property } from '../../../../state/connect/state';
import { CommaSeparatedStringList } from './List';
import { SecretInput } from './forms/SecretInput';
import { Box, Input, NumberInput, RadioGroup, Switch } from '@redpanda-data/ui';
import { ErrorWrapper } from './forms/ErrorWrapper';

export const PropertyComponent = observer((props: { property: Property }) => {
    const p = props.property;
    const def = p.entry.definition;
    const metadata = p.entry.metadata;
    if (p.isHidden) return null;
    if (p.entry.value.visible === false) return null;

    let inputComp = (
        <div key={p.name}>
            <div>
                "{p.name}" (unknown type "{def.type}")
            </div>
            <div style={{ fontSize: 'smaller' }} className="codeBox">
                {JSON.stringify(p.entry, undefined, 4)}
            </div>
        </div>
    );

    const v = p.value;

    switch (def.type) {
        case 'STRING':
        case 'CLASS':
            const recValues = p.entry.value.recommended_values;
            if (metadata?.component_type === 'RADIO_GROUP') {
                const options =
                    metadata.recommended_values && metadata.recommended_values?.length > 0
                        ? metadata.recommended_values.map(({ value, display_name: label }) => ({ value, label }))
                        : recValues.map((v) => ({ value: v, label: String(v).toUpperCase() }));
                inputComp = (
                    <RadioGroup
                        onChange={(e) => {
                            p.value = String(e)
                        }}
                        options={options}
                        name={p.name}
                        defaultValue={String(v || def.default_value)}
                    />
                );
                break;
            }

            if (recValues && recValues.length) {
                // Enum (recommended_values)
                const options = recValues.map((x: string) => ({ label: x, value: x }));
                inputComp = (
                    <Select
                        value={v}
                        onChange={(e) => (p.value = e)}
                        options={options}
                        getPopupContainer={findPopupContainer}
                        {...{ spellCheck: false }}
                        style={{ minWidth: '260px' }}
                    />
                );
            } else {
                // Input
                inputComp = (
                    <Input
                        value={String(v)}
                        onChange={(e) => (p.value = e.target.value)}
                        defaultValue={def.default_value ?? undefined}
                        spellCheck={false}
                    />
                );
            }
            break;

        case 'PASSWORD':
            inputComp = (
                <SecretInput
                    value={String(v ?? '')}
                    updating={p.crud === 'update'}
                    onChange={(e) => {
                        p.value = e;
                    }}
                />
            );
            break;
        case 'INT':
        case 'LONG':
        case 'SHORT':
        case 'DOUBLE':
        case 'FLOAT':
            inputComp = <NumberInput value={Number(v)} onChange={(e) => (p.value = e)} />;
            break;

        case 'BOOLEAN':
            inputComp = <Switch isChecked={Boolean(v)} onChange={(e) => (p.value = e.target.checked)} />;
            break;

        case 'LIST':
            if (p.name == 'transforms') {
                inputComp = <CommaSeparatedStringList defaultValue={String(v)} onChange={(x) => (p.value = x)} />;
            } else {
                inputComp = (
                    <Input value={String(v)} onChange={(e) => (p.value = e.target.value)} defaultValue={def.default_value ?? undefined} />
                );
            }

            break;
    }

    inputComp = <ErrorWrapper property={p} input={inputComp} />;
    // Wrap name and input element
    return <Box className={inputSizeToClass[def.width]} mt="6">{inputComp}</Box>;
});

const inputSizeToClass = {
    [PropertyWidth.None]: 'none',
    [PropertyWidth.Short]: 'short',
    [PropertyWidth.Medium]: 'medium',
    [PropertyWidth.Long]: 'long',
} as const;
