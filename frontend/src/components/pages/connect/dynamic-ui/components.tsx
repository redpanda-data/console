/* eslint-disable no-useless-escape */
import { CheckCircleTwoTone, ExclamationCircleTwoTone, EyeInvisibleOutlined, EyeTwoTone, WarningTwoTone } from '@ant-design/icons';
import { Button, Collapse, Input, InputNumber, message, notification, Popover, Statistic, Switch, Select } from 'antd';
import { motion } from 'framer-motion';
import { autorun, IReactionDisposer, makeObservable, observable, untracked } from 'mobx';
import { observer } from 'mobx-react';
import { Component, CSSProperties } from 'react';
import { appGlobal } from '../../../../state/appGlobal';
import { api } from '../../../../state/backendApi';
import { ApiError, ConnectorValidationResult, PropertyWidth } from '../../../../state/restInterfaces';
import { uiSettings } from '../../../../state/ui';
import { animProps } from '../../../../utils/animationProps';
import { Code, findPopupContainer, InfoText } from '../../../../utils/tsxUtils';
import Card from '../../../misc/Card';
import { sortField } from '../../../misc/common';
import { KowlTable } from '../../../misc/KowlTable';
import { PageComponent, PageInitHelper } from '../../Page';
import { ClusterStatisticsCard, ConnectorClass, NotConfigured, removeNamespace, TasksColumn, TaskState } from '../helper';


import postgresPropsRaw from '../../../../assets/postgres.json';

// React Editor
import Editor from "@monaco-editor/react";

// Monaco Type
import * as monacoType from 'monaco-editor/esm/vs/editor/editor.api';
export type Monaco = typeof monacoType;

const postgresProps = postgresPropsRaw as ConnectorValidationResult;

type ArrayElement<ArrayType extends readonly unknown[]> =
    ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

type PropertyEntry = ArrayElement<typeof postgresProps.configs>;

interface PropertyGroup {
    groupName: string;
    properties: Property[];
}

interface Property {
    name: string;
    entry: PropertyEntry;
    value: string | number | boolean | string[];

    isHidden: boolean; // currently only used for "connector.class"
}

@observer
export class DemoPage extends Component<{}> {

    @observable allGroups: PropertyGroup[] = [];
    // @observable propertiesMap = new Map<string, Property>();
    @observable jsonText = "";

    constructor(p: any) {
        super(p);
        makeObservable(this);

        const allProps = postgresProps.configs
            .map(p => ({
                name: p.definition.name,
                entry: p,
                value: p.value.value ?? p.definition.default_value,
                isHidden: ["connector.class"].includes(p.definition.name),
            } as Property))
            .sort((a, b) => a.entry.definition.order - b.entry.definition.order);

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
        });

    }

    render() {
        if (this.allGroups.length == 0)
            return <div>no groups</div>

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

const requiredStar = <span style={{ lineHeight: '0px', color: 'red', fontSize: '1.5em', marginRight: '3px', marginTop: '5px', maxHeight: '0px' }}>*</span>;

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

    let comp = <div key={p.name}>
        <div>"{p.name}" (unknown type "{def.type}")</div>
        <div style={{ fontSize: 'smaller' }} className='codeBox'>{JSON.stringify(p.entry, undefined, 4)}</div>
    </div>;

    switch (def.type) {
        case "STRING":
        case "CLASS":
            let v = p.value;
            if (typeof p.value != 'string')
                if (typeof p.value == 'number' || typeof p.value == 'boolean')
                    v = String(v);
                else
                    v = "";

            const recValues = p.entry.value.recommended_values;
            if (recValues && recValues.length) {
                const options = recValues.map((x: string) => ({ label: x, value: x }));
                // Enum
                comp = <Select showSearch options={options} value={p.value as any} onChange={e => p.value = e} />
            }
            else {
                // Text or Password
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

    }



    // Attach tooltip
    let name = <span style={{ fontWeight: 600 }}>{def.display_name}</span>;
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
        <h4>Output Preview</h4>
        <div style={{ border: '1px solid hsl(0deg, 0%, 90%)', borderRadius: '2px' }}>

            <Editor
                language='json'

                value={obs.jsonText}
                onChange={(v, e) => {
                    if (v) {
                        if (!obs.jsonText && !v)
                            return; // dont replace undefiend with empty (which would trigger our 'autorun')
                        obs.jsonText = v;
                    }
                }}

                options={{
                    readOnly: true,

                    minimap: {
                        enabled: false,
                    },
                    roundedSelection: false,
                    padding: {
                        top: 4,
                    },
                    showFoldingControls: 'always',
                    glyphMargin: false,
                    scrollBeyondLastLine: false,
                    lineNumbersMinChars: 4,
                    scrollbar: {
                        alwaysConsumeMouseWheel: false,
                    },
                    fontSize: 12,
                    occurrencesHighlight: false,
                    foldingHighlight: false,
                    selectionHighlight: false,
                }}

                height="300px"
            />
        </div></div>

});