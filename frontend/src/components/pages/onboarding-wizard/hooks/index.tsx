import { useAddTopicFormData, useAddUserFormData, useConnectConfig } from 'state/onboarding-wizard/state';
import type { BaseConnectConfig } from '../types/connect';
import { configToYaml, getComponentByName, schemaToConfig } from '../utils/connect';

/**
 * Custom hook that populates a base config with data from wizard form steps
 */
const usePopulateConfigWithFormData = (baseConfig?: BaseConnectConfig) => {
  const { data: connectConfig } = useConnectConfig();
  const { data: addTopicFormData } = useAddTopicFormData();
  const { data: addUserFormData } = useAddUserFormData();

  if (!baseConfig) {
    return undefined;
  }

  const populatedConfig = structuredClone(baseConfig);

  if (!connectConfig?.connectionName) {
    return baseConfig;
  }

  const { connectionName } = connectConfig;

  // Find the connection config section by iterating through the config structure
  let connectionConfig: Record<string, unknown> | undefined;

  for (const [, typeValue] of Object.entries(populatedConfig)) {
    if (typeof typeValue === 'object' && typeValue !== null) {
      const typeObj = typeValue as Record<string, unknown>;
      if (connectionName in typeObj) {
        connectionConfig = typeObj[connectionName] as Record<string, unknown>;
        break;
      }
    }
  }

  if (!connectionConfig) {
    return baseConfig;
  }

  // Populate topic-related data
  if (addTopicFormData?.topicName) {
    if ('topics' in connectionConfig) {
      connectionConfig.topics = [addTopicFormData.topicName];
    }
    if ('topic' in connectionConfig) {
      connectionConfig.topic = addTopicFormData.topicName;
    }
  }

  // Populate partition and replication factor
  if (addTopicFormData?.partitions && 'partitions' in connectionConfig) {
    connectionConfig.partitions = addTopicFormData.partitions;
  }

  if (addTopicFormData?.replicationFactor && 'replication_factor' in connectionConfig) {
    connectionConfig.replication_factor = addTopicFormData.replicationFactor;
  }

  // Populate SASL authentication data
  if (
    addUserFormData &&
    'sasl' in connectionConfig &&
    typeof connectionConfig.sasl === 'object' &&
    connectionConfig.sasl
  ) {
    const saslConfig = connectionConfig.sasl as Record<string, unknown>;

    if (addUserFormData.saslMechanism) {
      saslConfig.mechanism = addUserFormData.saslMechanism;
    }
    if (addUserFormData.username) {
      saslConfig.user = addUserFormData.username;
    }
    if (addUserFormData.password) {
      saslConfig.password = addUserFormData.password;
    }
  }

  // Populate addresses for Kafka connections if not already set
  if ('addresses' in connectionConfig) {
    const currentAddresses = connectionConfig.addresses as string[];
    if (!currentAddresses || currentAddresses.length === 0) {
      // Set a placeholder that indicates this is required
      connectionConfig.addresses = ['localhost:9092']; // Reasonable default for development
    }
  }

  // Set reasonable defaults for common Kafka settings if not already populated
  if (connectionName === 'kafka') {
    // Set client_id default if empty
    if ('client_id' in connectionConfig && !connectionConfig.client_id) {
      connectionConfig.client_id = 'benthos';
    }

    // Set default commit period if empty
    if ('commit_period' in connectionConfig && !connectionConfig.commit_period) {
      connectionConfig.commit_period = '1s';
    }

    // Set default checkpoint limit if zero
    if ('checkpoint_limit' in connectionConfig && connectionConfig.checkpoint_limit === 0) {
      connectionConfig.checkpoint_limit = 1024;
    }

    // Set default max processing period if empty
    if ('max_processing_period' in connectionConfig && !connectionConfig.max_processing_period) {
      connectionConfig.max_processing_period = '100ms';
    }

    // Set default fetch buffer capacity if zero
    if ('fetch_buffer_cap' in connectionConfig && connectionConfig.fetch_buffer_cap === 0) {
      connectionConfig.fetch_buffer_cap = 256;
    }

    // Set reasonable group defaults
    if ('group' in connectionConfig && typeof connectionConfig.group === 'object' && connectionConfig.group) {
      const groupConfig = connectionConfig.group as Record<string, unknown>;
      if (!groupConfig.session_timeout) groupConfig.session_timeout = '10s';
      if (!groupConfig.heartbeat_interval) groupConfig.heartbeat_interval = '3s';
      if (!groupConfig.rebalance_timeout) groupConfig.rebalance_timeout = '60s';
    }

    // Set start_from_oldest default
    if ('start_from_oldest' in connectionConfig && connectionConfig.start_from_oldest === false) {
      connectionConfig.start_from_oldest = true;
    }

    // Set auto_replay_nacks default
    if ('auto_replay_nacks' in connectionConfig && connectionConfig.auto_replay_nacks === false) {
      connectionConfig.auto_replay_nacks = true;
    }
  }

  return populatedConfig;
};

/**
 * Custom hook that generates a yaml string for a connect config based on the selected connectionName
 * It attempts to populate the config with form data from the wizard form steps
 * But if there's no form data, it will return a base config with default values
 * @returns yaml string of connect config for the selected connectionName
 */
export const useGenerateConnectConfig = () => {
  const { data: connectConfig } = useConnectConfig();
  const componentConfig = getComponentByName(connectConfig?.connectionName);
  const baseConfig = schemaToConfig(componentConfig);
  const populatedConfig = usePopulateConfigWithFormData(baseConfig);

  if (!populatedConfig || !componentConfig) {
    return undefined;
  }
  return configToYaml(populatedConfig, componentConfig);
};
