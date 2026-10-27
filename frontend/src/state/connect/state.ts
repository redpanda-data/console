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

import { removeNamespace } from '../../components/pages/connect/helper';
import { encodeBase64, retrier } from '../../utils/utils';
import { api } from '../backend-api';
import {
  type ClusterAdditionalInfo,
  type ClusterConnectors,
  type ConnectorGroup,
  type ConnectorPossibleStatesLiteral,
  type ConnectorProperty,
  type ConnectorStep,
  type ConnectorValidationResult,
  DataType,
  PropertyImportance,
  PropertyWidth,
} from '../rest-interfaces';

// Regex for validating secret strings
const SECRET_STRING_REGEX = /^\$\{secretsManager:[A-Za-z\-0-9]+:.+\}$/;

export type ConfigPageProps = {
  clusterName: string;
  pluginClassName: string;
  onChange: (jsonText: string, secrets?: ConnectorSecret) => void;
};

export type ConnectorSecret = Map<string, string>;
export type UpdatingConnectorData = { clusterName: string; connectorName: string };
export type RestartingTaskData = { clusterName: string; connectorName: string; taskId: number };

class CustomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class ConnectorValidationError extends CustomError {}

export class ConnectorCreationError extends CustomError {}

export class SecretCreationError extends CustomError {}

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

export class ConnectClusterStore {
  private readonly clusterName: string;
  isInitialized = false;
  private connectors: Map<string, ConnectorPropertiesStore>;
  features: ConnectorClusterFeatures = { secretStore: false };
  additionalClusterInfo: ClusterAdditionalInfo;

  static connectClusters: Map<string, ConnectClusterStore> = new Map();

  constructor(clusterName: string) {
    this.clusterName = clusterName;
    this.connectors = new Map();
  }

  static getInstance(clusterName: string): ConnectClusterStore {
    let instance = ConnectClusterStore.connectClusters.get(clusterName);
    if (!instance) {
      instance = new ConnectClusterStore(clusterName);
      ConnectClusterStore.connectClusters.set(clusterName, instance);
    }
    return instance;
  }

  async setup() {
    if (!this.isInitialized) {
      this.connectors = new Map();
      await this.refreshData(false);

      // biome-ignore lint/style/noNonNullAssertion: safe after refreshData
      this.additionalClusterInfo = api.connectAdditionalClusterInfo.get(this.clusterName)!;
      this.features.secretStore = !!this.additionalClusterInfo?.enabledFeatures?.some((x) => x === 'SECRET_STORE');
      this.isInitialized = true;
    }
  }

  async refreshData(force: boolean) {
    await api.refreshConnectClusters();
    await api.refreshClusterAdditionalInfo(this.clusterName, force);
    // biome-ignore lint/style/noNonNullAssertion: safe after refresh
    this.additionalClusterInfo = api.connectAdditionalClusterInfo.get(this.clusterName)!;
  }

  // CRUD operations
  async createConnector(pluginClass: string, updatedConfig: Record<string, unknown> = {}) {
    const connector = this.getConnector(pluginClass, null, undefined);
    const secrets = connector?.secrets;
    if (secrets) {
      await this.createConnectorSecrets(connector, secrets, updatedConfig);
    }
    try {
      const configObj = connector?.getConfigObject();
      const finalProperties = withSecretValues({ ...updatedConfig, ...configObj }, secrets);

      await api.createConnector(this.clusterName, String(finalProperties.name), pluginClass, finalProperties);
      this.removePluginState(pluginClass);
    } catch (error) {
      throw new ConnectorCreationError(String(error));
    }
  }

  // Stores each filled-in secret and points its property, and `updatedConfig`, at the stored secret.
  private async createConnectorSecrets(
    connector: ConnectorPropertiesStore,
    secrets: SecretsStore,
    updatedConfig: Record<string, unknown>
  ) {
    try {
      // Validate cluster name
      if (!this.clusterName || this.clusterName.trim() === '') {
        throw new Error('Cluster name is missing or empty. Cannot create secrets without a valid cluster.');
      }

      // Get connector name from the actual config object (works in both form and JSON mode)
      const connectorName = requireConnectorName(connector.getConfigObject() as Record<string, unknown> | undefined);

      // Stop at the first failure without creating later secrets or mutating their config fields.
      await [...secrets.secrets].reduce(async (previous, [key, secret]) => {
        await previous;
        // Skip secrets with empty keys or values (optional PASSWORD fields the user didn't fill)
        if (isFilledSecret(key, secret)) {
          await this.createConnectorSecret({ connector, connectorName, key, secret, updatedConfig });
        }
      }, Promise.resolve());
    } catch (error) {
      throw new SecretCreationError(String(error));
    }
  }

