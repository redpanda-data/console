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

import { LintHintSchema } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { describe, expect, it } from 'vitest';

import { alternateRunIntent, isInvalidConfigError, saveRunHint, saveSuccessMessage } from './save-actions';

/**
 * A ConnectError as it arrives off the wire: details are decoded into `{ type, value, debug }`
 * rather than the `{ desc, value }` pairs a locally-constructed error carries.
 */
function wireError(message: string, code: Code, details: Array<{ type: string; debug?: unknown }>): ConnectError {
  const error = new ConnectError(message, code);
  Object.defineProperty(error, 'details', {
    value: details.map((d) => ({ ...d, value: new Uint8Array() })),
  });
  return error;
}

describe('isInvalidConfigError', () => {
  it('recognises a rejection carrying lint hints', () => {
    const error = new ConnectError('invalid pipeline configuration', Code.InvalidArgument, undefined, [
      {
        desc: LintHintSchema,
        value: create(LintHintSchema, { line: 3, column: 1, hint: 'an explicit output type must be specified' }),
      },
    ]);
    expect(isInvalidConfigError(error)).toBe(true);
  });

  it('recognises wire-decoded lint hints', () => {
    const error = wireError('invalid pipeline configuration', Code.InvalidArgument, [
      { type: 'redpanda.api.common.v1.LintHint', debug: { hint: 'an explicit output type must be specified' } },
    ]);
    expect(isInvalidConfigError(error)).toBe(true);
  });

  it('recognises the dataplane reason even without hints', () => {
    const error = wireError('invalid pipeline configuration', Code.InvalidArgument, [
      {
        type: 'google.rpc.ErrorInfo',
        debug: { reason: 'REASON_CONNECT_INVALID_PIPELINE_CONFIGURATION', domain: 'redpanda.com/dataplane' },
      },
    ]);
    expect(isInvalidConfigError(error)).toBe(true);
  });

  it('leaves a different invalid_argument alone, so it surfaces as an error to fix now', () => {
    const error = wireError('name is too short', Code.InvalidArgument, [
      { type: 'google.rpc.ErrorInfo', debug: { reason: 'REASON_INVALID_INPUT', domain: 'redpanda.com/dataplane' } },
    ]);
    expect(isInvalidConfigError(error)).toBe(false);
  });

  it('ignores non-validation failures', () => {
    expect(isInvalidConfigError(new ConnectError('already exists', Code.AlreadyExists))).toBe(false);
    expect(isInvalidConfigError(new ConnectError('boom', Code.Internal))).toBe(false);
    expect(isInvalidConfigError(new Error('network down'))).toBe(false);
    expect(isInvalidConfigError(undefined)).toBe(false);
  });
});

describe('alternateRunIntent', () => {
  it('offers a start alongside create, since creating leaves the pipeline stopped', () => {
    expect(alternateRunIntent('create', undefined)).toBe('start');
  });

  it('offers a stop when editing a live pipeline', () => {
    expect(alternateRunIntent('edit', Pipeline_State.RUNNING)).toBe('stopped');
    expect(alternateRunIntent('edit', Pipeline_State.STARTING)).toBe('stopped');
  });

  it('offers a start when editing an idle pipeline', () => {
    expect(alternateRunIntent('edit', Pipeline_State.STOPPED)).toBe('start');
    expect(alternateRunIntent('edit', Pipeline_State.ERROR)).toBe('start');
    expect(alternateRunIntent('edit', Pipeline_State.COMPLETED)).toBe('start');
  });

  it('offers nothing while the state is unknown', () => {
    expect(alternateRunIntent('edit', undefined)).toBeNull();
    expect(alternateRunIntent('edit', Pipeline_State.UNSPECIFIED)).toBeNull();
  });
});

describe('saveRunHint', () => {
  it('says a new pipeline will not start itself', () => {
    expect(saveRunHint('create', undefined)).toMatch(/without starting/i);
  });

  it('warns that saving a running pipeline restarts it', () => {
    expect(saveRunHint('edit', Pipeline_State.RUNNING)).toMatch(/restarts/i);
  });

  it("says a stopped pipeline won't be started by a save", () => {
    expect(saveRunHint('edit', Pipeline_State.STOPPED)).toMatch(/won't start it/i);
  });

  it('stays quiet while the state is unknown', () => {
    expect(saveRunHint('edit', undefined)).toBeNull();
  });
});

describe('saveSuccessMessage', () => {
  it('spells out that a created pipeline is not running', () => {
    expect(saveSuccessMessage('create', 'stopped', false)).toMatch(/not running/i);
    expect(saveSuccessMessage('create', 'start', false)).toMatch(/starting/i);
  });

  it('mentions the restart only when the pipeline was actually running', () => {
    expect(saveSuccessMessage('edit', 'keep', true)).toMatch(/restarting/i);
    expect(saveSuccessMessage('edit', 'keep', false)).toBe('Pipeline updated');
  });
});
