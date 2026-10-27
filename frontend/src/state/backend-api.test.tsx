/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createClient, createRouterTransport } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';

rs.mock('../utils/fetch-with-timeout', () => ({ default: rs.fn() }));

import { api, rolesApi, useApiStore, useRolesStore } from './backend-api';
import type { TopicConsumer, TopicDescription, UserData } from './rest-interfaces';
import { config } from '../config';
import { AuthenticationMethod } from '../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import {
  ClusterStatusService,
  GetConsoleInfoResponseSchema,
  GetKafkaAuthorizerInfoResponseSchema,
  GetKafkaConnectInfoResponseSchema,
  GetKafkaInfoResponseSchema,
  GetRedpandaInfoResponseSchema,
  GetSchemaRegistryInfoResponseSchema,
} from '../protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import {
  BundleErrorSchema,
  DebugBundleStatus_Status,
  DebugBundleStatusSchema,
  GetDebugBundleStatusResponse_DebugBundleBrokerStatusSchema,
} from '../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import fetchWithTimeout from '../utils/fetch-with-timeout';

const topicsResponse = (topicNames: string[]) =>
  new Response(JSON.stringify({ topics: topicNames.map((topicName) => ({ topicName })) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('refreshTopics topic-cache pruning (F2)', () => {
  beforeEach(() => {
    rs.mocked(fetchWithTimeout).mockReset();
    // Reset the topic-keyed caches so state does not leak between tests (the api store is a
    // long-lived singleton that the harness does not reset).
    useApiStore.setState({
      topics: null,
      topicConfig: new Map(),
      topicConsumers: new Map(),
    });
  });

  test('drops topic-keyed cache entries for topics that no longer exist', async () => {
    rs.mocked(fetchWithTimeout).mockResolvedValue(topicsResponse(['live-topic']));
    useApiStore.setState({
      topicConfig: new Map<string, TopicDescription | null>([
        ['live-topic', null],
        ['stale-topic', null],
      ]),
      topicConsumers: new Map<string, TopicConsumer[]>([
        ['live-topic', []],
        ['stale-topic', []],
      ]),
    });

    await useApiStore.getState().refreshTopics(true);

    const state = useApiStore.getState();
    expect([...state.topicConfig.keys()]).toEqual(['live-topic']);
    expect([...state.topicConsumers.keys()]).toEqual(['live-topic']);
    expect(state.topics).toEqual([{ topicName: 'live-topic' }]);
  });

  test('keeps cache entries for topics that still exist', async () => {
    rs.mocked(fetchWithTimeout).mockResolvedValue(topicsResponse(['a', 'b']));
    useApiStore.setState({
      topicConfig: new Map<string, TopicDescription | null>([
        ['a', null],
        ['b', null],
      ]),
    });

    await useApiStore.getState().refreshTopics(true);

    expect([...useApiStore.getState().topicConfig.keys()].sort()).toEqual(['a', 'b']);
  });
});

const schemaViewer: UserData = {
  displayName: '',
  avatarUrl: '',
  authenticationMethod: AuthenticationMethod.UNSPECIFIED,
  canViewConsoleUsers: false,
  canListAcls: false,
  canListQuotas: false,
  canReassignPartitions: false,
  canPatchConfigs: false,
  canCreateRoles: false,
  canManageUsers: false,
  canViewPermissionsList: false,
  canManageLicense: false,
  canViewSchemas: true,
  canCreateSchemas: false,
  canDeleteSchemas: false,
  canManageSchemaRegistry: false,
  canViewDebugBundle: false,
  canListTransforms: false,
  canCreateTransforms: false,
  canDeleteTransforms: false,
};

const emptyClusterOverview = {
  kafkaAuthorizerInfo: null,
  kafkaAuthorizerError: null,
  kafka: null,
  redpanda: null,
  console: null,
  kafkaConnect: null,
  schemaRegistry: null,
};

const authorizerFailure = new ConnectError('authorizer unavailable', Code.Unavailable);

function clusterStatusClient(options: { failAuthorizer: boolean }) {
  const getSchemaRegistryInfo = rs.fn(() =>
    create(GetSchemaRegistryInfoResponseSchema, { registeredSubjectsCount: 3 })
  );
  const transport = createRouterTransport(({ service }) => {
    service(ClusterStatusService, {
      getKafkaAuthorizerInfo: () => {
        if (options.failAuthorizer) {
          throw authorizerFailure;
        }
        return create(GetKafkaAuthorizerInfoResponseSchema, { aclCount: 7 });
      },
      getConsoleInfo: () => create(GetConsoleInfoResponseSchema, { version: 'console-v1' }),
      getKafkaInfo: () => create(GetKafkaInfoResponseSchema, { version: 'kafka-v1' }),
      getRedpandaInfo: () => create(GetRedpandaInfoResponseSchema, { version: 'redpanda-v1' }),
      getKafkaConnectInfo: () => create(GetKafkaConnectInfoResponseSchema, {}),
      getSchemaRegistryInfo,
    });
  });
  return { client: createClient(ClusterStatusService, transport), getSchemaRegistryInfo };
}

describe('refreshClusterOverview', () => {
  const originalClient = config.clusterStatusClient;

  beforeEach(() => {
    useApiStore.setState({ clusterOverview: emptyClusterOverview, userData: null });
  });

  afterEach(() => {
    config.clusterStatusClient = originalClient;
    rs.restoreAllMocks();
  });

  test('stores each cluster status response and skips schema registry without schema access', async () => {
    const { client, getSchemaRegistryInfo } = clusterStatusClient({ failAuthorizer: false });
    config.clusterStatusClient = client;

    await useApiStore.getState().refreshClusterOverview();

    expect(useApiStore.getState().clusterOverview).toMatchObject({
      kafkaAuthorizerInfo: { aclCount: 7 },
      console: { version: 'console-v1' },
      kafka: { version: 'kafka-v1' },
      redpanda: { version: 'redpanda-v1' },
      kafkaConnect: { $typeName: 'redpanda.api.console.v1alpha1.GetKafkaConnectInfoResponse' },
      schemaRegistry: null,
    });
    expect(getSchemaRegistryInfo).not.toHaveBeenCalled();
  });

  test('requests schema registry info when the user can view schemas', async () => {
    const { client, getSchemaRegistryInfo } = clusterStatusClient({ failAuthorizer: false });
    config.clusterStatusClient = client;
    useApiStore.setState({ userData: schemaViewer });

    await useApiStore.getState().refreshClusterOverview();

    expect(getSchemaRegistryInfo).toHaveBeenCalledTimes(1);
    expect(useApiStore.getState().clusterOverview.schemaRegistry?.registeredSubjectsCount).toBe(3);
  });

  test('records a failed authorizer request and still stores the other responses', async () => {
    const consoleError = rs.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client } = clusterStatusClient({ failAuthorizer: true });
    config.clusterStatusClient = client;

    await useApiStore.getState().refreshClusterOverview();

    const overview = useApiStore.getState().clusterOverview;
    expect(overview.kafkaAuthorizerInfo).toBeNull();
    expect(overview.kafkaAuthorizerError?.code).toBe(Code.Unavailable);
    expect(overview.kafka?.version).toBe('kafka-v1');
    expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ code: Code.Unavailable }));
  });
});

