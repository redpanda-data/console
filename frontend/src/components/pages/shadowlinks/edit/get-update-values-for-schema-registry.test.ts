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

import { describe, expect, test } from 'vitest';

import { getUpdateValuesForSchemaRegistry } from './shadowlink-edit-utils';
import {
  type FormValues,
  initialValues,
  SCHEMA_REGISTRY_MODE,
  type SchemaRegistryFormValues,
  SR_AUTH_METHOD,
} from '../create/model';

const SR_MASK_PATH = 'configurations.schema_registry_sync_options';

const noneValues = (): FormValues => structuredClone(initialValues);

const topicValues = (): FormValues => {
  const values = structuredClone(initialValues);
  values.enableSchemaRegistrySync = true;
  values.schemaRegistry.mode = SCHEMA_REGISTRY_MODE.TOPIC;
  return values;
};

const apiValues = (overrides: Partial<SchemaRegistryFormValues> = {}): FormValues => {
  const values = structuredClone(initialValues);
  values.schemaRegistry = {
    ...values.schemaRegistry,
    mode: SCHEMA_REGISTRY_MODE.API,
    sourceUrl: 'https://sr.example.com',
    authMethod: SR_AUTH_METHOD.BASIC,
    basicCredentials: { username: 'sr-replicator', password: '' },
    mtls: {
      ...values.schemaRegistry.mtls,
      ca: { pemContent: 'CA_PEM', fileName: '' },
      clientCert: { pemContent: 'CERT_PEM', fileName: '' },
      existingKeyConfigured: true,
      existingKeyFingerprint: 'fp=',
    },
    scopeMode: 'specify',
    contexts: ['.prod'],
    subjects: [],
    syncBehavior: { ...values.schemaRegistry.syncBehavior, tailInterval: '10s' },
    paused: true,
    ...overrides,
  };
  return values;
};

