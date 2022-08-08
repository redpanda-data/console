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

import { CSSProperties } from 'react';
import { observer } from 'mobx-react';
import { Select } from 'antd';
import { AclOperation, AclStrPermission } from '../../../state/restInterfaces';
import { CheckIcon, XIcon, MinusIcon } from '@heroicons/react/solid';
const { Option } = Select;


const icons = {
    minus: <MinusIcon color="grey" />,
    check: <CheckIcon color="green" />,
    cross: <XIcon color="red" />,
}


export const Operation = observer((p: {
    operation: string | AclOperation,
    value: AclStrPermission,
    disabled?: boolean,
    onChange?: (v: AclStrPermission) => void,
    style?: CSSProperties
}) => {
    const disabled = p.disabled ?? false;

    const operationName = typeof p.operation == 'string'
        ? p.operation
        : AclOperation[p.operation];

    const optionContent = (icon: JSX.Element, text: string) => <>
        <div className="iconSelectOption">
            {icon}
            <span>{text}</span>
        </div>
    </>

    return <Select
        className="aclOperationSelect"
        style={Object.assign({}, p.style, { pointerEvents: disabled ? 'none' : undefined })}
        bordered={!disabled}
        disabled={disabled}

        size="middle"
        showArrow={false}
        value={p.value}
        onChange={p.onChange}
        virtual={false}
        defaultValue="Any"

        dropdownMatchSelectWidth={false}

        optionLabelProp="label"

    >
        <Option value="Any" label={optionContent(icons.minus, operationName)}>
            {optionContent(icons.minus, 'Not set')}
        </Option>
        <Option value="Allow" label={optionContent(icons.check, operationName)}>
            {optionContent(icons.check, 'Allow')}
        </Option>
        <Option value="Deny" label={optionContent(icons.cross, operationName)}>
            {optionContent(icons.cross, 'Deny')}
        </Option>
    </Select>
});
