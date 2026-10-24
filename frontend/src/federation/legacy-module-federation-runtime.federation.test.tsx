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
  const consumeHostReact = rs.fn(() => {
    throw new Error('Legacy Console must not consume host React 18');
  });
  const hostReact18 = { '18.3.1': { get: consumeHostReact, loaded: true, from: 'legacy-host' } };
  await container.init({
    react: hostReact18,
    'react-dom': hostReact18,
    'react-dom/client': hostReact18,
    'react/jsx-runtime': hostReact18,
    'react/jsx-dev-runtime': hostReact18,
  });

  const config = (await container.get<typeof import('../config')>('./config'))();
  expect(config.getGrpcBasePath('https://example.com/redpanda.api.console.v1alpha1')).toBe(
    'https://example.com/redpanda.api.console.v1alpha1'
  );

  const { default: createBridge } = (await container.get<typeof import('./console-federated-bridge')>('./BridgeApp'))();
  const { default: LegacyApp } = (await container.get<typeof import('./console-legacy-app')>('./App'))();
  const getAccessToken = rs.fn(
    () =>
      new Promise<string>(() => {
        // Keep backend initialization pending while exercising the real renderer.
      })
  );
  const props = { clusterId: 'legacy-federation-test', config: {}, getAccessToken };
  const bridge = createBridge();
  const bridgeNode = document.createElement('div');
  const legacyNode = document.createElement('div');
  document.body.append(bridgeNode, legacyNode);
  const legacyElement = LegacyApp(props);

  try {
    await bridge.render({ dom: bridgeNode, ...props });
    legacyElement.ref(legacyNode);
    await waitFor(() => expect(getAccessToken).toHaveBeenCalledTimes(2));
    expect(legacyElement.$$typeof).toBe(Symbol.for('react.element'));
    expect(consumeHostReact).not.toHaveBeenCalled();
    await expect(container.get('./injectApp')).resolves.toBeTypeOf('function');
    await expect(container.get('./EmbeddedApp')).resolves.toBeTypeOf('function');
  } finally {
    bridge.destroy({ dom: bridgeNode, moduleName: 'legacy-federation-test' });
    legacyElement.ref(null);
    await Promise.resolve();
    bridgeNode.remove();
    legacyNode.remove();
  }
});
