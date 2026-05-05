import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { screen } from '@testing-library/react';
import {
  ComponentStatusSchema,
  GetSchemaRegistryInfoResponseSchema,
  StatusType,
} from 'protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import type { ReactNode } from 'react';
import { renderWithFileRoutes } from 'test-utils';

vi.mock('../../../state/app-global', () => ({
  appGlobal: {
    onRefresh: null,
    historyPush: vi.fn(),
    historyReplace: vi.fn(),
  },
}));

vi.mock('./cluster-health-overview', () => ({
  default: () => <div data-testid="cluster-health-overview" />,
}));

vi.mock('./shadow-link-overview-card', () => ({
  ShadowLinkSection: () => <div data-testid="shadow-link-section" />,
}));

vi.mock('../../builder-io/nurture-panel', () => ({
  default: () => null,
}));

vi.mock('../../license/overview-license-notification', () => ({
  OverviewLicenseNotification: () => null,
}));

vi.mock('../../misc/null-fallback-boundary', () => ({
  NullFallbackBoundary: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

import Overview from './overview';
import { api, useApiStore } from '../../../state/backend-api';
import type { ClusterOverview } from '../../../state/rest-interfaces';

const initialClusterOverview = { ...useApiStore.getState().clusterOverview };

function resetOverviewStore(clusterOverview: Partial<ClusterOverview>) {
  useApiStore.setState({
    brokers: [],
    licenses: [],
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
      ...clusterOverview,
    },
  });
}

function stubOverviewRefreshes() {
  Object.assign(api, {
    refreshCluster: vi.fn(),
    refreshClusterOverview: vi.fn().mockResolvedValue(undefined),
    refreshBrokers: vi.fn(),
    refreshClusterHealth: vi.fn().mockResolvedValue(undefined),
    refreshDebugBundleStatuses: vi.fn().mockResolvedValue(undefined),
    listLicenses: vi.fn().mockResolvedValue(undefined),
  });
}

function getSchemaRegistryCells() {
  const titleCell = screen.getByRole('heading', { name: 'Schema Registry' }).parentElement;
  if (!titleCell) {
    throw new Error('Schema Registry title cell not found');
  }

  const left = titleCell.nextElementSibling;
  const right = left?.nextElementSibling ?? null;
  if (!(left && right)) {
    throw new Error('Schema Registry cells not found');
  }

  return {
    left,
    right,
  };
}

describe('Overview schema registry card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubOverviewRefreshes();
  });

  test('shows schema count when schema registry info is available', () => {
    resetOverviewStore({
      schemaRegistry: create(GetSchemaRegistryInfoResponseSchema, {
        status: create(ComponentStatusSchema, { status: StatusType.HEALTHY }),
        registeredSubjectsCount: 3,
      }),
    });

    renderWithFileRoutes(<Overview matchedPath="/overview" />);

    const { left, right } = getSchemaRegistryCells();
    expect(left).toHaveTextContent('Healthy');
    expect(right).toHaveTextContent('3 schemas');
  });

  test('shows unavailable when schema registry request failed', () => {
    resetOverviewStore({
      schemaRegistryError: new ConnectError('schema registry unavailable', Code.Unavailable),
    });

    renderWithFileRoutes(<Overview matchedPath="/overview" />);

    const { left, right } = getSchemaRegistryCells();
    expect(left).toHaveTextContent('Unavailable');
    expect(right).toBeEmptyDOMElement();
  });

  test('shows not configured only when schema registry is null and there is no error', () => {
    resetOverviewStore({
      schemaRegistry: null,
      schemaRegistryError: null,
    });

    renderWithFileRoutes(<Overview matchedPath="/overview" />);

    const { left, right } = getSchemaRegistryCells();
    expect(left).toHaveTextContent('Not configured');
    expect(right).toBeEmptyDOMElement();
  });
});
