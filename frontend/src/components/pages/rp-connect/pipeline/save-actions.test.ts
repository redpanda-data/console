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

import {
  alternateRunIntents,
  isBlankConfig,
  isInvalidConfigError,
  isNoLongerDraftError,
  primaryRunIntent,
  runIntentLabel,
  type SaveContext,
  saveRunHint,
  saveSuccessMessage,
  unsavedChangesCopy,
} from './save-actions';

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

/** Contexts the save control has to cover, named the way the UI talks about them. */
const creating: SaveContext = { mode: 'create', draftsEnabled: true };
const creatingWithoutDrafts: SaveContext = { mode: 'create', draftsEnabled: false };
const draft: SaveContext = { mode: 'edit', state: Pipeline_State.DRAFT, draftsEnabled: true };
const running: SaveContext = { mode: 'edit', state: Pipeline_State.RUNNING, draftsEnabled: true };
const stopped: SaveContext = { mode: 'edit', state: Pipeline_State.STOPPED, draftsEnabled: true };
const unknownState: SaveContext = { mode: 'edit', state: undefined, draftsEnabled: true };

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

describe('isNoLongerDraftError', () => {
  it('recognises the refusal that stops a draft save deploying to a running pipeline', () => {
    expect(isNoLongerDraftError(new ConnectError('pipeline is not a draft', Code.FailedPrecondition))).toBe(true);
  });

  it('leaves everything else alone', () => {
    expect(isNoLongerDraftError(new ConnectError('nope', Code.PermissionDenied))).toBe(false);
    // A suspended cluster refuses writes with the same code.
    expect(
      isNoLongerDraftError(new ConnectError('create/edit/start operations are suspended', Code.FailedPrecondition))
    ).toBe(false);
    expect(isNoLongerDraftError(new Error('network down'))).toBe(false);
  });
});

describe('primaryRunIntent', () => {
  // The whole point of the default: the primary click always succeeds and never starts anything.
  it('parks work that has never been deployed', () => {
    expect(primaryRunIntent(creating)).toBe('draft');
    expect(primaryRunIntent(draft)).toBe('draft');
  });

  it('falls back to deploy-then-stop when the deployment has no drafts', () => {
    expect(primaryRunIntent(creatingWithoutDrafts)).toBe('stopped');
  });

  it('leaves a deployed pipeline in whatever state it was in', () => {
    expect(primaryRunIntent(running)).toBe('keep');
    expect(primaryRunIntent(stopped)).toBe('keep');
  });
});

describe('alternateRunIntents', () => {
  it('offers a start for anything not deployed yet', () => {
    expect(alternateRunIntents(creating)).toEqual(['start']);
    expect(alternateRunIntents(draft)).toEqual(['start']);
  });

  it('offers a stop when editing a live pipeline', () => {
    expect(alternateRunIntents(running)).toEqual(['stopped']);
    expect(alternateRunIntents({ ...running, state: Pipeline_State.STARTING })).toEqual(['stopped']);
  });

  it('offers a start when editing an idle pipeline', () => {
    expect(alternateRunIntents(stopped)).toEqual(['start']);
    expect(alternateRunIntents({ ...stopped, state: Pipeline_State.ERROR })).toEqual(['start']);
    expect(alternateRunIntents({ ...stopped, state: Pipeline_State.COMPLETED })).toEqual(['start']);
  });

  it('offers nothing while the state is unknown', () => {
    expect(alternateRunIntents(unknownState)).toEqual([]);
    expect(alternateRunIntents({ ...unknownState, state: Pipeline_State.UNSPECIFIED })).toEqual([]);
  });
});

describe('runIntentLabel', () => {
  it('names the draft save the same everywhere', () => {
    expect(runIntentLabel('draft', creating)).toBe('Save draft');
    expect(runIntentLabel('draft', draft)).toBe('Save draft');
  });

  // Saving a running pipeline restarts it, and there is no apply-later to make that untrue.
  it('says out loud that applying to a running pipeline restarts it', () => {
    expect(runIntentLabel('keep', running)).toBe('Apply and restart');
    expect(runIntentLabel('keep', stopped)).toBe('Save');
  });

  it('does not promise a stop that creating never performs', () => {
    expect(runIntentLabel('stopped', creatingWithoutDrafts)).toBe('Save');
    expect(runIntentLabel('stopped', running)).toBe('Save and stop');
  });
});

