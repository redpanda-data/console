import type { LegacyApiServices } from './legacy-api-services';
import type {
  PublishMessageRequest,
  PublishMessageResponse,
} from '../protogen/redpanda/api/console/v1alpha1/publish_messages_pb';
import { config as appConfig } from '../runtime-config';
import type { GetApiState, SetApiState } from '../state/backend-api';
import type {
  CreateSecretResponse,
  CreateTopicRequest,
  CreateTopicResponse,
  ProduceRecordsResponse,
  PublishRecordsRequest,
} from '../state/rest-interfaces';
import { isPresent } from '../utils/type-guards';

export function createLegacyPublishingActions(_set: SetApiState, _get: GetApiState, services: LegacyApiServices) {
  const { parseOrUnwrap } = services;
  return {
    async publishRecords(request: PublishRecordsRequest): Promise<ProduceRecordsResponse> {
      // POST "/topics-records"
      const response = await appConfig.fetch(`${appConfig.restBasePath}/topics-records`, {
        method: 'POST',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify(request),
      });
      return parseOrUnwrap<ProduceRecordsResponse>(response, null);
    },

    // New version of "publishRecords"
    async publishMessage(request: PublishMessageRequest): Promise<PublishMessageResponse> {
      // biome-ignore lint/style/noNonNullAssertion: leave as is for now due to MobX
      const client = appConfig.consoleClient!;
      if (!isPresent(client)) {
        // this shouldn't happen but better to explicitly throw
        throw new Error('Console client is not initialized');
      }
      const r = await client.publishMessage(request);

      return r;
    },
    async createTopic(request: CreateTopicRequest): Promise<CreateTopicResponse> {
      // POST "/topics"
      const response = await appConfig.fetch(`${appConfig.restBasePath}/topics`, {
        method: 'POST',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify(request),
      });
      return parseOrUnwrap<CreateTopicResponse>(response, null);
    },
    async createSecret(clusterName: string, connectorName: string, secretValue: string): Promise<CreateSecretResponse> {
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/secrets`,
        {
          method: 'POST',
          headers: [['Content-Type', 'application/json']],
          body: JSON.stringify({
            connectorName,
            clusterName,
            secretData: secretValue,
            labels: {
              component: 'connectors',
            },
          }),
        }
      );
      return parseOrUnwrap<CreateSecretResponse>(response, null);
    },
    async updateSecret(clusterName: string, secretId: string, secretValue: string): Promise<void> {
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/secrets/${encodeURIComponent(secretId)}`,
        {
          method: 'PUT',
          headers: [['Content-Type', 'application/json']],
          body: JSON.stringify({
            secretData: secretValue,
          }),
        }
      );
      return parseOrUnwrap<void>(response, null);
    },
    async deleteSecret(clusterName: string, secretId: string): Promise<void> {
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/secrets/${encodeURIComponent(secretId)}`,
        {
          method: 'DELETE',
        }
      );
      return parseOrUnwrap<void>(response, null);
    },
  };
}
