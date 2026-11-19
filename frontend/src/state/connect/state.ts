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

import { ConnectorCreationError } from './connector-creation-error';
import { ConnectorPropertiesStore } from './connector-properties-store';
import type { Secret } from './secret';
import { SecretCreationError } from './secret-creation-error';
import type { SecretsStore } from './secrets-store';
import { retrier } from '../../utils/utils';
import { api } from '../backend-api';
import type { ClusterAdditionalInfo, ClusterConnectors, ConnectorPossibleStatesLiteral } from '../rest-interfaces';

export { ConnectorCreationError } from './connector-creation-error';
export { ConnectorPropertiesStore, type Property, type PropertyGroup } from './connector-properties-store';
export { ConnectorValidationError } from './connector-validation-error';
export { Secret } from './secret';
export { SecretCreationError } from './secret-creation-error';
export { SecretsStore } from './secrets-store';

export type ConfigPageProps = {
  clusterName: string;
  pluginClassName: string;
  onChange: (jsonText: string, secrets?: ConnectorSecret) => void;
};

export type ConnectorSecret = Map<string, string>;
export type UpdatingConnectorData = { clusterName: string; connectorName: string };
export type RestartingTaskData = { clusterName: string; connectorName: string; taskId: number };

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