describe('saveRunHint', () => {
  it('describes what saving will do rather than claiming it already happened', () => {
    const hint = saveRunHint(creating);
    expect(hint).toMatch(/won't start/i);
    // Past tense ("Saved without starting") sits under the button asserting success even when the
    // save has just failed, which is what it used to do.
    expect(hint).not.toMatch(/^saved\b/i);
  });

  it('says a draft save keeps it a draft', () => {
    expect(saveRunHint(draft)).toMatch(/keeps it a draft/i);
  });

  it('warns that saving a running pipeline restarts it', () => {
    expect(saveRunHint(running)).toMatch(/restarts/i);
  });

  it("says a stopped pipeline won't be started by a save", () => {
    expect(saveRunHint(stopped)).toMatch(/won't start it/i);
  });

  it('stays quiet while the state is unknown', () => {
    expect(saveRunHint(unknownState)).toBeNull();
  });
});

describe('isBlankConfig', () => {
  it('treats an empty or whitespace-only config as blank', () => {
    expect(isBlankConfig('')).toBe(true);
    expect(isBlankConfig('  \n\t\n ')).toBe(true);
  });

  it('leaves a comments-only config to the server, which answers it with lint hints', () => {
    expect(isBlankConfig('# nothing here yet\n')).toBe(false);
    expect(isBlankConfig('input:\n  generate: {}\n')).toBe(false);
  });
});

describe('saveSuccessMessage', () => {
  it('spells out that a draft is not running', () => {
    expect(saveSuccessMessage(creating, 'draft')).toMatch(/isn't running/i);
    expect(saveSuccessMessage(draft, 'draft')).toBe('Draft saved');
  });

  it('spells out that a created-and-stopped pipeline is not running', () => {
    expect(saveSuccessMessage(creatingWithoutDrafts, 'stopped')).toMatch(/not running/i);
    expect(saveSuccessMessage(creating, 'start')).toMatch(/starting/i);
  });

  it('mentions the restart only when the pipeline was actually running', () => {
    expect(saveSuccessMessage(running, 'keep')).toMatch(/restarting/i);
    expect(saveSuccessMessage(stopped, 'keep')).toBe('Pipeline updated');
  });
});

describe('unsavedChangesCopy', () => {
  it('parks unfinished work as a draft where one is possible', () => {
    expect(unsavedChangesCopy(creating).escape).toBe('save-draft');
    expect(unsavedChangesCopy(draft).escape).toBe('save-draft');
  });

  // Saving would restart it, so "save and leave" is not a kindness here — but neither is a dialog whose
  // only ways out are losing the work or never leaving the page.
  it('offers the browser instead of a draft once a pipeline is deployed', () => {
    for (const context of [running, stopped, creatingWithoutDrafts]) {
      expect(unsavedChangesCopy(context).escape).toBe('leave-for-now');
    }
  });

  it('says why a running pipeline cannot simply be saved', () => {
    expect(unsavedChangesCopy(running).body).toMatch(/restarts this pipeline/i);
  });

  // The promise belongs to the button that keeps them: Discard clears the buffer.
  it('promises the browser keeps the edits only where leaving keeps them', () => {
    for (const context of [running, stopped, creatingWithoutDrafts]) {
      expect(unsavedChangesCopy(context).body).toMatch(/this browser keeps/i);
    }
    expect(unsavedChangesCopy(creating).body).not.toMatch(/this browser keeps/i);
  });

  // Saving a stopped pipeline is not destructive, so the copy must not borrow the running one's warning.
  it('does not warn about restarts on a stopped pipeline', () => {
    expect(unsavedChangesCopy(stopped).body).not.toMatch(/restart/i);
  });
});
