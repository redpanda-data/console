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

import type { Secret } from './secret';
import { SecretsStore } from './secrets-store';
import type { ConnectorClusterFeatures } from './state';
import { removeNamespace } from '../../components/pages/connect/helper';
import { api } from '../backend-api';
import {
  type ConnectorGroup,
  type ConnectorProperty,
  type ConnectorStep,
  type ConnectorValidationResult,
  DataType,
  PropertyImportance,
  PropertyWidth,
} from '../rest-interfaces';

const sanitizeBoolean = (val: unknown) => {
  if (typeof val === 'boolean') {
    return val;
  }
  if (typeof val === 'string') {
    const lVal = val.toLowerCase();
    if (lVal === 'true') {
      return true;
    }
    if (lVal === 'false') {
      return false;
    }
    return val;
  }
  return false;
};

const sanitizeNumber = (val: unknown) => {
  const n = Number.parseFloat(String(val));
  return Number.isFinite(n) ? n : null;
};

function sanitizeDefaultValue(value: unknown, type: string) {
  switch (type) {
    case DataType.Boolean:
      return sanitizeBoolean(value);
    case DataType.Int:
    case DataType.Long:
    case DataType.Short:
      return sanitizeNumber(value);
    default:
      return value;
  }
}

function sanitizeValue(value: unknown, type: string) {
  switch (type) {
    case DataType.Boolean:
      return sanitizeBoolean(value);
    default:
      return value;
  }
}

export class ConnectorPropertiesStore {
  allGroups: PropertyGroup[] = [];
  propsByName = new Map<string, Property>();
  jsonText = '';
  error: string | undefined = undefined;
  crud: 'create' | 'update' = 'create';
  secrets: SecretsStore | null = null;
  showAdvancedOptions = false;
  viewMode: 'form' | 'json' = 'form';
  initPending = true;
  fallbackGroupName = '';
  private cleanupFunctions: Array<() => void> = [];

  connectorStepDefinitions: ConnectorStep[] = [];

  clusterName: string;
  pluginClassName: string;
  connectorType: 'sink' | 'source';
  private readonly appliedConfig: Record<string, unknown> | undefined;

  // Track changes for manual invalidation
  private changeListeners: Set<() => void> = new Set();

  // biome-ignore lint/nursery/useMaxParams: Legacy class with multiple constructor parameters
  constructor(
    clusterName: string,
    pluginClassName: string,
    connectorType: 'sink' | 'source',
    appliedConfig: Record<string, unknown> | undefined,
    features?: ConnectorClusterFeatures
  ) {
    this.clusterName = clusterName;
    this.pluginClassName = pluginClassName;
    this.connectorType = connectorType;
    this.appliedConfig = appliedConfig;

    if (features?.secretStore) {
      this.secrets = new SecretsStore();
    }
    if (features?.editing) {
      this.crud = 'update';
    }

    this.fallbackGroupName = removeNamespace(this.pluginClassName);
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    this.initConfig().catch(console.error);
  }

  version = 0;

  notifyChange() {
    this.version += 1;
    for (const listener of this.changeListeners) {
      listener();
    }
  }

  subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  getVersion = () => this.version;

  createPropertyGroup(step: ConnectorStep, group: ConnectorGroup, properties: Property[]): PropertyGroup {
    const self = this;

    return {
      step,
      group,
      properties,
      propertiesWithErrors: [],

      get filteredProperties(): Property[] {
        if (self.showAdvancedOptions) {
          // advanced mode shows all settings
          return this.properties;
        }
        // in simple mode, we only show props that are high importance
        return this.properties.filter((p) => p.entry.definition.importance === PropertyImportance.High);
      },
    };
  }

  getConfigObject(): object {
    if (this.viewMode === 'json') {
      return { 'connector.class': this.pluginClassName, ...parseConfigJson(this.jsonText) };
    }

    const config = {
      'connector.class': this.pluginClassName,
      ...this.appliedConfig,
    } as Record<string, unknown>;

    for (const g of this.allGroups) {
      for (const p of g.properties) {
        if (isSubmittedProperty(p, config)) {
          config[p.name] = p.value;
        }
      }
    }
    return config;
  }