  private async createConnectorSecret({
    connector,
    connectorName,
    key,
    secret,
    updatedConfig,
  }: {
    connector: ConnectorPropertiesStore;
    connectorName: string;
    key: string;
    secret: Secret;
    updatedConfig: Record<string, unknown>;
  }) {
    // Validate serialized secret data
    const serializedSecret = secret.serialized;
    if (!serializedSecret || serializedSecret.trim() === '') {
      throw new Error(`Failed to serialize secret for key "${key}". The encoded secret data is empty.`);
    }

    const createSecretResponse = await api.createSecret(this.clusterName, connectorName, serializedSecret);

    if (!createSecretResponse?.secretId) {
      throw new Error(`Failed to create secret for key "${key}": API response did not include a secretId`);
    }

    const property = connector.propsByName.get(key);

    if (property) {
      property.value = secret.getSecretString(key, createSecretResponse.secretId);
      updatedConfig[property.name] = property.value;
    }
  }

  async deleteConnector(connectorName: string) {
    const connectorState = this.getConnectorStore(connectorName);
    const secrets = connectorState?.secrets;

    await api.deleteConnector(this.clusterName, connectorName);

    if (secrets) {
      await Promise.all(
        secrets.ids.map((secretId) =>
          retrier(() => api.deleteSecret(this.clusterName, secretId), { attempts: 3, delayTime: 200 })
        )
      );
    }
  }

  async updateConnnector(connectorName: string) {
    const remoteConnector = this.getRemoteConnector(connectorName);

    const connectorState = this.getConnectorStore(connectorName);
    const newConfigObj = connectorState?.getConfigObject();
    if (!(connectorState && newConfigObj)) {
      return;
    }

    await this.updateDirtySecrets(connectorState);
    if (remoteConnector) {
      await api.updateConnector(this.clusterName, connectorName, connectorState.getConfigObject());
    }
  }

  private async updateDirtySecrets(connectorState: ConnectorPropertiesStore) {
    const { secrets } = connectorState;
    if (!secrets) {
      return;
    }

    // Preserve partial-update order: later secrets stay untouched if an update fails.
    await [...secrets.secrets].reduce(async (previous, [key, secret]) => {
      await previous;
      if (secret.isDirty && secret.id) {
        await api.updateSecret(this.clusterName, secret.id, secret.serialized);
        const property = connectorState.propsByName.get(key);
        if (property) {
          property.value = secret.getSecretString(key, secret.id);
        }
      }
    }, Promise.resolve());
  }

  removePluginState(identifier: string) {
    this.connectors.delete(identifier);
  }

  getConnector(
    pluginClassName: string,
    connectorName: string | null,
    initialConfig: Record<string, unknown> | undefined
  ) {
    const identifier = connectorName ? `${pluginClassName}/${connectorName}` : pluginClassName;
    let connectorStore = this.connectors.get(identifier);
    if (!connectorStore) {
      const connectorType = this.additionalClusterInfo.plugins.first((x) => x.class === pluginClassName)?.type;
      if (connectorType) {
        connectorStore = new ConnectorPropertiesStore(this.clusterName, pluginClassName, connectorType, initialConfig, {
          secretStore: this.features.secretStore,
          // Create passes no connector name; only an existing connector is being edited.
          editing: connectorName !== null,
        });
        this.connectors.set(identifier, connectorStore);
      }
    }
    return connectorStore;
  }

  getConnectorStore(connectorName: string) {
    const connector = this.getRemoteConnector(connectorName);
    const connectorProperties = this.getConnector(
      connector?.class ?? '',
      connectorName,
      connector?.config as Record<string, unknown> | undefined
    );
    return connectorProperties;
  }

  get cluster(): ClusterConnectors | null {
    if (this.isInitialized) {
      const cluster = api.connectConnectors?.clusters?.first((c) => c.clusterName === this.clusterName);
      if (!cluster) {
        throw new Error('cluster not found');
      }
      return cluster;
    }
    return null;
  }

  get canEdit() {
    if (this.isInitialized) {
      return this.cluster?.canEditCluster;
    }
    return null;
  }

