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

import { describe, expect, it } from '@rstest/core';

import { getConnectorDocsUrl, getFieldDocsUrl, getNodeDocsUrl } from './connector-docs';

const DOCS = 'https://docs.redpanda.com/cloud-data-platform/develop/connect/components';

describe('getConnectorDocsUrl', () => {
  it('builds correct URL for input connectors', () => {
    expect(getConnectorDocsUrl('input', 'aws_cloudwatch_logs')).toBe(
      'https://docs.redpanda.com/cloud-data-platform/develop/connect/components/inputs/aws_cloudwatch_logs/'
    );
  });

  it('builds correct URL for output connectors', () => {
    expect(getConnectorDocsUrl('output', 'redpanda')).toBe(
      'https://docs.redpanda.com/cloud-data-platform/develop/connect/components/outputs/redpanda/'
    );
  });

  it('builds correct URL for processor connectors', () => {
    expect(getConnectorDocsUrl('processor', 'mapping')).toBe(
      'https://docs.redpanda.com/cloud-data-platform/develop/connect/components/processors/mapping/'
    );
  });

  it('builds correct URL for cache resources', () => {
    expect(getConnectorDocsUrl('cache', 'memory')).toBe(
      'https://docs.redpanda.com/cloud-data-platform/develop/connect/components/caches/memory/'
    );
  });

  it('builds correct URL for rate limit resources', () => {
    expect(getConnectorDocsUrl('rate_limit', 'local')).toBe(
      'https://docs.redpanda.com/cloud-data-platform/develop/connect/components/rate_limits/local/'
    );
  });

  it('returns undefined for sections whose docs path is not the naive plural', () => {
    expect(getConnectorDocsUrl('metrics', 'prometheus')).toBeUndefined();
    expect(getConnectorDocsUrl('tracer', 'jaeger')).toBeUndefined();
  });

  it('returns undefined for unknown section', () => {
    expect(getConnectorDocsUrl('unknown', 'foo')).toBeUndefined();
  });

  it('returns undefined for empty section', () => {
    expect(getConnectorDocsUrl('', 'kafka')).toBeUndefined();
  });
});

describe('getFieldDocsUrl', () => {
  const REDPANDA_INPUT = `${DOCS}/inputs/redpanda/`;

  it.each([
    ['a top-level field by its name', ['consumer_group'], `${REDPANDA_INPUT}#consumer_group`],
    // Documented as `sasl[].aws.credentials.role`, anchored `#sasl-aws-credentials-role`.
    [
      'a nested path with hyphens, list nesting dropped',
      ['sasl', 'aws', 'credentials', 'role'],
      `${REDPANDA_INPUT}#sasl-aws-credentials-role`,
    ],
    ['the component page when there is no field path', [], REDPANDA_INPUT],
  ])('anchors %s', (_case, path, expected) => {
    expect(getFieldDocsUrl('input', 'redpanda', path)).toBe(expected);
  });

  it('returns undefined when the component itself has no docs page', () => {
    expect(getFieldDocsUrl('metrics', 'prometheus', ['use_histogram_timing'])).toBeUndefined();
  });
});

describe('getNodeDocsUrl', () => {
  it('links a component node through its section', () => {
    expect(getNodeDocsUrl({ kind: 'leaf', label: 'kafka_franz', section: 'input' })).toBe(
      'https://docs.redpanda.com/cloud-data-platform/develop/connect/components/inputs/kafka_franz/'
    );
  });

  it('links a container group, which is a component too', () => {
    expect(getNodeDocsUrl({ kind: 'group', label: 'switch', section: 'processor' })).toBe(
      'https://docs.redpanda.com/cloud-data-platform/develop/connect/components/processors/switch/'
    );
  });

  it('links a resource node through the *_resources key it was defined under', () => {
    expect(getNodeDocsUrl({ kind: 'leaf', label: 'memory', section: 'resource', resourceKey: 'cache_resources' })).toBe(
      'https://docs.redpanda.com/cloud-data-platform/develop/connect/components/caches/memory/'
    );
    expect(
      getNodeDocsUrl({ kind: 'leaf', label: 'local', section: 'resource', resourceKey: 'rate_limit_resources' })
    ).toBe('https://docs.redpanda.com/cloud-data-platform/develop/connect/components/rate_limits/local/');
  });

  it('returns undefined for structural nodes that name no component', () => {
    expect(getNodeDocsUrl({ kind: 'section', label: 'input', section: 'input' })).toBeUndefined();
    expect(getNodeDocsUrl({ kind: 'group', label: 'case 1', section: 'processor', isCase: true })).toBeUndefined();
    expect(getNodeDocsUrl({ kind: 'leaf', label: 'none', section: 'output' })).toBeUndefined();
  });

  it('returns undefined for resource nodes labelled by their YAML key, not an implementation', () => {
    expect(getNodeDocsUrl({ kind: 'leaf', label: 'buffer', section: 'resource' })).toBeUndefined();
    expect(
      getNodeDocsUrl({ kind: 'leaf', label: 'cache_resources', section: 'resource', resourceKey: 'cache_resources' })
    ).toBeUndefined();
  });
});
