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

/*eslint block-scoped-var: "error"*/

import { ConnectError } from '@connectrpc/connect';

import { addFrontendFieldsForConnectCluster } from './legacy-api-formatters';
import type { LegacyApiServices } from './legacy-api-services';
import { config as appConfig } from '../runtime-config';
import type { GetApiState, SetApiState } from '../state/backend-api';
import { type PatchTopicConfigsRequest, WrappedApiError } from '../state/rest-interfaces';
import type { ClusterAdditionalInfo, ConnectorValidationResult, KafkaConnectors } from '../types/kafka-connect';
import { toJson } from '../utils/json-utils';

type LegacyConnectClusterActions = {
  refreshConnectClusters(): Promise<void>;
  changeTopicConfig(topicName: string | null, configs: PatchTopicConfigsRequest['configs']): Promise<void>;
  refreshClusterAdditionalInfo(clusterName: string, force?: boolean): Promise<void>;
  deleteConnector(clusterName: string, connector: string): Promise<void>;
};

export function createLegacyConnectClusterActions(
  set: SetApiState,
  _get: GetApiState,
  services: LegacyApiServices
): LegacyConnectClusterActions {
  const { cachedApiRequest, parseOrUnwrap, addError } = services;
  return {
    async refreshConnectClusters(): Promise<void> {
      set({ connectConnectorsError: null });
      const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/connectors`, {
        method: 'GET',
        headers: [['Content-Type', 'application/json']],
      });

      return await parseOrUnwrap<KafkaConnectors | null>(response, null).then(
        (v) => {
          // backend error
          if (!v) {
            set({ connectConnectors: undefined });
            return;
          }

          // not configured
          if (!v.clusters) {
            set({ connectConnectors: v });
            return;
          }

          // prepare helper properties
          for (const cluster of v.clusters) {
            addFrontendFieldsForConnectCluster(cluster);
          }

          set({ connectConnectors: v });
        },
        (error: unknown) => {
          set({ connectConnectorsError: error instanceof WrappedApiError ? error : ConnectError.from(error) });
        }
      );
    },

    // PATCH /topics/{topicName}/configuration   //
    // PATCH /topics/configuration               // default config
    async changeTopicConfig(topicName: string | null, configs: PatchTopicConfigsRequest['configs']): Promise<void> {
      const url =
        topicName !== null && topicName !== undefined && topicName !== ''
          ? `${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/configuration`
          : `${appConfig.restBasePath}/topics/configuration`;

      const response = await appConfig.fetch(url, {
        method: 'PATCH',
        headers: [['Content-Type', 'application/json']],
        body: toJson({ configs }),
      });
      await parseOrUnwrap<void>(response, null);
    },

    // AdditionalInfo = list of plugins
    refreshClusterAdditionalInfo(clusterName: string, force?: boolean): Promise<void> {
      return cachedApiRequest<ClusterAdditionalInfo | null>(
        `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}`,
        force
      ).then((v) => {
        if (v) {
          set((s) => ({
            connectAdditionalClusterInfo: new Map(s.connectAdditionalClusterInfo).set(clusterName, v),
          }));
        } else {
          set((s) => {
            const m = new Map(s.connectAdditionalClusterInfo);
            m.delete(clusterName);
            return { connectAdditionalClusterInfo: m };
          });
        }
      }, addError);
    },
    async deleteConnector(clusterName: string, connector: string): Promise<void> {
      // DELETE "/kafka-connect/clusters/{clusterName}/connectors/{connector}"
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}`,
        {
          method: 'DELETE',
          headers: [['Content-Type', 'application/json']],
        }
      );
      return parseOrUnwrap<void>(response, null);
    },
  };
}

type LegacyConnectorActions = {
  pauseConnector(clusterName: string, connector: string): Promise<void>;
  resumeConnector(clusterName: string, connector: string): Promise<void>;
  restartConnector(clusterName: string, connector: string): Promise<void>;
  updateConnector(clusterName: string, connector: string, config: object): Promise<void>;
  restartTask(clusterName: string, connector: string, taskID: number): Promise<void>;
  validateConnectorConfig(
    clusterName: string,
    pluginClassName: string,
    config: object
  ): Promise<ConnectorValidationResult>;
  createConnector(
    clusterName: string,
    connectorName: string,
    _pluginClassName: string, // needs to be kept to avoid larger refactor despite not being used.
    config: object
  ): Promise<void>;
};

export function createLegacyConnectorActions(
  _set: SetApiState,
  _get: GetApiState,
  services: LegacyApiServices
): LegacyConnectorActions {
  const { parseOrUnwrap } = services;
  return {
    async pauseConnector(clusterName: string, connector: string): Promise<void> {
      // PUT  "/kafka-connect/clusters/{clusterName}/connectors/{connector}/pause"  (idempotent)
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/pause`,
        {
          method: 'PUT',
          headers: [['Content-Type', 'application/json']],
        }
      );
      return parseOrUnwrap<void>(response, null);
    },
    async resumeConnector(clusterName: string, connector: string): Promise<void> {
      // PUT  "/kafka-connect/clusters/{clusterName}/connectors/{connector}/resume" (idempotent)
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/resume`,
        {
          method: 'PUT',
          headers: [['Content-Type', 'application/json']],
        }
      );
      return parseOrUnwrap<void>(response, null);
    },
    async restartConnector(clusterName: string, connector: string): Promise<void> {
      // POST "/kafka-connect/clusters/{clusterName}/connectors/{connector}/restart"
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/restart`,
        {
          method: 'POST',
          headers: [['Content-Type', 'application/json']],
        }
      );
      return parseOrUnwrap<void>(response, null);
    },
    async updateConnector(clusterName: string, connector: string, config: object): Promise<void> {
      // PUT "/kafka-connect/clusters/{clusterName}/connectors/{connector}"
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}`,
        {
          method: 'PUT',
          headers: [['Content-Type', 'application/json']],
          body: JSON.stringify({ config }),
        }
      );
      return parseOrUnwrap<void>(response, null);
    },
    async restartTask(clusterName: string, connector: string, taskID: number): Promise<void> {
      // POST "/kafka-connect/clusters/{clusterName}/connectors/{connector}/tasks/{taskID}/restart"
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/tasks/${String(taskID)}/restart`,
        {
          method: 'POST',
          headers: [['Content-Type', 'application/json']],
        }
      );

      return parseOrUnwrap<void>(response, null);
    },
    async validateConnectorConfig(
      clusterName: string,
      pluginClassName: string,
      config: object
    ): Promise<ConnectorValidationResult> {
      // PUT "/kafka-connect/clusters/{clusterName}/connector-plugins/{pluginClassName}/config/validate"
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connector-plugins/${encodeURIComponent(pluginClassName)}/config/validate`,
        {
          method: 'PUT',
          headers: [['Content-Type', 'application/json']],
          body: JSON.stringify(config),
        }
      );
      const result = await parseOrUnwrap<ConnectorValidationResult>(response, null);

      for (let i = 0; i < result.steps.length; i++) {
        result.steps[i].stepIndex = i;
      }

      return result;
    },
    async createConnector(
      clusterName: string,
      connectorName: string,
      _pluginClassName: string, // needs to be kept to avoid larger refactor despite not being used.
      config: object
    ): Promise<void> {
      // POST "/kafka-connect/clusters/{clusterName}/connectors"
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors`,
        {
          method: 'POST',
          headers: [['Content-Type', 'application/json']],
          body: JSON.stringify({
            connectorName,
            config,
          }),
        }
      );
      return parseOrUnwrap<void>(response, null);
    },
  };
}
