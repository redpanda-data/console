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
            const validationResult = await api.validateConnectorConfig(clusterName, pluginClassName, {
                "connector.class": pluginClassName,
                "name": "",
                "topic": "topic",
                "topics": "topics",
            });
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

            // Notify groups about errors in their children
            for (const g of this.allGroups)
                g.propertiesWithErrors.push(...g.properties.filter(p => p.errors.length > 0));

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
                if (p.entry.definition.required == false) {
                    if (p.value == p.entry.definition.default_value)
                        continue;
                    if (p.value === false && !p.entry.definition.default_value)
                        continue; // skip boolean values that default to false
                }

                // Skip null/undefined
                if (p.value === null || p.value === undefined)
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

    // todo:
    // The code that handles validation/updating/adding/removing properties really shouldn't be part of this page-component
    // It's too much code in here, it should be split out into some seperate class or something when we have time...
    validate = action(async (config: object) => {
        const { clusterName, pluginClassName } = this.props;
        try {
            // Validate the current config
            const validationResult = await api.validateConnectorConfig(clusterName, pluginClassName, config);
            const srcProps = createCustomProperties(validationResult.configs, this.fallbackGroupName);

            // Remove properties that don't exist anymore
            const srcNames = new Set(srcProps.map(x => x.name));
            const removedProps = [...this.propsByName.keys()].filter(key => !srcNames.has(key));
            for (const key of removedProps) {
                // group names might not be accurate so we check all groups
                for (const g of this.allGroups)
                    g.properties.removeAll(x => x.name == key);

                // remove from lookup
                this.propsByName.delete(key);
            }

            // Remove empty groups
            this.allGroups.removeAll(x => x.properties.length == 0);

            // Handle new properties, transfer reported errors and suggested values
            for (const source of srcProps) {
                const target = this.propsByName.get(source.name);

                // Add new property
                if (!target) {
                    this.propsByName.set(source.name, source);
                    let group = this.allGroups.first(g => g.groupName == source.entry.definition.group);
                    if (!group) {
                        // Create new group
                        group = observable({
                            groupName: source.entry.definition.group,
                            properties: [],
                            propertiesWithErrors: [],
                        } as PropertyGroup);

                        this.allGroups.push(group);

                        // Sort groups
                        const groupNames = [this.fallbackGroupName, ...validationResult.groups];
                        this.allGroups.sort((a, b) => groupNames.indexOf(a.groupName) - groupNames.indexOf(b.groupName));
                    }

                    group.properties.push(source);
                    source.propertyGroup = group;

                    // Sort properties within group
                    group.properties.sort((a, b) => a.entry.definition.order - b.entry.definition.order);

                    continue;
                }

                // Update: recommended values
                const suggestedSrc = source.entry.value.recommended_values;
                const suggestedTar = target.entry.value.recommended_values;
                if (!suggestedSrc.isEqual(suggestedTar))
                    suggestedTar.updateWith(suggestedSrc);

                // Update: errors
                if (!target.errors.isEqual(source.errors)) {
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

const hiddenProperties = [
    "connector.class" // user choses that in the first page of the wizard
];

const converters = [
    "io.confluent.connect.avro.AvroConverter",
    "io.confluent.connect.protobuf.ProtobufConverter",
    "org.apache.kafka.connect.storage.StringConverter",
    "org.apache.kafka.connect.json.JsonConverter",
    "io.confluent.connect.json.JsonSchemaConverter",
    "org.apache.kafka.connect.converters.ByteArrayConverter",
];
const suggestedValues: { [key: string]: string[] } = {
    "key.converter": converters,
    "value.converter": converters,
    "header.converter": converters,
    "config.action.reload": [
        "restart",
        "none"
    ]
};

// Creates our Property objects, while fixing some issues with the source data
// like: missing value, propertyWidth, group, ...
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
        .map(p => {
            const name = p.definition.name;

            // Fix type of default values
            let defaultValue: any = p.definition.default_value;
            let initialValue: any = p.value.value;
            if (p.definition.type == DataType.Boolean) {
                // Boolean
                // convert 'false' | 'true' to actual boolean values
                if (typeof defaultValue == 'string')
                    if (defaultValue.toLowerCase() == 'false')
                        defaultValue = p.definition.default_value = false as any;
                    else if (defaultValue.toLowerCase() == 'true')
                        defaultValue = p.definition.default_value = true as any;

                if (typeof initialValue == 'string')
                    if (initialValue.toLowerCase() == 'false')
                        initialValue = p.value.value = false as any;
                    else if (initialValue.toLowerCase() == 'true')
                        initialValue = p.value.value = true as any;
            }
            if (p.definition.type == DataType.Int || p.definition.type == DataType.Long || p.definition.type == DataType.Short) {
                // Number
                const n = Number.parseFloat(defaultValue);
                if (Number.isFinite(n))
                    defaultValue = p.definition.default_value = n as any;
            }

            let value: any = initialValue ?? defaultValue;
            if (p.definition.type == DataType.Boolean && value == null)
                value = false; // use 'false' as default for boolean

            return observable({
                name: name,
                entry: p,
                value: value,
                isHidden: hiddenProperties.includes(name),
                suggestedValues: suggestedValues[name],
                errors: p.value.errors ?? []
            } as Property);
        })
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
    value: null | string | number | boolean | string[];

    isHidden: boolean; // currently only used for "connector.class"
    suggestedValues: undefined | string[]; // values that are not listed in entry.value.recommended_values

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