describe('getUpdateValuesForSchemaRegistry', () => {
  test('untouched forms emit no mask in any mode', () => {
    for (const build of [noneValues, topicValues, apiValues]) {
      const result = getUpdateValuesForSchemaRegistry(build(), build());
      expect(result.fieldMaskPaths).toEqual([]);
    }
  });

  test('none to topic emits the mask with the topic oneof', () => {
    const result = getUpdateValuesForSchemaRegistry(topicValues(), noneValues());
    expect(result.fieldMaskPaths).toEqual([SR_MASK_PATH]);
    expect(result.value?.schemaRegistryShadowingMode?.case).toBe('shadowSchemaRegistryTopic');
  });

  test('topic to none emits the mask with no value', () => {
    const result = getUpdateValuesForSchemaRegistry(noneValues(), topicValues());
    expect(result.fieldMaskPaths).toEqual([SR_MASK_PATH]);
    expect(result.value).toBeUndefined();
  });

  test('none to api emits the mask with the full api oneof', () => {
    const result = getUpdateValuesForSchemaRegistry(apiValues(), noneValues());
    expect(result.fieldMaskPaths).toEqual([SR_MASK_PATH]);
    expect(result.value?.schemaRegistryShadowingMode?.case).toBe('shadowSchemaRegistryApi');
    if (result.value?.schemaRegistryShadowingMode?.case === 'shadowSchemaRegistryApi') {
      const api = result.value.schemaRegistryShadowingMode.value;
      expect(api.sourceUrl).toBe('https://sr.example.com');
      // paused survives the rebuild instead of resetting to false
      expect(api.paused).toBe(true);
    }
  });

  test('api to none emits the mask with no value', () => {
    const result = getUpdateValuesForSchemaRegistry(noneValues(), apiValues());
    expect(result.fieldMaskPaths).toEqual([SR_MASK_PATH]);
    expect(result.value).toBeUndefined();
  });

  test('an api field edit emits the mask and keeps paused', () => {
    const edited = apiValues({
      syncBehavior: { ...initialValues.schemaRegistry.syncBehavior, tailInterval: '30s' },
    });
    const result = getUpdateValuesForSchemaRegistry(edited, apiValues());
    expect(result.fieldMaskPaths).toEqual([SR_MASK_PATH]);
    if (result.value?.schemaRegistryShadowingMode?.case === 'shadowSchemaRegistryApi') {
      expect(result.value.schemaRegistryShadowingMode.value.tailInterval).toMatchObject({ seconds: 30n });
      expect(result.value.schemaRegistryShadowingMode.value.paused).toBe(true);
    }
  });

  test('an unrelated api edit round-trips TLS material stored with TLS disabled', () => {
    // rpk/Admin API links can store file-path TLS with enabled: false; the
    // mask replaces the whole parent message, so the material must survive
    // edits to other fields.
    const disabledTls = (): FormValues =>
      apiValues({
        useTls: false,
        mtls: {
          ...initialValues.schemaRegistry.mtls,
          filePaths: { caPath: '/etc/tls/ca.pem', keyPath: '/etc/tls/client.key', certPath: '/etc/tls/client.pem' },
        },
        basicCredentials: { username: 'sr-replicator', password: 'retyped' },
      });

    const untouched = getUpdateValuesForSchemaRegistry(disabledTls(), disabledTls());
    expect(untouched.fieldMaskPaths).toEqual([]);

    const edited = disabledTls();
    edited.schemaRegistry.syncBehavior = { ...edited.schemaRegistry.syncBehavior, tailInterval: '30s' };
    const result = getUpdateValuesForSchemaRegistry(edited, disabledTls());
    expect(result.fieldMaskPaths).toEqual(['configurations.schema_registry_sync_options']);
    if (result.value?.schemaRegistryShadowingMode?.case === 'shadowSchemaRegistryApi') {
      const tls = result.value.schemaRegistryShadowingMode.value.tlsSettings;
      expect(tls?.enabled).toBe(false);
      expect(tls?.tlsSettings?.case).toBe('tlsFileSettings');
    }
  });

  test('typing a password emits the mask; an empty field keeps it silent', () => {
    const typed = apiValues({ basicCredentials: { username: 'sr-replicator', password: 'new-secret' } });
    expect(getUpdateValuesForSchemaRegistry(typed, apiValues()).fieldMaskPaths).toEqual([SR_MASK_PATH]);
    expect(getUpdateValuesForSchemaRegistry(apiValues(), apiValues()).fieldMaskPaths).toEqual([]);
  });

  test('scratch values typed into a mode that is not submitted emit no mask', () => {
    // The user toured the api tab on a topic link, typed, then switched back.
    const touredButTopic = topicValues();
    touredButTopic.schemaRegistry.sourceUrl = 'https://left-over.example.com';
    touredButTopic.schemaRegistry.contexts = ['.scratch'];

    const result = getUpdateValuesForSchemaRegistry(touredButTopic, topicValues());
    expect(result.fieldMaskPaths).toEqual([]);
    expect(result.value?.schemaRegistryShadowingMode?.case).toBe('shadowSchemaRegistryTopic');
  });

  test('uploading a replacement key emits the mask', () => {
    const replaced = apiValues();
    replaced.schemaRegistry.mtls.clientKey = { pemContent: 'NEW_KEY_PEM', fileName: 'client.key' };

    const result = getUpdateValuesForSchemaRegistry(replaced, apiValues());
    expect(result.fieldMaskPaths).toEqual([SR_MASK_PATH]);
  });

  test('removing the stored mtls pair emits the mask without PEM material', () => {
    const removed = apiValues();
    removed.schemaRegistry.mtls = {
      ...removed.schemaRegistry.mtls,
      ca: undefined,
      clientCert: undefined,
      existingKeyConfigured: false,
      existingKeyFingerprint: '',
    };

    const result = getUpdateValuesForSchemaRegistry(removed, apiValues());
    expect(result.fieldMaskPaths).toEqual([SR_MASK_PATH]);
    if (result.value?.schemaRegistryShadowingMode?.case === 'shadowSchemaRegistryApi') {
      expect(result.value.schemaRegistryShadowingMode.value.tlsSettings?.tlsSettings?.case).toBeUndefined();
    }
  });
});
