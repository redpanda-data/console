/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create, type MessageShape } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, test } from '@rstest/core';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { config } from 'config';
import {
  CreateShadowLinkResponseSchema,
  ListShadowLinksResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import {
  createShadowLink,
  listShadowLinks,
} from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { toast } from 'sonner';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { useUIStateStore } from 'state/ui-state';
import { cleanup, renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { ShadowLinkCreatePage } from './shadowlink-create-page';
import {
  addACLFilterCreate,
  addBootstrapServer,
  addConsumerFilterCreate,
  addRoleFilterCreate,
  addTopicFilterCreate,
  enableTLS,
  navigateToConfigurationStep,
  setSchemaRegistrySyncGateSupported as seedSchemaRegistrySyncGate,
  setShadowLinkGatesSupported,
} from '../shadowlink-test-helpers';

const pristineFeatureStoreState = useSupportedFeaturesStore.getState();
const pristineUIState = useUIStateStore.getState();
const originalJWT = config.jwt;

beforeEach(() => {
  config.jwt = undefined;
  setShadowLinkGatesSupported({ schemaRegistrySync: false, roleSync: true });
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  config.jwt = originalJWT;
  useSupportedFeaturesStore.setState(pristineFeatureStoreState, true);
  useUIStateStore.setState(pristineUIState, true);
});

function renderCreatePage() {
  const requests: MessageShape<typeof createShadowLink.input>[] = [];
  const { router } = renderWithFileRoutes(<ShadowLinkCreatePage />, {
    initialLocation: '/shadowlinks/create',
    transport: createRouterTransport(({ rpc }) => {
      rpc(listShadowLinks, () => create(ListShadowLinksResponseSchema, { shadowLinks: [] }));
      rpc(createShadowLink, (request) => {
        requests.push(request);
        return create(CreateShadowLinkResponseSchema, {});
      });
    }),
  });
  return { router, requests };
}

type CertificateType = 'ca' | 'clientCert' | 'clientKey';

type CreateAction =
  | { type: 'fillName'; value: string }
  | { type: 'fillBootstrapServer'; index: number; value: string }
  | { type: 'addBootstrapServer'; value: string }
  | { type: 'fillScramUsername'; value: string }
  | { type: 'fillScramPassword'; value: string }
  | { type: 'enableTLS' }
  | { type: 'addCertificateFilePath'; certType: CertificateType; filePath: string }
  | { type: 'addCertificatePEM'; certType: CertificateType; pemContent: string }
  | { type: 'navigateToConfiguration' }
  | { type: 'addTopicFilterCreate'; name: string; options?: { patternType?: PatternType; filterType?: FilterType } }
  | { type: 'addConsumerFilterCreate'; name: string }
  | { type: 'addACLFilterCreate'; principal: string }
  | { type: 'addRoleFilterCreate'; name: string }
  | { type: 'enableSchemaRegistrySync' };

const fillInputValue = async (input: HTMLElement, value: string) => {
  fireEvent.input(input, { target: { value } });
  await waitFor(() => {
    expect((input as HTMLInputElement).value).toBe(value);
  });
};

const CERTIFICATE_PATH_TEST_ID_SUFFIX: Record<CertificateType, string> = {
  ca: 'ca',
  clientCert: 'client-cert',
  clientKey: 'client-key',
};

/**
 * Expand the disclosure that owns this cert type. CA lives under the CA disclosure;
 * clientCert/clientKey live under the mTLS disclosure.
 */
const openCertificateDisclosure = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  certType: CertificateType
) => {
  const trigger = scr.getByTestId(certType === 'ca' ? 'tls-ca-disclosure-trigger' : 'tls-mtls-disclosure-trigger');
  if (trigger.getAttribute('data-state') !== 'open') {
    await user.click(trigger);
  }
};

const addCertificateFilePath = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  certType: CertificateType,
  filePath: string
) => {
  await openCertificateDisclosure(user, scr, certType);

  await waitFor(
    () => {
      expect(scr.getByTestId('mtls-mode-file-path-tab')).toBeInTheDocument();
    },
    { timeout: 200 }
  );
  await user.click(scr.getByTestId('mtls-mode-file-path-tab'));

  const testIdSuffix = CERTIFICATE_PATH_TEST_ID_SUFFIX[certType];

  await waitFor(
    () => {
      expect(scr.getByTestId(`mtls-${testIdSuffix}-path-input`)).toBeInTheDocument();
    },
    { timeout: 200 }
  );
  await user.type(scr.getByTestId(`mtls-${testIdSuffix}-path-input`), filePath);
};

