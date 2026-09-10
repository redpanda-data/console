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

import { describe, expect, it } from 'vitest';

import type { ConnectorProperty, ConnectorValidationResult } from '../../../state/rest-interfaces';
import { DataType, PropertyImportance, PropertyWidth } from '../../../state/rest-interfaces';
import { getDataSource } from './create-connector';

function makeProperty(name: string, errors: string[]): ConnectorProperty {
  return {
    definition: {
      name,
      type: DataType.String as ConnectorProperty['definition']['type'],
      required: false,
      default_value: null,
      importance: PropertyImportance.High,
      documentation: '',
      width: PropertyWidth.Medium,
      display_name: name,
      dependents: [],
      order: 0,
    },
    value: {
      name,
      value: null,
      recommended_values: [],
      errors,
      visible: true,
    },
    metadata: {},
  };
}

function makeNullValueProperty(name: string): ConnectorProperty {
  return {
    definition: {
      name,
      type: DataType.String as ConnectorProperty['definition']['type'],
      required: false,
      default_value: null,
      importance: PropertyImportance.High,
      documentation: '',
      width: PropertyWidth.Medium,
      display_name: name,
      dependents: [],
      order: 0,
    },
    value: null,
    metadata: {},
  };
}

function makeValidationResult(configs: ConnectorProperty[]): ConnectorValidationResult {
  return {
    name: 'test-connector',
    configs,
    steps: [],
  };
}

describe('getDataSource', () => {
  it('returns only configs that have errors', () => {
    const result = makeValidationResult([
      makeProperty('topic.prefix', ['required field']),
      makeProperty('database.hostname', []),
    ]);

    const rows = getDataSource(result);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('topic.prefix');
  });

  it('does not throw when value is null (Debezium Oracle 3.5.x deprecated properties)', () => {
    const result = makeValidationResult([
      makeProperty('topic.prefix', ['required field']),
      makeNullValueProperty('database.out.server.name'),
    ]);

    expect(() => getDataSource(result)).not.toThrow();
  });

  it('excludes null-value configs from results even when mixing with erroring configs', () => {
    const result = makeValidationResult([
      makeProperty('topic.prefix', ['required field']),
      makeNullValueProperty('database.out.server.name'),
      makeProperty('database.hostname', []),
    ]);

    const rows = getDataSource(result);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('topic.prefix');
  });

  it('returns empty array when all configs have no errors', () => {
    const result = makeValidationResult([
      makeProperty('topic.prefix', []),
      makeProperty('database.hostname', []),
    ]);

    expect(getDataSource(result)).toHaveLength(0);
  });

  it('returns empty array when configs list is empty', () => {
    expect(getDataSource(makeValidationResult([]))).toHaveLength(0);
  });
});
