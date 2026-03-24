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

import { describe, expect, it } from 'vitest';

import { getConnectorDocsUrl } from './pipeline-flow-nodes';

describe('getConnectorDocsUrl', () => {
  it('builds correct URL for input connectors', () => {
    expect(getConnectorDocsUrl('input', 'aws_cloudwatch_logs')).toBe(
      'https://docs.redpanda.com/redpanda-cloud/develop/connect/components/inputs/aws_cloudwatch_logs/'
    );
  });

  it('builds correct URL for output connectors', () => {
    expect(getConnectorDocsUrl('output', 'redpanda')).toBe(
      'https://docs.redpanda.com/redpanda-cloud/develop/connect/components/outputs/redpanda/'
    );
  });

  it('builds correct URL for processor connectors', () => {
    expect(getConnectorDocsUrl('processor', 'mapping')).toBe(
      'https://docs.redpanda.com/redpanda-cloud/develop/connect/components/processors/mapping/'
    );
  });

  it('returns undefined for resource section', () => {
    expect(getConnectorDocsUrl('resource', 'memory')).toBeUndefined();
  });

  it('returns undefined for unknown section', () => {
    expect(getConnectorDocsUrl('unknown', 'foo')).toBeUndefined();
  });

  it('returns undefined for empty section', () => {
    expect(getConnectorDocsUrl('', 'kafka')).toBeUndefined();
  });
});
