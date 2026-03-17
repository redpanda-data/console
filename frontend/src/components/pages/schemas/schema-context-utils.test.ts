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

import {
  ALL_CONTEXT_ID,
  buildQualifiedSubjectName,
  contextNameToId,
  DEFAULT_CONTEXT_ID,
  deriveContexts,
  isNamedContext,
  parseSubjectContext,
  pluralize,
} from './schema-context-utils';

describe('parseSubjectContext', () => {
  test('extracts context and display name from prefixed subject', () => {
    const result = parseSubjectContext(':.staging:my-topic');
    expect(result).toEqual({
      context: 'staging',
      displayName: 'my-topic',
      qualifiedName: ':.staging:my-topic',
    });
  });

  test('returns default context for unprefixed subject', () => {
    const result = parseSubjectContext('my-topic');
    expect(result).toEqual({
      context: 'default',
      displayName: 'my-topic',
      qualifiedName: 'my-topic',
    });
  });

  test('handles dots in context name', () => {
    const result = parseSubjectContext(':.deep.ctx:subject');
    expect(result).toEqual({
      context: 'deep.ctx',
      displayName: 'subject',
      qualifiedName: ':.deep.ctx:subject',
    });
  });

  test('empty context after dot does not match prefix pattern', () => {
    const result = parseSubjectContext(':.:subject');
    expect(result).toEqual({
      context: 'default',
      displayName: ':.:subject',
      qualifiedName: ':.:subject',
    });
  });
});

describe('deriveContexts', () => {
  test('empty inputs returns single All entry', () => {
    const result = deriveContexts([], []);
    expect(result).toEqual([
      {
        id: ALL_CONTEXT_ID,
        label: 'All',
        subjectCount: 0,
        mode: '',
        compatibility: '',
      },
    ]);
  });

  test('default context only produces Default + All', () => {
    const result = deriveContexts(
      [{ name: '.', mode: 'READWRITE', compatibility: 'BACKWARD' }],
      [
        { name: 'topic-a', isSoftDeleted: false },
        { name: 'topic-b', isSoftDeleted: false },
      ]
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: DEFAULT_CONTEXT_ID,
      label: 'Default',
      subjectCount: 2,
      mode: 'READWRITE',
      compatibility: 'BACKWARD',
    });
    expect(result[1]).toEqual({
      id: ALL_CONTEXT_ID,
      label: 'All',
      subjectCount: 2,
      mode: 'READWRITE',
      compatibility: 'BACKWARD',
    });
  });

  test('mixed contexts are ordered: Default, named (alpha-sorted), All', () => {
    const result = deriveContexts(
      [
        { name: '.staging', mode: 'READWRITE', compatibility: 'FULL' },
        { name: '.', mode: 'READWRITE', compatibility: 'BACKWARD' },
        { name: '.dev', mode: 'READONLY', compatibility: 'NONE' },
      ],
      [
        { name: 'topic-a', isSoftDeleted: false },
        { name: ':.staging:topic-b', isSoftDeleted: false },
        { name: ':.dev:topic-c', isSoftDeleted: false },
      ]
    );

    expect(result.map((c) => c.id)).toEqual([DEFAULT_CONTEXT_ID, '.dev', '.staging', ALL_CONTEXT_ID]);
  });

  test('soft-deleted subjects excluded from counts', () => {
    const result = deriveContexts(
      [{ name: '.', mode: 'READWRITE', compatibility: 'BACKWARD' }],
      [
        { name: 'topic-a', isSoftDeleted: false },
        { name: 'topic-b', isSoftDeleted: true },
      ]
    );

    expect(result[0].subjectCount).toBe(1); // Default
    expect(result[1].subjectCount).toBe(1); // All
  });

  test('named context .staging has correct id and count', () => {
    const result = deriveContexts(
      [
        { name: '.', mode: 'READWRITE', compatibility: 'BACKWARD' },
        { name: '.staging', mode: 'READWRITE', compatibility: 'FULL' },
      ],
      [
        { name: ':.staging:topic-a', isSoftDeleted: false },
        { name: ':.staging:topic-b', isSoftDeleted: false },
        { name: 'default-topic', isSoftDeleted: false },
      ]
    );

    const staging = result.find((c) => c.id === '.staging');
    expect(staging).toBeDefined();
    expect(staging!.subjectCount).toBe(2);
    expect(staging!.label).toBe('.staging');
  });

  test('missing default in API response: All falls back to empty mode/compat', () => {
    const result = deriveContexts(
      [{ name: '.staging', mode: 'READWRITE', compatibility: 'FULL' }],
      [{ name: ':.staging:topic-a', isSoftDeleted: false }]
    );

    const all = result.find((c) => c.id === ALL_CONTEXT_ID)!;
    expect(all.mode).toBe('');
    expect(all.compatibility).toBe('');
  });
});

describe('isNamedContext', () => {
  test('__all__ is not a named context', () => {
    expect(isNamedContext(ALL_CONTEXT_ID)).toBe(false);
  });

  test('__default__ is not a named context', () => {
    expect(isNamedContext(DEFAULT_CONTEXT_ID)).toBe(false);
  });

  test('.staging is a named context', () => {
    expect(isNamedContext('.staging')).toBe(true);
  });

  test('empty string is a named context', () => {
    expect(isNamedContext('')).toBe(true);
  });
});

describe('buildQualifiedSubjectName', () => {
  test('returns plain subject name for default context', () => {
    expect(buildQualifiedSubjectName(DEFAULT_CONTEXT_ID, 'my-topic')).toBe('my-topic');
  });

  test('returns qualified name for named context', () => {
    expect(buildQualifiedSubjectName('.staging', 'my-topic')).toBe(':.staging:my-topic');
  });

  test('returns empty string when subject is empty', () => {
    expect(buildQualifiedSubjectName('.staging', '')).toBe('');
  });

  test('returns empty string for default context with empty subject', () => {
    expect(buildQualifiedSubjectName(DEFAULT_CONTEXT_ID, '')).toBe('');
  });

  test('returns plain name for ALL_CONTEXT_ID', () => {
    expect(buildQualifiedSubjectName(ALL_CONTEXT_ID, 'my-topic')).toBe('my-topic');
  });
});

describe('contextNameToId', () => {
  test('maps "default" to DEFAULT_CONTEXT_ID', () => {
    expect(contextNameToId('default')).toBe(DEFAULT_CONTEXT_ID);
  });

  test('passes through dot-prefixed names unchanged', () => {
    expect(contextNameToId('.staging')).toBe('.staging');
  });

  test('prepends dot to bare context names', () => {
    expect(contextNameToId('prod')).toBe('.prod');
  });
});

describe('pluralize', () => {
  test('singular for count 1', () => {
    expect(pluralize(1, 'subject')).toBe('1 subject');
  });

  test('plural for count 0', () => {
    expect(pluralize(0, 'subject')).toBe('0 subjects');
  });

  test('plural for count > 1', () => {
    expect(pluralize(3, 'subject')).toBe('3 subjects');
  });
});