  updateProperties(properties: Record<string, unknown>) {
    for (const [key, value] of Object.entries(properties)) {
      const property = this.propsByName.get(key);
      if (property) {
        property.value = value as null | string | number | boolean | string[];
      }
    }
    this.notifyChange();
  }

  async initConfig() {
    try {
      const validationResult = await this.validateInitialConfig();
      const allProps = this.createCustomProperties(validationResult.configs);
      this.indexProperties(allProps);
      this.createGroups(validationResult.steps);

      // Update JSON when config changes (manual tracking)
      this.onConfigChange(100, (config) => {
        this.jsonText = JSON.stringify(config, undefined, 4);
      });

      // Validate on changes (manual tracking)
      this.onConfigChange(300, (config) => {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        this.validate(config).catch(console.error);
      });
    } catch (err: unknown) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('error in initConfig', err);
      this.error = err instanceof Error ? err.message : JSON.stringify(err, undefined, 4);
    }

    this.initPending = false;
  }

  private validateInitialConfig() {
    const { clusterName, pluginClassName } = this;

    // Validate with empty object to get all properties initially
    const basicConfig = {
      'connector.class': pluginClassName,
      name: '',
    };

    return api.validateConnectorConfig(clusterName, pluginClassName, this.appliedConfig ?? basicConfig);
  }

  private indexProperties(allProps: Property[]) {
    // Save props to map, so we can quickly find them to set their validation errors
    for (const p of allProps) {
      this.propsByName.set(p.name, p);
    }

    if (this.appliedConfig === undefined) {
      applyCustomDefaults(allProps);
    }
  }

  // Create groups
  private createGroups(steps: ConnectorStep[]) {
    this.allGroups = [];
    for (const step of steps) {
      for (const groupDef of step.groups) {
        this.allGroups.push(this.createPropertyGroup(step, groupDef, this.groupProperties(step, groupDef)));
      }
    }

    linkPropertiesToGroups(this.allGroups);
  }

  private groupProperties(step: ConnectorStep, groupDef: ConnectorGroup): Property[] {
    return groupDef.config_keys
      .map((k) => {
        const prop = this.propsByName.get(k);

        if (!prop) {
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.log('step[*].group[*].config_keys references a property that does not exist in propsByName!', {
            step: step.name,
            group: groupDef,
            referencedConfigKey: k,
          });
        }

        // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
        return prop!;
      })
      .filter((x) => x !== null && x !== undefined);
  }

  // Runs `handle` now, then shortly after every change that alters the serialized config.
  private onConfigChange(delayMs: number, handle: (config: object) => void) {
    let lastConfig: string | null = null;
    const handleIfChanged = () => {
      const config = this.getConfigObject();
      const configStr = JSON.stringify(config);
      if (configStr !== lastConfig) {
        lastConfig = configStr;
        handle(config);
      }
    };
    handleIfChanged(); // Initial update
    const unsubscribe = this.subscribe(() => {
      setTimeout(handleIfChanged, delayMs);
    });
    this.cleanupFunctions.push(unsubscribe);
  }

  async validate(config: object) {
    const { clusterName, pluginClassName } = this;
    try {
      // Validate the current config
      const validationResult = await api.validateConnectorConfig(clusterName, pluginClassName, config);
      this.applyValidationResult(validationResult);
    } catch (err: unknown) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('error validating config', err);
    }
  }

  private applyValidationResult(validationResult: ConnectorValidationResult) {
    const srcProps = this.createCustomProperties(validationResult.configs);

    this.connectorStepDefinitions = validationResult.steps;

    this.removeStaleProperties(srcProps);

    // Handle new properties, transfer reported errors and suggested values
    for (const source of srcProps) {
      this.mergeValidatedProperty(source);
    }

    // Sort all groups again because order might have changed
    this.allGroups = this.allGroups.orderBy((x) => stepGroupOrder(validationResult.steps, x.group.name));

    // Set last error values, so we know when to show the validation error
    for (const g of this.allGroups) {
      for (const p of g.properties) {
        p.lastErrorValue = p.value;
      }
    }
    this.notifyChange();
  }

  // Remove properties that don't exist anymore
  private removeStaleProperties(srcProps: Property[]) {
    const srcNames = new Set(srcProps.map((x) => x.name));
    const removedProps = [...this.propsByName.keys()].filter((key) => !srcNames.has(key));
    for (const key of removedProps) {
      // group names might not be accurate so we check all groups
      for (const g of this.allGroups) {
        g.properties.removeAll((x) => x.name === key);
      }

      // remove from lookup
      this.propsByName.delete(key);
    }

    // Remove empty groups
    this.allGroups.removeAll((x) => x.properties.length === 0);
  }

  private mergeValidatedProperty(source: Property) {
    const target = this.propsByName.get(source.name);

    // Property does not exist yet, create it!
    if (!target) {
      this.propsByName.set(source.name, source);
      return;
    }

    // Update: recommended values
    syncRecommendedValues(target, source);

    // Update: field visibility
    target.entry.value.visible = source.entry.value.visible;

    // Update: errors
    if (!target.errors.isEqual(source.errors)) {
      updatePropertyErrors(target, source.errors);
    }
  }

  // Creates our Property objects, while fixing some issues with the source data
  // like: missing value, propertyWidth, group, ...
  createCustomProperties(properties: ConnectorProperty[]): Property[] {
    // Fix missing properties
    for (const p of properties) {
      const def = p.definition;

      if (!def.width || def.width === PropertyWidth.None) {
        def.width = PropertyWidth.Medium;
      }

      if (def.order < 0) {
        def.order = Number.POSITIVE_INFINITY;
      }
    }

    // Create our own properties
    const allProps = properties
      .map((p) => this.createProperty(p))
      .sort((a, b) => a.entry.definition.order - b.entry.definition.order);

    return allProps;
  }

  private createProperty(p: ConnectorProperty): Property {
    const { name, type: definitionType } = p.definition;

    const property: Property = {
      name,
      entry: p,
      value: initialPropertyValue(p),
      isHidden: hiddenProperties.includes(name),
      errors: p.value.errors,
      lastErrors: [],
      showErrors: p.value.errors.length > 0,
      currentErrorIndex: 0,
      lastErrorValue: undefined as unknown,
      propertyGroup: undefined as unknown as PropertyGroup,
      crud: this.crud,
      isDisabled: undefined,
      notifyChange: () => this.notifyChange(),
    };

    if (this.appliedConfig?.[name]) {
      property.value = sanitizeValue(this.appliedConfig[name], definitionType) as Property['value'];
    }

    if (p.definition.type === DataType.Password && this.secrets && p.value.visible) {
      bindSecretValue(property, this.secrets.getSecret(property.name));
    }

    return property;
  }

  dispose() {
    for (const cleanup of this.cleanupFunctions) {
      cleanup();
    }
    this.cleanupFunctions = [];
  }
}

