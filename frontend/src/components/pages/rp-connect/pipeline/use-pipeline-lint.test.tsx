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

import { type LintHint, LintHintSchema } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { describe, expect, it } from '@rstest/core';
import { renderHook, waitFor } from '@testing-library/react';
import type { LintPipelineConfigResponseSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { lintPipelineConfig } from 'protogen/redpanda/api/dataplane/v1/pipeline-PipelineService_connectquery';
import { connectQueryWrapper } from 'test-utils';

import { usePipelineLint } from './use-pipeline-lint';

const VALID_YAML = 'input:\n  generate: {}\noutput:\n  drop: {}';
const SYNTAX_ERROR_YAML = 'input: [unclosed';

const hint = (msg: string) => create(LintHintSchema, { line: 3, column: 1, hint: msg, lintType: 'config' });

function renderLint(
  yaml: string,
  options: {
    response?: MessageInitShape<typeof LintPipelineConfigResponseSchema> | ConnectError;
    saveHints?: Record<string, LintHint>;
    enabled?: boolean;
  } = {}
) {
  const requests: string[] = [];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(lintPipelineConfig, ({ configYaml }) => {
      requests.push(configYaml);
      if (options.response instanceof ConnectError) {
        throw options.response;
      }
      return options.response ?? {};
    });
  });
  const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);
  return {
    requests,
    ...renderHook(() => usePipelineLint(yaml, options.saveHints ?? {}, options.enabled ?? true), { wrapper }),
  };
}

const messages = (result: { current: ReturnType<typeof usePipelineLint> }) =>
  Object.values(result.current.lintHints).map((h) => h.hint);

describe('usePipelineLint', () => {
  it('sends the actual YAML to lint and displays the server hint', async () => {
    const { result, requests } = renderLint(VALID_YAML, { response: { lintHints: [hint('missing field')] } });
    await waitFor(() => expect(messages(result)).toEqual(['missing field']));
    expect(requests).toEqual([VALID_YAML]);
  });

  it('supersedes stale save errors with local YAML syntax errors', () => {
    const saveError = create(LintHintSchema, { line: 0, column: 0, hint: 'server syntax error', lintType: 'error' });
    const { result } = renderLint(SYNTAX_ERROR_YAML, { saveHints: { save0: saveError } });
    expect(messages(result).length).toBeGreaterThan(0);
    expect(messages(result)).not.toContain('server syntax error');
  });

  it('keeps local stop-condition hints after the server accepts the YAML', async () => {
    const yaml = 'input:\n  read_until:\n    input:\n      kafka: {}\noutput:\n  drop: {}';
    const { result, requests } = renderLint(yaml, { response: { lintHints: [] } });
    await waitFor(() => expect(result.current.isLintPending).toBe(false));
    expect(requests).toEqual([yaml]);
    expect(messages(result)).toEqual(['read_until needs a check or an idle_timeout to know when to stop.']);
  });

  it('reports an invalid config rejection but not an unavailable lint service', async () => {
    const invalid = renderLint(VALID_YAML, { response: new ConnectError('bad config', Code.InvalidArgument) });
    await waitFor(() => expect(messages(invalid.result).some((message) => message.includes('bad config'))).toBe(true));
    expect(invalid.requests).toEqual([VALID_YAML]);

    const unavailable = renderLint(VALID_YAML, { response: new ConnectError('service down', Code.Unavailable) });
    await waitFor(() => expect(unavailable.result.current.isLintPending).toBe(false));
    expect(unavailable.requests).toEqual([VALID_YAML]);
    expect(messages(unavailable.result)).toEqual([]);
  });

  it('does not lint in view mode, even for invalid YAML', () => {
    const { result, requests } = renderLint(SYNTAX_ERROR_YAML, { enabled: false });
    expect(requests).toEqual([]);
    expect(messages(result)).toEqual([]);
    expect(result.current.isLintPending).toBe(false);
  });

  it('does not send blank YAML for live lint or show a spinner', () => {
    const { result, requests } = renderLint('   \n\t');
    expect(requests).toEqual([]);
    expect(messages(result)).toEqual([]);
    expect(result.current.isLintPending).toBe(false);
  });

  it('still shows an explicit save rejection for blank YAML', () => {
    const { result } = renderLint('', { saveHints: { save0: hint('config_yaml: value is required') } });
    expect(messages(result)).toEqual(['config_yaml: value is required']);
  });
});