/**
 * Expand the disclosure that owns this cert type, then drop a file directly into
 * the inline upload row. No modal, no save step.
 */
const uploadCertificatePem = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  certType: CertificateType,
  pemContent: string
) => {
  await openCertificateDisclosure(user, scr, certType);

  await waitFor(
    () => {
      expect(scr.getByTestId(`add-${certType}-button`)).toBeInTheDocument();
    },
    { timeout: 200 }
  );

  const input = scr.getByTestId(`add-${certType}-button`).querySelector('input[type="file"]');
  const file = new File([pemContent], `${certType}.pem`, { type: 'application/x-pem-file' });

  if (input) {
    await user.upload(input as HTMLInputElement, file);
  }

  await waitFor(() => {
    expect(scr.getByTestId(`${certType}-status`)).toBeInTheDocument();
  });
};

const performCreateAction = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  action: CreateAction
) => {
  switch (action.type) {
    case 'fillName':
      await fillInputValue(scr.getByPlaceholderText('my-shadow-link'), action.value);
      break;
    case 'fillBootstrapServer':
      await fillInputValue(scr.getByTestId(`bootstrap-server-input-${action.index}`), action.value);
      break;
    case 'addBootstrapServer':
      await addBootstrapServer(user, scr, action.value);
      break;
    case 'fillScramUsername':
      await fillInputValue(scr.getByTestId('scram-username-input'), action.value);
      break;
    case 'fillScramPassword':
      await fillInputValue(scr.getByTestId('scram-password-input'), action.value);
      break;
    case 'enableTLS':
      await enableTLS(user, scr);
      break;
    case 'addCertificateFilePath':
      await addCertificateFilePath(user, scr, action.certType, action.filePath);
      break;
    case 'addCertificatePEM':
      await uploadCertificatePem(user, scr, action.certType, action.pemContent);
      break;
    case 'navigateToConfiguration':
      await navigateToConfigurationStep(user, scr);
      break;
    case 'addTopicFilterCreate':
      await addTopicFilterCreate(user, scr, action.name, action.options);
      break;
    case 'addConsumerFilterCreate':
      await addConsumerFilterCreate(user, scr, action.name);
      break;
    case 'addACLFilterCreate':
      await addACLFilterCreate(user, scr, action.principal);
      break;
    case 'addRoleFilterCreate':
      await addRoleFilterCreate(user, scr, action.name);
      break;
    case 'enableSchemaRegistrySync':
      await user.click(scr.getByTestId('sr-enable-switch'));
      break;
    default:
      throw new Error(`Unknown action type: ${JSON.stringify(action)}`);
  }
};

const CONNECTION_STEP_ACTIONS: CreateAction[] = [
  { type: 'fillName', value: 'test-shadow-link' },
  { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
  { type: 'fillScramUsername', value: 'admin' },
  { type: 'fillScramPassword', value: 'admin-secret' },
  { type: 'navigateToConfiguration' },
];

const renderAndPerform = async (user: ReturnType<typeof userEvent.setup>, actions: CreateAction[]) => {
  const initialLocation = window.location.href;
  const trace = renderCreatePage();

  await screen.findByPlaceholderText('my-shadow-link', {}, { timeout: 10_000 });
  expect(window.location.href).toBe(initialLocation);

  await actions.reduce<Promise<void>>(
    (previous, action) => previous.then(() => performCreateAction(user, screen, action)),
    Promise.resolve()
  );
  return trace;
};

async function submitCreateForm(user: ReturnType<typeof userEvent.setup>, trace: ReturnType<typeof renderCreatePage>) {
  await user.click(screen.getByRole('button', { name: 'Create shadow link' }));
  await waitFor(() => expect(trace.router.state.location.pathname).toBe('/shadowlinks'));
  expect(trace.requests).toHaveLength(1);
  expect(toast.getToasts()).toContainEqual(expect.objectContaining({ type: 'success', title: 'Shadow link created' }));

  const [request] = trace.requests;
  if (!request?.shadowLink?.configurations) {
    throw new Error('CreateShadowLink did not receive link configurations');
  }
  return { ...request, shadowLink: { ...request.shadowLink, configurations: request.shadowLink.configurations } };
}

const fillSchemaRegistryApiConnection = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId('sr-mode-api-tab'));
  await waitFor(() => {
    expect(screen.getByTestId('sr-source-url-input')).toBeInTheDocument();
  });

  fireEvent.input(screen.getByTestId('sr-source-url-input'), {
    target: { value: 'https://schema-registry.example.com:8081' },
  });

  await user.click(screen.getByTestId('sr-auth-basic-tab'));
  await waitFor(() => {
    expect(screen.getByTestId('sr-basic-username-input')).toBeInTheDocument();
  });
  fireEvent.input(screen.getByTestId('sr-basic-username-input'), { target: { value: 'sr-replicator' } });
  fireEvent.input(screen.getByTestId('sr-basic-password-input'), { target: { value: 'p@ssw0rd!' } });
};

