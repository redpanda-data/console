/* eslint-disable no-useless-escape */
import { EyeInvisibleOutlined, EyeTwoTone } from '@ant-design/icons';
import { Collapse, Input, InputNumber, Switch, Select, Skeleton, Tooltip } from 'antd';
import { action, autorun, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { Component, CSSProperties } from 'react';
import { api } from '../../../../state/backendApi';
import { ApiError, ConnectorProperty, ConnectorValidationResult, DataType, PropertyWidth } from '../../../../state/restInterfaces';
import { findPopupContainer, InfoText } from '../../../../utils/tsxUtils';
import { scrollTo } from "../../../../utils/utils";

// React Editor
import KowlEditor from '../../../misc/KowlEditor';

// Monaco Type
import * as monacoType from 'monaco-editor/esm/vs/editor/editor.api';
import { toJson } from '../../../../utils/jsonUtils';
export type Monaco = typeof monacoType;


interface PropertyGroup {
    groupName: string;
    properties: Property[];
}

interface Property {
    name: string;
    entry: ConnectorProperty;
    value: string | number | boolean | string[];

    isHidden: boolean; // currently only used for "connector.class"

    errors: string[];
    lastErrorValue: any;
}

interface ConfigPageProps {
    clusterName: string;
    pluginClassName: string;
    onChange: (jsonText: string) => void
}

@observer
export class ConfigPage extends Component<ConfigPageProps> {

    @observable allGroups: PropertyGroup[] = [];
    propsByName = new Map<string, Property>();
    @observable jsonText = "";
    @observable error: string | undefined = undefined;
    @observable initPending = true;

    constructor(p: any) {
        super(p);
        makeObservable(this);

        this.initConfig();
    }

    async initConfig() {
        const { clusterName, pluginClassName } = this.props;

        setTimeout(() => {
            scrollTo('selectedConnector', 'start', -20);
        }, 100);

        try {
            // Validate with empty object to get all properties initially
            const validationResult = await api.validateConnectorConfig(clusterName, pluginClassName, {
                "name": "",
                "connector.class": pluginClassName,
                "topic": "x",
                "topics": "y",
            });

            const allProps = this.createCustomProperties(validationResult.configs);

            for (const p of allProps)
                this.propsByName.set(p.name, p);

            // Set last error values, so we know when to show the validation error
            for (const p of allProps)
                if (p.errors.length > 0)
                    p.lastErrorValue = p.value;

            // Create groups
            this.allGroups = allProps
                .groupInto(p => p.entry.definition.group)
                .map(g => ({ groupName: g.key, properties: g.items } as PropertyGroup));

            // Create json for use in editor
            autorun(() => {
                const jsonObj = {} as any;
                for (const g of this.allGroups)
                    for (const p of g.properties) {
                        if (p.entry.definition.required || (p.value != null && p.value != p.entry.definition.default_value))
                            jsonObj[p.name] = p.value;
                    }
                this.jsonText = JSON.stringify(jsonObj, undefined, 4);
                this.props.onChange(this.jsonText);
            });

            // Whenever a value changes, re-validate the config
            autorun(() => {
                const config = {} as any;
                for (const g of this.allGroups)
                    for (const p of g.properties) {
                        if (p.entry.definition.required || (p.value != null && p.value != p.entry.definition.default_value))
                            config[p.name] = p.value;
                    }

                this.validate(config);
            }, { delay: 150 });

        } catch (err: any) {
            this.error = typeof err == 'object' ? (err.message ?? JSON.stringify(err, undefined, 4)) : JSON.stringify(err, undefined, 4);
        }

        this.initPending = false;
    }

    validate = action(async (config: object) => {
        const { clusterName, pluginClassName } = this.props;
        try {
            // Validate with empty object to get all properties initially
            const validationResult = await api.validateConnectorConfig(clusterName, pluginClassName, config);
            const srcProps = this.createCustomProperties(validationResult.configs);

            // Transfer properties
            for (const source of srcProps) {
                const target = this.propsByName.get(source.name);
                if (target) {
                    if (target.errors.length == 0 && source.errors.length == 0)
                        continue;
                    target.errors.updateWith(source.errors);
                }
            }

            // Set last error values, so we know when to show the validation error
            for (const g of this.allGroups)
                for (const p of g.properties)
                    p.lastErrorValue = p.value;

        } catch (err: any) {
            console.error('error validating config', err);
        }
    })

    createCustomProperties = (properties: ConnectorProperty[]): Property[] => {
        // Fix missing properties
        for (const p of properties) {
            const def = p.definition;
            if (!def.group)
                def.group = "Default";
            if (def.order < 0)
                def.order = Number.POSITIVE_INFINITY;
            if (!def.width || def.width == PropertyWidth.None)
                def.width = PropertyWidth.Medium;
        }

        // Create our own properties
        const allProps = properties
            .map(p => observable({
                name: p.definition.name,
                entry: p,
                value: p.definition.type == DataType.Boolean
                    ? (p.value.value ?? p.definition.default_value) ?? false
                    : p.value.value ?? p.definition.default_value,
                isHidden: ["connector.class"].includes(p.definition.name),

                errors: p.value.errors ?? []
            } as Property))
            .sort((a, b) => a.entry.definition.order - b.entry.definition.order);

        return allProps;
    }

    render() {
        if (this.error)
            return <div>
                <h3>Error</h3>
                <div className='codeBox'>{this.error}</div>
            </div>

        if (this.initPending)
            return <div><Skeleton loading={true} active={true} paragraph={{ rows: 20, width: '100%' }} /></div>

        if (this.allGroups.length == 0)
            return <div>debug: no groups</div>

        // const defaultExpanded = this.allGroups.map(x => x.groupName);
        const defaultExpanded = this.allGroups[0].groupName;

        // render components dynamically
        return <>
            <Collapse defaultActiveKey={defaultExpanded} ghost bordered={false}>
                {this.allGroups.map(g =>
                    <Collapse.Panel
                        key={g.groupName}
                        header={<div style={{ fontSize: 'larger', fontWeight: 600, fontFamily: 'Open Sans' }}>{g.groupName}</div>}
                    >
                        <PropertyGroupComponent group={g} />
                    </Collapse.Panel>
                )}
            </Collapse>

            <DebugEditor observable={this} />
        </>;
    }
}

const PropertyGroupComponent = (props: { group: PropertyGroup }) => {
    const g = props.group;

    return <div className='dynamicInputs'>
        {g.properties.map(p => <PropertyComponent key={p.name} property={p} />)}
    </div>
}

const requiredStar = <span style={{
    lineHeight: '0px', color: 'red', fontSize: '1.5em', marginTop: '3px', maxHeight: '0px', transform: 'translateX(-11px)', width: 0
}}>*</span>;

const inputSizeToClass = {
    [PropertyWidth.None]: "none",
    [PropertyWidth.Short]: "short",
    [PropertyWidth.Medium]: "medium",
    [PropertyWidth.Long]: "long",
} as const;

const PropertyComponent = observer((props: { property: Property }) => {
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




const DebugEditor = observer((p: { observable: { jsonText: string } }) => {
    const obs = p.observable;

    return <div style={{ marginTop: '1.5em' }}>
        <h4>Debug Editor</h4>
        <KowlEditor
            language='json'

            value={obs.jsonText}
            onChange={(v, e) => {
                if (v) {
                    if (!obs.jsonText && !v)
                        return; // dont replace undefiend with empty (which would trigger our 'autorun')
                    obs.jsonText = v;
                }
            }}
            height="300px"
        />
    </div>

});
