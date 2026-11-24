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

import { SecretsStore } from './secrets-store';
import { expect, test } from 'bun:test';

const PASSWORD_KEY = 'source.cluster.sasl.password';

test('keeps a snapshot of filled secrets when a secret is cleared', () => {
  const store = new SecretsStore();
  const active = store.getSecret(PASSWORD_KEY);
  active.value = 'my-password';
  store.getSecret('source.cluster.ssl.truststore.certificates');
  store.getSecret('source.cluster.ssl.keystore.key').value = '';

  const snapshot = store.secrets;
  expect([...snapshot.keys()]).toEqual([PASSWORD_KEY]);

  active.value = '';

  expect(store.secrets.size).toBe(0);
  expect([...snapshot.keys()]).toEqual([PASSWORD_KEY]);
});
