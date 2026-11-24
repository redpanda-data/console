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

import { afterAll, afterEach, beforeAll, expect, test } from '@rstest/core';
import { waitFor } from '@testing-library/dom';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';

import type { ConnectorPropertiesStore } from './connector-properties-store';
import type { ConnectorProperty, ConnectorValidationResult } from '../rest-interfaces';
import { DataType, PropertyImportance, PropertyWidth } from '../rest-interfaces';

const CLUSTER = 'local-connect-cluster';
const PLUGIN = 'io.debezium.connector.postgresql.PostgresConnector';
const VALIDATE = new URL(
  `/api/kafka-connect/clusters/${CLUSTER}/connector-plugins/${PLUGIN}/config/validate`,
  window.location.href
).href;
const server = setupServer();
const guardedFetch = globalThis.fetch;
const stores = new Set<ConnectorPropertiesStore>();

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network request while opening a connector');
    },
  });
});

afterEach(() => {
  for (const store of stores) {
    store.dispose();
  }
  stores.clear();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

type FieldOptions = Pick<ConnectorProperty['definition'], 'type' | 'default_value' | 'custom_default_value'>;

function connectorField(name: string, options: Partial<FieldOptions> = {}) {
  return {
    definition: {
      name,
      type: DataType.String,
      required: false,
      default_value: null,
      importance: PropertyImportance.High,
      documentation: '',
      width: PropertyWidth.Medium,
      display_name: name,
      dependents: [],
      order: 0,
      ...options,
    },
    value: {
      name,
      value: null,
      recommended_values: [],
      errors: [],
      visible: true,
    },
    metadata: {},
  } satisfies ConnectorProperty;
}

function captureValidation(properties: ConnectorProperty[]) {
  const requests: unknown[] = [];
  server.use(
    http.put(VALIDATE, async ({ request }) => {
      requests.push(await request.json());
      return HttpResponse.json({
        name: 'orders',
        configs: properties,
        steps: [
          {
            name: 'Configuration',
            groups: [{ name: 'General', config_keys: properties.map((property) => property.definition.name) }],
            stepIndex: 0,
          },
        ],
      } satisfies ConnectorValidationResult);
    })
  );
  return requests;
}

async function openConnector(name: string | null, appliedConfig?: Record<string, unknown>) {
  const { ConnectClusterStore } = await import('./state');
  const cluster = new ConnectClusterStore(CLUSTER);
  cluster.additionalClusterInfo = {
    clusterName: CLUSTER,
    host: 'http://connect:8083',
    clusterVersion: '3.9.0',
    plugins: [{ class: PLUGIN, type: 'source' }],
  };

  const store = cluster.getConnector(PLUGIN, name, appliedConfig);
  if (!store) {
    throw new Error('Expected an installed connector plugin');
  }
  stores.add(store);

  await waitFor(() => expect(store.initPending).toBe(false));
  expect(store.error).toBeUndefined();
  return store;
}

test('a new connector takes backend defaults unless a custom default overrides them', async () => {
  const requests = captureValidation([
    connectorField('flush.lsn.source', { type: DataType.Boolean, custom_default_value: 'true' }),
    connectorField('tombstones.on.delete', { type: DataType.Boolean, custom_default_value: 'false' }),
    connectorField('snapshot.mode', { default_value: 'initial', custom_default_value: 'never' }),
    connectorField('slot.name', { default_value: 'debezium' }),
    connectorField('topic.prefix'),
  ]);

  const store = await openConnector(null);

  expect(requests[0]).toEqual({ 'connector.class': PLUGIN, name: '' });
  expect(store.crud).toBe('create');
  expect(store.propsByName.get('flush.lsn.source')?.value).toBe('true');
  expect(store.propsByName.get('tombstones.on.delete')?.value).toBe('false');
  expect(store.propsByName.get('snapshot.mode')?.value).toBe('never');
  expect(store.propsByName.get('slot.name')?.value).toBe('debezium');
  expect(store.propsByName.get('topic.prefix')?.value).toBeNull();
});

test('editing an installed connector preserves its saved config over custom defaults', async () => {
  const requests = captureValidation([
    connectorField('flush.lsn.source', { type: DataType.Boolean, default_value: 'true', custom_default_value: 'true' }),
  ]);
  const appliedConfig = { 'connector.class': PLUGIN, name: 'orders', 'flush.lsn.source': 'false' };

  const store = await openConnector('orders', appliedConfig);

  expect(requests[0]).toEqual(appliedConfig);
  expect(store.crud).toBe('update');
  expect(store.propsByName.get('flush.lsn.source')?.value).toBe(false);
});