  validateConnectorState(connectorName: string, state: ConnectorPossibleStatesLiteral[]) {
    if (this.isInitialized) {
      const cluster = this.cluster;
      const connector = cluster?.connectors.first((c) => c.name === connectorName);
      return state.some((s) => s === connector?.state);
    }
  }

  getConnectorState(connectorName: string) {
    if (this.isInitialized) {
      const connector = this.getRemoteConnector(connectorName);
      return connector?.state;
    }
    return null;
  }

  getConnectorTasks(connectorName: string) {
    if (this.isInitialized) {
      const connector = this.getRemoteConnector(connectorName);
      return connector?.tasks;
    }
  }

  getRemoteConnector(connectorName: string) {
    if (this.isInitialized) {
      const cluster = this.cluster;
      const connector = cluster?.connectors.first((c) => c.name === connectorName);
      return connector;
    }
  }
}

export type ConnectorClusterFeatures = {
  secretStore?: boolean;
  editing?: boolean;
};

export class SecretsStore {
  _data = new Map<string, Secret>();

  getSecret(key: string) {
    let secret = this._data.get(key);

    if (!secret) {
      secret = new Secret(key);
      this._data.set(key, secret);
    }
    return secret;
  }

  get ids(): string[] {
    return Array.from(this.secrets, ([_key, secret]) => secret.id).filter((secret): secret is string =>
      Boolean(secret)
    );
  }

  get secrets() {
    const result = new Map<string, Secret>();
    for (const [key, secret] of this._data) {
      if (secret.value && secret.value.trim() !== '') {
        result.set(key, secret);
      }
    }
    return result;
  }
}

export class Secret {
  key: string;
  value: string;
  id: string | null = null;
  secretString: string | null = null;
  isDirty = false;
  private listeners: Set<() => void> = new Set();

  constructor(key: string) {
    this.key = key;
  }

  // Manual reactivity - call this when value or secretString changes
  private notifyListeners() {
    if (this.secretString && this.value) {
      this.isDirty = this.value !== this.secretString;
    }
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setValue(newValue: string) {
    this.value = newValue;
    this.notifyListeners();
  }

  setSecretString(newSecretString: string) {
    this.secretString = newSecretString;
    this.notifyListeners();
  }

  get serialized() {
    return encodeBase64(JSON.stringify({ [this.key]: this.value }));
  }

  get toJS() {
    return {
      [this.key]: this.value,
    };
  }

  getSecretString(key: string, id?: string): string | null {
    const _id = id ?? this.id;
    if (_id) {
      return `\${secretsManager:${_id}:${key}}`;
    }
    return null;
  }

  extractSecretId(secretString: string): boolean {
    if (!this.validateSecretString(secretString)) {
      return false;
    }
    this.id = String(secretString).split(':')[1];
    return !!this.id;
  }

  validateSecretString(secretString: string): boolean {
    const validationResult = SECRET_STRING_REGEX.test(secretString);
    if (validationResult) {
      this.secretString = secretString;
    }
    return validationResult;
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

// The connector name the secrets are stored under: it must be a non-blank string.
function requireConnectorName(configObj: Record<string, unknown> | undefined): string {
  const connectorNameValue = configObj?.name;

  if (connectorNameValue === undefined || connectorNameValue === null) {
    throw new Error("Connector configuration is missing the 'name' property");
  }

  if (typeof connectorNameValue !== 'string') {
    throw new Error(`Connector name must be a string, but received ${describeValueType(connectorNameValue)}`);
  }

  if (connectorNameValue.trim() === '') {
    throw new Error('Connector name cannot be empty. Please provide a valid connector name before creating secrets.');
  }

  return connectorNameValue;
}

function describeValueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function isFilledSecret(key: string, secret: Secret): boolean {
  return Boolean(key && key.trim() !== '' && secret.value && secret.value.trim() !== '');
}

// If the config has been created using only the json view, the secrets are missing (since updates to them, only apply to our property wrappers)
// We need to go through all props of type password, and use those values instead (since those will be the "secret string" aka placeholder)
function withSecretValues(
  properties: Record<string, unknown>,
  secrets: SecretsStore | null | undefined
): Record<string, unknown> {
  if (secrets) {
    for (const [key, secret] of secrets.secrets) {
      if (secret.value) {
        properties[key] = secret.value;
      }
    }
  }
  return properties;
}

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