type CreateTestCase = {
  description: string;
  actions: CreateAction[];
  verify: (createRequest: any, exp: typeof import('@rstest/core').expect) => void;
};

const testCases: CreateTestCase[] = [
  {
    description: 'creates minimal shadow link with required fields only',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.name).toBe('test-shadow-link');
      exp(createRequest.shadowLink.configurations.clientOptions.bootstrapServers).toEqual(['server1.example.com:9092']);
      exp(createRequest.shadowLink.configurations.clientOptions.authenticationConfiguration.authentication.case).toBe(
        'scramConfiguration'
      );
      const scramConfig =
        createRequest.shadowLink.configurations.clientOptions.authenticationConfiguration.authentication.value;
      exp(scramConfig.username).toBe('admin');
      exp(scramConfig.password).toBe('admin-secret');
      exp(scramConfig.scramMechanism).toBeDefined();
      exp(createRequest.shadowLink.configurations.roleSyncOptions?.roleNameFilters).toEqual([
        exp.objectContaining({ name: '*', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }),
      ]);
    },
  },
  {
    description: 'creates shadow link with 2 bootstrap servers',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'addBootstrapServer', value: 'server2.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.configurations.clientOptions.bootstrapServers).toEqual([
        'server1.example.com:9092',
        'server2.example.com:9092',
      ]);
    },
  },
  {
    description: 'creates shadow link with topic filters',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
      {
        type: 'addTopicFilterCreate',
        name: 'topic-exact',
        options: { patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE },
      },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toHaveLength(
        1
      );
      const topicFilter =
        createRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters[0];
      exp(topicFilter.name).toBe('topic-exact');
      exp(topicFilter.patternType).toBe(PatternType.LITERAL);
      exp(topicFilter.filterType).toBe(FilterType.INCLUDE);
    },
  },
  {
    description: 'creates shadow link with role filters',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
      { type: 'addRoleFilterCreate', name: 'my-role' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.configurations.roleSyncOptions?.roleNameFilters).toHaveLength(1);
      const roleFilter = createRequest.shadowLink.configurations.roleSyncOptions?.roleNameFilters[0];
      exp(roleFilter.name).toBe('my-role');
      exp(roleFilter.patternType).toBe(PatternType.LITERAL);
      exp(roleFilter.filterType).toBe(FilterType.INCLUDE);
    },
  },
  {
    description: 'creates shadow link with a specific ACL filter',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
      { type: 'addACLFilterCreate', principal: 'User:alice' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.configurations.securitySyncOptions?.aclFilters).toHaveLength(1);
      const aclFilter = createRequest.shadowLink.configurations.securitySyncOptions?.aclFilters[0];
      exp(aclFilter.accessFilter?.principal).toBe('User:alice');
    },
  },
  {
    description: 'creates shadow link with 2 servers and 1 topic filter',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'addBootstrapServer', value: 'server2.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
      {
        type: 'addTopicFilterCreate',
        name: 'topic-exact',
        options: { patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE },
      },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.name).toBe('test-shadow-link');
      exp(createRequest.shadowLink.configurations.clientOptions.bootstrapServers).toEqual([
        'server1.example.com:9092',
        'server2.example.com:9092',
      ]);
      exp(createRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toHaveLength(
        1
      );
      exp(createRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters[0].name).toBe(
        'topic-exact'
      );
    },
  },
  {
    description: 'creates shadow link with TLS certificate using file path',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'addCertificateFilePath', certType: 'ca', filePath: '/etc/certs/ca.pem' },
      { type: 'navigateToConfiguration' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.name).toBe('test-shadow-link');
      exp(createRequest.shadowLink.configurations.clientOptions.tlsSettings.enabled).toBe(true);
      exp(createRequest.shadowLink.configurations.clientOptions.tlsSettings.tlsSettings.case).toBe('tlsFileSettings');
      exp(createRequest.shadowLink.configurations.clientOptions.tlsSettings.tlsSettings.value.caPath).toBe(
        '/etc/certs/ca.pem'
      );
    },
  },
  {
    description: 'creates shadow link with TLS certificate using PEM upload',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      {
        type: 'addCertificatePEM',
        certType: 'ca',
        pemContent: '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----',
      },
      { type: 'navigateToConfiguration' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.name).toBe('test-shadow-link');
      exp(createRequest.shadowLink.configurations.clientOptions.tlsSettings.enabled).toBe(true);
      exp(createRequest.shadowLink.configurations.clientOptions.tlsSettings.tlsSettings.case).toBe('tlsPemSettings');
      exp(createRequest.shadowLink.configurations.clientOptions.tlsSettings.tlsSettings.value.ca).toBe(
        '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----'
      );
    },
  },
  {
    description: 'creates shadow link with schema registry sync enabled',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
      { type: 'enableSchemaRegistrySync' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.name).toBe('test-shadow-link');
      exp(createRequest.shadowLink.configurations.schemaRegistrySyncOptions).toBeDefined();
      exp(createRequest.shadowLink.configurations.schemaRegistrySyncOptions?.schemaRegistryShadowingMode.case).toBe(
        'shadowSchemaRegistryTopic'
      );
    },
  },
];

