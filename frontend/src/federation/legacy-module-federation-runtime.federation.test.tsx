// Copyright 2026 Redpanda Data, Inc.

import { expect, rs, test } from '@rstest/core';
import { waitFor } from '@testing-library/react';

import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve('package.json'));
const container: {
  init: (scope: object) => Promise<void>;
  get: <T>(name: string) => Promise<() => T>;
} = require('./tests/federation/remote-adapter.cjs');

test('keeps legacy exports isolated from a React 18 host share scope', async () => {
  const host = createLegacyHost();
  await container.init(host.scope);
  const getAccessToken = rs.fn(
    () =>
      new Promise<string>(() => {
        // Keep backend initialization pending while exercising the real renderer.
      })
  );
  const fixture = await mountLegacyEntries(getAccessToken);
  try {
    await waitFor(() => expect(getAccessToken).toHaveBeenCalledTimes(2));
    expect(fixture.legacyElement.$$typeof).toBe(Symbol.for('react.element'));
    expect(host.consumeHostReact).not.toHaveBeenCalled();
    await verifyLegacyApis();
  } finally {
    await fixture.dispose();
  }
});

async function verifyLegacyApis() {
  const config = (await container.get<typeof import('../config')>('./config'))();
  expect(config.getGrpcBasePath('https://example.com/redpanda.api.console.v1alpha1')).toBe(
    'https://example.com/redpanda.api.console.v1alpha1'
  );
  await expect(container.get('./injectApp')).resolves.toBeTypeOf('function');
  await expect(container.get('./EmbeddedApp')).resolves.toBeTypeOf('function');
}

async function mountLegacyEntries(getAccessToken: () => Promise<string>) {
  const bridge = (await container.get<typeof import('./console-federated-bridge')>('./BridgeApp'))().default();
  const { default: createLegacyElement } = (await container.get<typeof import('./console-legacy-app')>('./App'))();
  const nodes = { bridge: document.createElement('div'), legacy: document.createElement('div') };
  const props = { clusterId: 'legacy-federation-test', config: {}, getAccessToken };
  const legacyElement = createLegacyElement(props);
  document.body.append(nodes.bridge, nodes.legacy);
  await bridge.render({ dom: nodes.bridge, ...props });
  legacyElement.ref(nodes.legacy);
  return {
    legacyElement,
    async dispose() {
      bridge.destroy({ dom: nodes.bridge, moduleName: 'legacy-federation-test' });
      legacyElement.ref(null);
      await Promise.resolve();
      nodes.bridge.remove();
      nodes.legacy.remove();
    },
  };
}

function createLegacyHost() {
  const consumeHostReact = rs.fn(() => {
    throw new Error('Legacy Console must not consume host React 18');
  });
  const hostReact18 = { '18.3.1': { get: consumeHostReact, loaded: true, from: 'legacy-host' } };
  const scope = {
    react: hostReact18,
    'react-dom': hostReact18,
    'react-dom/client': hostReact18,
    'react/jsx-runtime': hostReact18,
    'react/jsx-dev-runtime': hostReact18,
  };
  return { scope, consumeHostReact };
}