const hiddenProperties = [
  'connector.class', // user choses that in the first page of the wizard
];

function parseConfigJson(jsonText: string): Record<string, unknown> {
  try {
    return JSON.parse(jsonText);
  } catch {
    // no op - JSON may be invalid during editing
    return {};
  }
}

// Whether a property's value goes into the submitted config. Optional values still at their default
// are left out, so the connector keeps following the default.
function isSubmittedProperty(p: Property, config: Record<string, unknown>): boolean {
  if (p.entry.definition.required) {
    return true;
  }
  if (p.value === p.entry.definition.default_value) {
    // Prevent sending configs set to default when the user has not modified them.

    // let's ignore the default variable if the value is the same as initially rendered
    // otherwise, user might want to set it back to default
    if (p.value === p.entry.value.value) {
      return false;
    }
    // let's ignore the variable if the original value is null and the config is not present in current set configs values.
    if (p.entry.value.value === null && !config[p.name]) {
      return false;
    }
  }
  // skip boolean values that default to false
  return !(p.value === false && !p.entry.definition.default_value);
}

function applyCustomDefaults(allProps: Property[]) {
  // Set default values
  for (const p of allProps) {
    if (p.entry.definition.custom_default_value !== undefined) {
      p.value = p.entry.definition.custom_default_value;
    }
  }

  // Set last error values, so we know when to show the validation error
  for (const p of allProps) {
    if (p.errors.length > 0) {
      p.lastErrorValue = p.value;
    }
  }
}

