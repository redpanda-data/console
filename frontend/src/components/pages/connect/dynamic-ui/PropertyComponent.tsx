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
import { Input, InputNumber, Switch, Select, Tooltip, AutoComplete } from 'antd';
import { observer } from 'mobx-react';
import { PropertyWidth } from '../../../../state/restInterfaces';
import { findPopupContainer, InfoText } from '../../../../utils/tsxUtils';
import { Property } from '../../../../state/connect/state';
import { CommaSeparatedStringList } from './List';
import { SecretInput } from './forms/SecretInput';

export const PropertyComponent = observer((props: { property: Property }) => {
    const p = props.property;
    const def = p.entry.definition;
    if (p.isHidden) return null;
    if (p.entry.value.visible === false) return null;

    let inputComp = <div key={p.name}>
        <div>"{p.name}" (unknown type "{def.type}")</div>
        <div style={{ fontSize: 'smaller' }} className="codeBox">{JSON.stringify(p.entry, undefined, 4)}</div>
    </div>;

    let v = p.value;
    if (typeof p.value != 'string') {
        if (typeof p.value == 'number' || typeof p.value == 'boolean')
            v = String(v);
        else
            v = '';
    }

    switch (def.type) {
        case 'STRING':
        case 'CLASS':
            const recValues = p.entry.value.recommended_values;
            if (recValues && recValues.length) {
                // Enum (recommended_values)
                const options = recValues.map((x: string) => ({ label: x, value: x }));
                inputComp = <Select
                    value={p.value as any}
                    onChange={e => p.value = e}
                    options={options}
                    getPopupContainer={findPopupContainer}
                    {...{ spellCheck: false }}
                />
            }
            else {
                // String, Class
                // Maybe we have some suggestions
                if (p.suggestedValues && p.suggestedValues.length > 0) {
                    // Input with suggestions
                    inputComp = <AutoComplete
                        value={String(v)}
                        onChange={e => p.value = e}
                        options={p.suggestedValues.map(x => ({ value: x }))}
                        getPopupContainer={findPopupContainer}
                        {...{ spellCheck: false }}
                    />
                }
                else {
                    // Input
                    inputComp = <Input value={String(v)} onChange={e => p.value = e.target.value} defaultValue={def.default_value ?? undefined} spellCheck={false} />
                }
            }
            break;

        case 'PASSWORD':
            inputComp = <SecretInput
                value={String(p.value ?? '')}
                updating={p.crud === 'update'}
                onChange={e => {
                    p.value = e;
                }} />
            break;

        case 'INT':
        case 'LONG':
        case 'SHORT':
        case 'DOUBLE':
        case 'FLOAT':
            inputComp = <InputNumber
                style={{ display: 'block' }}
                value={Number(p.value)}
                onChange={e => p.value = e}
            />
            break;

        case 'BOOLEAN':
            inputComp = <Switch checked={Boolean(p.value)} onChange={e => p.value = e} />
            break;

        case 'LIST':
            if (p.name == 'transforms') {
                inputComp = <CommaSeparatedStringList defaultValue={String(v)} onChange={x => p.value = x} />
            } else {
                inputComp = <Input value={String(v)} onChange={e => p.value = e.target.value} defaultValue={def.default_value ?? undefined} />
            }

            break;
    }

    // if (def.type != DataType.Boolean) {
    //     const errAr = p.errors;

    //     const err = errAr.length > 0 && (p.value === p.lastErrorValue)
    //         ? errAr.first(x => !x.includes('which has no default value')) ?? errAr[0]
    //         : null;

    //     inputComp = <div className={'inputWrapper ' + (err ? 'hasError' : '')}>
    //         {inputComp}
    //         <div className='validationFeedback'>
    //             {errAr.length > 1 && <span className='errorCount'>{errAr.length} Errors</span>}
    //             {err}
    //         </div>
    //     </div>;
    // }
    inputComp = <ErrorWrapper property={p} input={inputComp} />;


    // Tooltip 'raw name'
    const title = <Tooltip overlay={`${def.name} (${def.type})`} placement="top" trigger="click" mouseLeaveDelay={0} getPopupContainer={findPopupContainer}>
        <span style={{ fontWeight: 600, cursor: 'pointer', color: '#444', fontSize: '12px', paddingLeft: '1px' }}>{def.display_name}</span>
    </Tooltip>;

    // Tooltip 'documentation'
    const docuIcon = def.documentation &&
        <InfoText tooltip={def.documentation} iconSize="12px" transform="translateY(1px)" gap="6px" placement="right" maxWidth="450px" align="left" iconColor="#c7c7c7" />

    // Wrap name and input element
    return <div className={inputSizeToClass[def.width]}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
            {def.required && requiredStar}
            {title}
            {docuIcon}
            {/* <span className={'importanceTag ' + def.importance.toLowerCase()}>Importance: {def.importance.toLowerCase()}</span> */}
        </div>
        {inputComp}
    </div>
});


const requiredStar = <span style={{
    lineHeight: '0px', color: 'red', fontSize: '1.5em', marginTop: '3px', maxHeight: '0px', transform: 'translateX(-11px)', width: 0
}}>*</span>;


const inputSizeToClass = {
    [PropertyWidth.None]: 'none',
    [PropertyWidth.Short]: 'short',
    [PropertyWidth.Medium]: 'medium',
    [PropertyWidth.Long]: 'long',
} as const;


const ErrorWrapper = observer(function(props: { property: Property, input: JSX.Element }) {
    const { property, input } = props;
    const showErrors = property.errors.length > 0;

    const errors = showErrors
        ? property.errors
        : property.lastErrors;

    const errorToShow = showErrors
        ? errors[(property.currentErrorIndex % errors.length)]
        : undefined;

    const cycleError = showErrors
        ? () => property.currentErrorIndex++
        : undefined

    return <div className={'inputWrapper ' + ((errorToShow) ? 'hasError' : '')}>
        {input}
        <div className="validationFeedback" onClick={cycleError}>
            {errors.length > 1 && <span className="errorCount">{errors.length} Errors</span>}
            {errorToShow}
        </div>
    </div>
})
