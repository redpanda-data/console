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

import { draftFromStopForm, offersRestart, type StopFormState, stopFormSchema, stopFormState } from './stop-form';
import { describe, expect, test } from 'bun:test';
import type { InputEndBehavior } from '../utils/input-end-behavior';

const continuous: InputEndBehavior = {
  kind: 'continuous',
  reason: 'Keeps consuming new messages until the pipeline is stopped.',
};
const natural: InputEndBehavior = { kind: 'natural', reason: 'Reads every object in the bucket, then stops.' };

// The fields the schema reports a problem on.
const problemsIn = (state: StopFormState) => {
  const result = stopFormSchema.safeParse(state);
  return result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
};

describe('stop form model', () => {
  test('starts from the slot’s current condition', () => {
    expect(stopFormState(undefined).mode).toBe('none');
    expect(stopFormState({ check: 'counter() >= 50', idleTimeout: '5m' })).toMatchObject({
      mode: 'count',
      limit: '50',
      alsoIdle: true,
      idle: '5m',
    });
    expect(stopFormState({ check: 'this.done' })).toMatchObject({ mode: 'check', check: 'this.done', alsoIdle: false });
    expect(stopFormState({ idleTimeout: '10s' })).toMatchObject({ mode: 'idle', idle: '10s' });
  });

  test('validates only what the chosen mode uses', () => {
    const base = stopFormState(undefined);
    expect(problemsIn({ ...base, mode: 'count', limit: '0' })).toEqual(['limit']);
    expect(problemsIn({ ...base, mode: 'count', limit: '1.5' })).toEqual(['limit']);
    expect(problemsIn({ ...base, mode: 'count', limit: '10' })).toEqual([]);
    expect(problemsIn({ ...base, mode: 'check', check: '  ' })).toEqual(['check']);
    expect(problemsIn({ ...base, mode: 'idle', idle: 'later' })).toEqual(['idle']);
    // An idle value that isn't used doesn't block.
    expect(problemsIn({ ...base, mode: 'count', limit: '10', idle: 'later' })).toEqual([]);
    expect(problemsIn({ ...base, mode: 'count', limit: '10', idle: 'later', alsoIdle: true })).toEqual(['idle']);
  });

  test('turns the choice into a draft', () => {
    const base = stopFormState(undefined);
    expect(draftFromStopForm(base)).toBeNull();
    expect(draftFromStopForm({ ...base, mode: 'count', limit: ' 25 ' })).toEqual({ messageLimit: 25 });
    expect(
      draftFromStopForm({ ...base, mode: 'check', check: 'this.x', alsoIdle: true, idle: '1m', restart: true })
    ).toEqual({
      check: 'this.x',
      idleTimeout: '1m',
      restartInput: true,
    });
    // Restart goes into the draft only while the form offers it.
    expect(draftFromStopForm({ ...base, mode: 'idle', idle: '2m', restart: true }, false)).toEqual({
      idleTimeout: '2m',
    });
    expect(draftFromStopForm({ ...base, mode: 'check', check: 'this.x', restart: true }, false)).toEqual({
      check: 'this.x',
    });
  });

  test('offers restart_input with a count or check for an input that can finish, or whenever the YAML sets it', () => {
    // A re-read input never goes idle, so an idle timeout alone doesn't offer it.
    expect(offersRestart('idle', natural)).toBe(false);
    expect(offersRestart('check', natural)).toBe(true);
    expect(offersRestart('count', continuous)).toBe(false);
    const set = { idleTimeout: '30s', restartInput: true };
    expect(offersRestart('idle', natural, set)).toBe(true);
    // So applying the form as loaded writes back what the YAML has.
    const state = stopFormState(set);
    expect(draftFromStopForm(state, offersRestart(state.mode, natural, set))).toEqual(set);
  });
});