const brokerBundleStatus = (status: DebugBundleStatus_Status, jobId: string) =>
  create(GetDebugBundleStatusResponse_DebugBundleBrokerStatusSchema, {
    value: { case: 'bundleStatus', value: create(DebugBundleStatusSchema, { status, jobId }) },
  });

const brokerBundleError = create(GetDebugBundleStatusResponse_DebugBundleBrokerStatusSchema, {
  value: { case: 'error', value: create(BundleErrorSchema, { message: 'broker unreachable' }) },
});

describe('api debug bundle getters', () => {
  test('debugBundleStatus prefers the running job over older bundles and ignores broker errors', () => {
    useApiStore.setState({
      debugBundleStatuses: [
        brokerBundleError,
        brokerBundleStatus(DebugBundleStatus_Status.SUCCESS, 'old-job'),
        brokerBundleStatus(DebugBundleStatus_Status.RUNNING, 'running-job'),
      ],
    });

    expect(api.debugBundleStatus?.jobId).toBe('running-job');
    expect(api.isDebugBundleInProgress).toBe(true);
    expect(api.canDownloadDebugBundle).toBe(false);
  });

  test('debugBundleStatus falls back to the first reported bundle when nothing is running', () => {
    useApiStore.setState({
      debugBundleStatuses: [
        brokerBundleError,
        brokerBundleStatus(DebugBundleStatus_Status.SUCCESS, 'first-job'),
        brokerBundleStatus(DebugBundleStatus_Status.ERROR, 'second-job'),
      ],
    });

    expect(api.debugBundleStatus?.jobId).toBe('first-job');
    expect(api.isDebugBundleInProgress).toBe(false);
    expect(api.canDownloadDebugBundle).toBe(true);
  });

  test('debugBundleStatus is undefined when brokers only report errors', () => {
    useApiStore.setState({ debugBundleStatuses: [brokerBundleError] });

    expect(api.debugBundleStatus).toBeUndefined();
    expect(api.isDebugBundleError).toBe(false);
  });
});

describe('store proxies', () => {
  test('api reads live store state and writes assignments back to the store', () => {
    useApiStore.setState({ errors: [new Error('stale')] });

    api.errors = [];

    expect(useApiStore.getState().errors).toEqual([]);
    useApiStore.setState({ schemaTypes: ['AVRO'] });
    expect(api.schemaTypes).toEqual(['AVRO']);
  });

  test('rolesApi forwards reads and writes to the roles store', () => {
    rolesApi.roles = ['admin', 'viewer'];

    expect(useRolesStore.getState().roles).toEqual(['admin', 'viewer']);
    useRolesStore.setState({ roles: ['operator'] });
    expect(rolesApi.roles).toEqual(['operator']);
  });
});
