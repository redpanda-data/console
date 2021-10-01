/* eslint-disable no-useless-escape */
import { EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { Input, InputNumber, Switch, Select, Tooltip } from 'antd';
import { observer } from 'mobx-react';
import { DataType, PropertyWidth } from '../../../../state/restInterfaces';
import { findPopupContainer, InfoText } from '../../../../utils/tsxUtils';
import { Property } from './components';


export const PropertyComponent = observer((props: { property: Property }) => {
    const p = props.property;
    const def = p.entry.definition;
    if (p.isHidden) return null;
    if (p.entry.value.visible === false) return null;

    let comp = <div key={p.name}>
        <div>"{p.name}" (unknown type "{def.type}")</div>
        <div style={{ fontSize: 'smaller' }} className='codeBox'>{JSON.stringify(p.entry, undefined, 4)}</div>
    </div>;

    let v = p.value;
    if (typeof p.value != 'string')
        if (typeof p.value == 'number' || typeof p.value == 'boolean')
            v = String(v);
        else
            v = "";

    switch (def.type) {
        case "STRING":
        case "CLASS":
            const recValues = p.entry.value.recommended_values;
            if (recValues && recValues.length) {
                const options = recValues.map((x: string) => ({ label: x, value: x }));
                // Enum
                comp = <Select showSearch options={options} value={p.value as any} onChange={e => p.value = e} />
            }
            else {
                // String or class
                comp = <Input value={String(v)} onChange={e => p.value = e.target.value} defaultValue={def.default_value ?? undefined} />
            }
            break;

        case "PASSWORD":
            comp = <Input.Password value={String(p.value ?? '')} onChange={e => p.value = e.target.value} iconRender={visible => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)} />
            break;

        case "INT":
        case "LONG":
            comp = <InputNumber style={{ display: 'block' }} value={Number(p.value)} onChange={e => p.value = e} />
            break;

        case "BOOLEAN":
            comp = <Switch checked={Boolean(p.value)} onChange={e => p.value = e} />
            break;

        case "LIST":
            comp = <Input value={String(v)} onChange={e => p.value = e.target.value} defaultValue={def.default_value ?? undefined} />
            // comp = <Input readOnly value="(List input will be added soon)" />;
            break;
    }

    if (def.type != DataType.Boolean) {
        const errAr = p.errors;
        const hasError = errAr.length > 0 && (p.value === p.lastErrorValue);

        comp = <div className={'inputWrapper ' + (hasError ? 'hasError' : '')}>
            {comp}
            <div className='validationFeedback'>{hasError ? errAr[0] : null}</div>
        </div>;
    }


    // Attach tooltip
    let name = <Tooltip overlay={def.name} placement='top' trigger="click" mouseLeaveDelay={0} getPopupContainer={findPopupContainer}>
        <span style={{ fontWeight: 600, cursor: 'pointer' }}>{def.display_name}</span>
    </Tooltip>;

    if (def.documentation)
        name = <InfoText tooltip={def.documentation} iconSize='12px' transform='translateY(1px)' gap='6px' placement='right' maxWidth='450px' align='left' >{name}</InfoText>


    // Wrap name and input element
    return <div className={inputSizeToClass[def.width]}>
        <div style={{ display: 'flex', width: 'fit-content', alignItems: 'center', marginBottom: '4px' }}>
            {def.required && requiredStar}
            {name}
        </div>

        {/* Control */}
        {comp}
    </div>
});


const requiredStar = <span style={{
    lineHeight: '0px', color: 'red', fontSize: '1.5em', marginTop: '3px', maxHeight: '0px', transform: 'translateX(-11px)', width: 0
}}>*</span>;


const inputSizeToClass = {
    [PropertyWidth.None]: "none",
    [PropertyWidth.Short]: "short",
    [PropertyWidth.Medium]: "medium",
    [PropertyWidth.Long]: "long",
} as const;
