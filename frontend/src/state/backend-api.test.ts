import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { ErrorInfoSchema } from 'protogen/google/rpc/error_details_pb';
import {
  ComponentStatusSchema,
  GetConsoleInfoResponseSchema,
  GetKafkaAuthorizerInfoResponseSchema,
  GetKafkaConnectInfoResponseSchema,
  GetKafkaInfoResponseSchema,
  GetRedpandaInfoResponseSchema,
  GetSchemaRegistryInfoResponseSchema,
  StatusType,
} from 'protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import { Reason } from 'protogen/redpanda/api/dataplane/v1alpha1/error_pb';

const { mockClusterStatusClient } = vi.hoisted(() => ({
  mockClusterStatusClient: {
    getKafkaAuthorizerInfo: vi.fn(),
    getConsoleInfo: vi.fn(),
    getKafkaInfo: vi.fn(),
    getRedpandaInfo: vi.fn(),
    getKafkaConnectInfo: vi.fn(),
    getSchemaRegistryInfo: vi.fn(),
  },
}));

vi.mock('../config', () => ({
  config: {
    clusterStatusClient: mockClusterStatusClient,
    restBasePath: '',
    controlplaneUrl: '',
    grpcBasePath: '',
    assetsPath: '',
    fetch: vi.fn(),
    setSidebarItems: vi.fn(),
    setBreadcrumbs: vi.fn(),
    isServerless: false,
    isAdpEnabled: false,
    featureFlags: {},
  },
  isEmbedded: vi.fn(() => false),
}));

import { api, useApiStore } from './backend-api';

const healthySchemaRegistryResponse = create(GetSchemaRegistryInfoResponseSchema, {
  status: create(ComponentStatusSchema, { status: StatusType.HEALTHY }),
  registeredSubjectsCount: 3,
});

const schemaRegistryNotConfiguredReason = `REASON_${Reason[Reason.FEATURE_NOT_CONFIGURED]}`;
const initialClusterOverview = { ...useApiStore.getState().clusterOverview };

function resetBaseClusterStatusMocks() {
  mockClusterStatusClient.getKafkaAuthorizerInfo.mockResolvedValue(create(GetKafkaAuthorizerInfoResponseSchema, {}));
  mockClusterStatusClient.getConsoleInfo.mockResolvedValue(create(GetConsoleInfoResponseSchema, {}));
  mockClusterStatusClient.getKafkaInfo.mockResolvedValue(create(GetKafkaInfoResponseSchema, {}));
  mockClusterStatusClient.getRedpandaInfo.mockResolvedValue(create(GetRedpandaInfoResponseSchema, {}));
  mockClusterStatusClient.getKafkaConnectInfo.mockResolvedValue(create(GetKafkaConnectInfoResponseSchema, {}));
  mockClusterStatusClient.getSchemaRegistryInfo.mockResolvedValue(healthySchemaRegistryResponse);
}

function resetApiStore() {
  useApiStore.setState({
    userData: undefined,
    clusterOverview: {
      ...initialClusterOverview,
      kafkaAuthorizerInfo: null,
      kafkaAuthorizerError: null,
      kafka: null,
      redpanda: null,
      console: null,
      kafkaConnect: null,
      schemaRegistry: null,
      schemaRegistryError: null,
    },
  });
}

describe('api.refreshClusterOverview schema registry state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    resetBaseClusterStatusMocks();
    resetApiStore();
  });

  test('requests schema registry info when canViewSchemas is undefined', async () => {
    await api.refreshClusterOverview();

    expect(mockClusterStatusClient.getSchemaRegistryInfo).toHaveBeenCalledTimes(1);
  });

  test('stores schema registry info and clears stale errors on success', async () => {
    const staleError = new ConnectError('stale', Code.Internal);
    useApiStore.setState((state) => ({
      clusterOverview: {
        ...state.clusterOverview,
        schemaRegistryError: staleError,
      },
      userData: { canViewSchemas: true } as any,
    }));

    await api.refreshClusterOverview();

    const { clusterOverview } = useApiStore.getState();
    expect(clusterOverview.schemaRegistry).toBe(healthySchemaRegistryResponse);
    expect(clusterOverview.schemaRegistryError).toBeNull();
  });

  test('treats schema registry Code.Unimplemented with feature-not-configured detail as not configured', async () => {
    mockClusterStatusClient.getSchemaRegistryInfo.mockRejectedValue(
      new ConnectError('not configured', Code.Unimplemented, undefined, [
        {
          desc: ErrorInfoSchema,
          value: create(ErrorInfoSchema, {
            reason: schemaRegistryNotConfiguredReason,
          }),
        },
      ])
    );
    useApiStore.setState({ userData: { canViewSchemas: true } as any });

    await api.refreshClusterOverview();

    const { clusterOverview } = useApiStore.getState();
    expect(clusterOverview.schemaRegistry).toBeNull();
    expect(clusterOverview.schemaRegistryError).toBeNull();
  });

  test('treats schema registry Code.Unimplemented without details as not configured', async () => {
    mockClusterStatusClient.getSchemaRegistryInfo.mockRejectedValue(
      new ConnectError('not configured', Code.Unimplemented)
    );

    await api.refreshClusterOverview();

    const { clusterOverview } = useApiStore.getState();
    expect(clusterOverview.schemaRegistry).toBeNull();
    expect(clusterOverview.schemaRegistryError).toBeNull();
  });

  test('stores schema registry errors for unavailable responses', async () => {
    const unavailableError = new ConnectError('schema registry unavailable', Code.Unavailable);
    mockClusterStatusClient.getSchemaRegistryInfo.mockRejectedValue(unavailableError);
    useApiStore.setState({ userData: { canViewSchemas: true } as any });

    await api.refreshClusterOverview();

    const { clusterOverview } = useApiStore.getState();
    expect(clusterOverview.schemaRegistry).toBeNull();
    expect(clusterOverview.schemaRegistryError).toBe(unavailableError);
  });

  test('stores schema registry errors for internal responses', async () => {
    const internalError = new ConnectError('schema registry internal error', Code.Internal);
    mockClusterStatusClient.getSchemaRegistryInfo.mockRejectedValue(internalError);
    useApiStore.setState({ userData: { canViewSchemas: true } as any });

    await api.refreshClusterOverview();

    const { clusterOverview } = useApiStore.getState();
    expect(clusterOverview.schemaRegistry).toBeNull();
    expect(clusterOverview.schemaRegistryError).toBe(internalError);
  });

  test('skips schema registry request only when canViewSchemas is explicitly false', async () => {
    const staleError = new ConnectError('stale', Code.Internal);
    useApiStore.setState((state) => ({
      userData: { canViewSchemas: false } as any,
      clusterOverview: {
        ...state.clusterOverview,
        schemaRegistryError: staleError,
      },
    }));

    await api.refreshClusterOverview();

    expect(mockClusterStatusClient.getSchemaRegistryInfo).not.toHaveBeenCalled();

    const { clusterOverview } = useApiStore.getState();
    expect(clusterOverview.schemaRegistry).toBeNull();
    expect(clusterOverview.schemaRegistryError).toBeNull();
  });
});
