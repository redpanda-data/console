/* eslint-disable no-useless-escape */
import { Collapse, Skeleton } from 'antd';
import { action, autorun, comparer, has, IReactionDisposer, makeObservable, observable, reaction } from 'mobx';
import { observer } from 'mobx-react';
import { Component } from 'react';
import { api } from '../../../../state/backendApi';
import { ConnectorProperty, DataType, PropertyWidth } from '../../../../state/restInterfaces';
import { IsDev } from '../../../../utils/env';
import { scrollTo } from "../../../../utils/utils";
import { removeNamespace } from '../helper';
import { DebugEditor } from './DebugEditor';
import { PropertyGroupComponent } from './PropertyGroup';


export interface ConfigPageProps {
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

    fallbackGroupName: string = "";
    reactionDisposers: IReactionDisposer[] = [];

    constructor(p: any) {
        super(p);
        makeObservable(this);

        this.fallbackGroupName = removeNamespace(this.props.pluginClassName);
        this.initConfig();
    }

    componentWillUnmount() {
        for (const r of this.reactionDisposers)
            r();
    }

    @action.bound async initConfig() {
        const { clusterName, pluginClassName } = this.props;

        setTimeout(() => {
            scrollTo('selectedConnector', 'start', -20);
        }, 100);

        try {
            // Validate with empty object to get all properties initially
            const validationResult = await api.validateConnectorConfig(clusterName, pluginClassName, { "connector.class": pluginClassName, "name": "", "topic": "x", "topics": "y", });
            const allProps = createCustomProperties(validationResult.configs, this.fallbackGroupName);

            // Save props to map, so we can quickly find them to set their validation errors
            for (const p of allProps)
                this.propsByName.set(p.name, p);

            // Set last error values, so we know when to show the validation error
            for (const p of allProps)
                if (p.errors.length > 0)
                    p.lastErrorValue = p.value;

            // Create groups
            const groupNames = [this.fallbackGroupName, ...validationResult.groups];
            this.allGroups = allProps
                .groupInto(p => p.entry.definition.group)
                .map(g => (observable({ groupName: g.key, properties: g.items, propertiesWithErrors: [] }) as PropertyGroup))
                .sort((a, b) => groupNames.indexOf(a.groupName) - groupNames.indexOf(b.groupName));

            // Let properties know about their parent group, so they can add/remove themselves in 'propertiesWithErrors'
            for (const g of this.allGroups)
                for (const p of g.properties)
                    p.propertyGroup = g;

            // Update JSON
            this.reactionDisposers.push(reaction(
                () => {
                    return this.getConfigObject();
                },
                (config) => {
                    this.jsonText = JSON.stringify(config, undefined, 4);
                    this.props.onChange(this.jsonText);
                },
                { delay: 100, fireImmediately: true, equals: comparer.structural }
            ));

            // Validate on changes
            this.reactionDisposers.push(reaction(
                () => {
                    return this.getConfigObject();
                },
                (config) => {
                    this.validate(config);
                },
                { delay: 300, fireImmediately: true, equals: comparer.structural }
            ));

        } catch (err: any) {
            this.error = typeof err == 'object' ? (err.message ?? JSON.stringify(err, undefined, 4)) : JSON.stringify(err, undefined, 4);
        }

        this.initPending = false;
    }

    getConfigObject(): object {
        const config = {} as any;

        for (const g of this.allGroups)
            for (const p of g.properties) {

                // Skip default values
                if (p.value == p.entry.definition.default_value)
                    continue;

                // Skip empty values for strings
                if (StringLikeTypes.includes(p.entry.definition.type))
                    if (p.value == null || p.value == "")
                        continue;

                // Include the value
                config[p.name] = p.value;
            }

        return config;
    }

    validate = action(async (config: object) => {
        const { clusterName, pluginClassName } = this.props;
        try {
            // Validate with empty object to get all properties initially
            const validationResult = await api.validateConnectorConfig(clusterName, pluginClassName, config);
            const srcProps = createCustomProperties(validationResult.configs, this.fallbackGroupName);

            // Transfer reported errors
            for (const source of srcProps) {
                const target = this.propsByName.get(source.name);
                if (target) {
                    if (target.errors.length == 0 && source.errors.length == 0)
                        continue;

                    // Update with new errors
                    target.errors.updateWith(source.errors);

                    // Add or remove from parent group
                    const hasErrors = target.errors.length > 0;
                    if (hasErrors)
                        target.propertyGroup.propertiesWithErrors.pushDistinct(target);
                    else
                        target.propertyGroup.propertiesWithErrors.remove(target);
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
                        className={(g.propertiesWithErrors.length > 0) ? 'hasErrors' : ''}
                        key={g.groupName}
                        header={<div style={{ display: 'flex', alignItems: 'center', gap: '1em' }}>
                            <span style={{ fontSize: 'larger', fontWeight: 600, fontFamily: 'Open Sans' }}>{g.groupName}</span>
                            <span className='issuesTag'>{g.propertiesWithErrors.length} issues</span>
                        </div>}
                    >
                        <PropertyGroupComponent group={g} />
                    </Collapse.Panel>
                )}
            </Collapse>

            {IsDev && <DebugEditor observable={this} />}
        </>;
    }
}


function createCustomProperties(properties: ConnectorProperty[], fallbackGroupName: string): Property[] {

    // Fix missing properties
    for (const p of properties) {
        const def = p.definition;

        if (!def.width || def.width == PropertyWidth.None)
            def.width = PropertyWidth.Medium;

        if (!def.group)
            def.group = fallbackGroupName;

        if (def.order < 0)
            def.order = Number.POSITIVE_INFINITY;
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


export interface PropertyGroup {
    groupName: string;
    properties: Property[];

    propertiesWithErrors: Property[];
}

export interface Property {
    name: string;
    entry: ConnectorProperty;
    value: string | number | boolean | string[];

    isHidden: boolean; // currently only used for "connector.class"

    errors: string[];
    lastErrorValue: any;

    propertyGroup: PropertyGroup;
}


const StringLikeTypes = [
    DataType.String,
    DataType.Class,
    DataType.List,
    DataType.Password
];