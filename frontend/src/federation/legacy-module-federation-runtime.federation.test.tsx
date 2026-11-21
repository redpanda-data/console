// Copyright 2026 Redpanda Data, Inc.

import { expect, rs, test } from '@rstest/core';
import { waitFor } from '@testing-library/react';

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { isObject } from '../utils/type-guards';

const require = createRequire(resolve('package.json'));
const container: unknown = require('./tests/federation/remote-adapter.cjs');

// A built CJS remote is runtime input: validate the callable exports we consume,
// retaining unknown results rather than claiming get<T> can prove arbitrary T.
function remoteObject(value: unknown): Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error('Federation export must be an object');
  }
  return value;
}

function callRemote(value: unknown, receiver: unknown, args: unknown[]): unknown {
  if (typeof value !== 'function') {
    throw new Error('Federation export must be callable');
  }
  return Reflect.apply(value, receiver, args);
}

function remoteMethod(value: unknown, name: string) {
  const owner = remoteObject(value);
  return (...args: unknown[]): unknown => callRemote(owner[name], owner, args);
}

async function getRemoteFactory(name: string) {
  return await remoteMethod(container, 'get')(name);
}

async function getRemoteModule(name: string) {
  const factory = await getRemoteFactory(name);
  return callRemote(factory, undefined, []);
}

test('keeps legacy exports isolated from a React 18 host share scope', async () => {
  const host = createLegacyHost();
  await remoteMethod(container, 'init')(host.scope);
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
  const config = await getRemoteModule('./config');
  expect(remoteMethod(config, 'getGrpcBasePath')('https://example.com/redpanda.api.console.v1alpha1')).toBe(
    'https://example.com/redpanda.api.console.v1alpha1'
  );
  expect(remoteObject(await getRemoteModule('./injectApp')).default).toBeTypeOf('function');
  expect(remoteObject(await getRemoteModule('./EmbeddedApp')).default).toBeTypeOf('function');
}

async function mountLegacyEntries(getAccessToken: () => Promise<string>) {
  const bridge = remoteMethod(await getRemoteModule('./BridgeApp'), 'default')();
  const createLegacyElement = remoteMethod(await getRemoteModule('./App'), 'default');
  const nodes = { bridge: document.createElement('div'), legacy: document.createElement('div') };
  const props = { clusterId: 'legacy-federation-test', config: {}, getAccessToken };
  const legacyElement = createLegacyElement(props);
  document.body.append(nodes.bridge, nodes.legacy);
  await remoteMethod(bridge, 'render')({ dom: nodes.bridge, ...props });
  remoteMethod(legacyElement, 'ref')(nodes.legacy);
  return {
    legacyElement: remoteObject(legacyElement),
    async dispose() {
      remoteMethod(bridge, 'destroy')({ dom: nodes.bridge, moduleName: 'legacy-federation-test' });
      remoteMethod(legacyElement, 'ref')(null);
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