describe('the ShadowLinkCreatePage', () => {
  test.each(testCases)('$description', async ({ actions, verify }) => {
    const user = userEvent.setup();

    const trace = await renderAndPerform(user, actions);

    const createRequest = await submitCreateForm(user, trace);

    verify(createRequest, expect);
  });

  test('hides the roles card and omits role sync options when the cluster does not support role sync', async () => {
    setShadowLinkGatesSupported({ schemaRegistrySync: false, roleSync: false });

    const user = userEvent.setup();

    const trace = await renderAndPerform(user, CONNECTION_STEP_ACTIONS);

    expect(screen.queryByTestId('roles-all-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('roles-toggle-button')).not.toBeInTheDocument();

    const createRequest = await submitCreateForm(user, trace);
    expect(createRequest.shadowLink.configurations.roleSyncOptions).toBeUndefined();
  });
});

describe('the ShadowLinkCreatePage - Schema Registry sync over API', () => {
  beforeEach(() => {
    seedSchemaRegistrySyncGate(true);
  });

  test('submits api mode with raw basic auth password and TLS enabled', async () => {
    const user = userEvent.setup();

    const trace = await renderAndPerform(user, CONNECTION_STEP_ACTIONS);

    expect(screen.queryByTestId('sr-enable-switch')).not.toBeInTheDocument();

    await fillSchemaRegistryApiConnection(user);

    const createRequest = await submitCreateForm(user, trace);
    expect(
      createRequest.shadowLink.configurations.schemaRegistrySyncOptions?.schemaRegistryShadowingMode
    ).toMatchObject({
      case: 'shadowSchemaRegistryApi',
      value: {
        sourceUrl: 'https://schema-registry.example.com:8081',
        authOptions: {
          authOptions: {
            case: 'basic',
            value: { username: 'sr-replicator', password: 'p@ssw0rd!' },
          },
        },
        tlsSettings: { enabled: true },
      },
    });
  });

  test('keeps the legacy topic payload when _schemas topic mode is selected', async () => {
    const user = userEvent.setup();

    const trace = await renderAndPerform(user, CONNECTION_STEP_ACTIONS);

    await user.click(screen.getByTestId('sr-mode-topic-tab'));

    const createRequest = await submitCreateForm(user, trace);
    expect(createRequest.shadowLink.configurations.schemaRegistrySyncOptions?.schemaRegistryShadowingMode.case).toBe(
      'shadowSchemaRegistryTopic'
    );
  });
});