function linkPropertiesToGroups(groups: PropertyGroup[]) {
  // Let properties know about their parent group, so they can add/remove themselves in 'propertiesWithErrors'
  for (const g of groups) {
    for (const p of g.properties) {
      p.propertyGroup = g;
    }
  }

  // Notify groups about errors in their children
  for (const g of groups) {
    g.propertiesWithErrors.push(...g.properties.filter((p) => p.showErrors));
  }
}

// The group's position across all steps' groups; a group no step lists sorts last.
function stepGroupOrder(steps: ConnectorStep[], groupName: string | undefined): number {
  let order = 0;
  for (const s of steps) {
    for (const g of s.groups) {
      if (groupName === g.name) {
        return order;
      }
      order += 1;
    }
  }

  return order;
}

function syncRecommendedValues(target: Property, source: Property) {
  const suggestedSrc = source.entry.value.recommended_values;
  const suggestedTar = target.entry.value.recommended_values;
  if (!suggestedSrc.isEqual(suggestedTar)) {
    suggestedTar.updateWith(suggestedSrc);
  }
}

// Show the first error, skipping over simple / unhelpful messages when there are several.
function firstHelpfulErrorIndex(errors: string[]): number {
  if (errors.length <= 1) {
    return 0;
  }
  const betterStartValue = errors.findIndex((x) => !x.includes('which has no default value'));
  return betterStartValue > -1 ? betterStartValue : 0;
}

function updatePropertyErrors(target: Property, errors: string[]) {
  if (errors.length > 0) {
    target.lastErrors = [...errors]; // create copy
  }

  // Update
  target.errors.updateWith(errors);

  target.showErrors = target.errors.length > 0;
  target.currentErrorIndex = firstHelpfulErrorIndex(target.errors);

  // Add or remove from parent group
  if (target.errors.length > 0) {
    target.propertyGroup.propertiesWithErrors.pushDistinct(target);
  } else {
    target.propertyGroup.propertiesWithErrors.remove(target);
  }
}

// Fix type of default values
function initialPropertyValue(p: ConnectorProperty): Property['value'] {
  const defaultValue: unknown = sanitizeDefaultValue(p.definition.default_value, p.definition.type);
  const initialValue: unknown = sanitizeValue(p.value.value, p.definition.type);
  return (initialValue ?? defaultValue) as Property['value'];
}

// Writes to the property's value also land in its secret.
function bindSecretValue(property: Property, secret: Secret) {
  secret.extractSecretId(String(property.value));

  // Instead of intercept, we'll use a custom setter pattern
  // Store original value
  let currentValue = property.value;
  Object.defineProperty(property, 'value', {
    get() {
      return currentValue;
    },
    set(newValue) {
      currentValue = newValue;
      secret.value = String(newValue);
    },
    enumerable: true,
    configurable: true,
  });
}

export type PropertyGroup = {
  step: ConnectorStep;
  group: ConnectorGroup;

  properties: Property[];

  readonly filteredProperties: Property[];

  propertiesWithErrors: Property[];

  description?: string;
  documentation_link?: string;
};

export type Property = {
  name: string;
  entry: ConnectorProperty;
  value: null | string | number | boolean | string[];
  isHidden: boolean; // currently only used for "connector.class"
  errors: string[]; // current errors
  showErrors: boolean; // true = property has errors currently
  lastErrors: string[]; // previous errors, used so we can fade/animate them out when they get fixed
  currentErrorIndex: number; // since we can only display one error at a time, we use this to cycle through
  lastErrorValue: unknown; // the 'value' the property had at the last validation check (used so we can immediately hide the reported error once the user changes the value)

  propertyGroup: PropertyGroup;
  crud: 'create' | 'update';
  isDisabled: boolean | undefined;
  notifyChange: () => void;
};
