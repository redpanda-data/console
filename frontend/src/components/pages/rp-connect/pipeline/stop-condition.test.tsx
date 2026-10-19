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

import { describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { render, screen } from 'test-utils';

import {
  draftFromStopForm,
  offersRestart,
  StopConditionEditor,
  StopConditionSection,
  type StopFormState,
  stopFormSchema,
  stopFormState,
  stopRowText,
} from './stop-condition';
import type { InputEndBehavior } from '../utils/input-end-behavior';
import type { StopSlot } from '../utils/pipeline-flow-parser';

const continuous: InputEndBehavior = {
  kind: 'continuous',
  reason: 'Keeps consuming new messages until the pipeline is stopped.',
};
const natural: InputEndBehavior = { kind: 'natural', reason: 'Reads every object in the bucket, then stops.' };
const openSlot: StopSlot = { path: ['input'], ownEnd: continuous };
const CHOOSE_BELOW_RE = /Choose how it should stop below/;

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

describe('StopConditionEditor', () => {
  test('applies a message limit, and won’t apply an invalid one', async () => {
    const user = userEvent.setup();
    const onApply = rs.fn();
    const onClose = rs.fn();
    render(
      <StopConditionEditor effective={continuous} name="redpanda" onApply={onApply} onClose={onClose} slot={openSlot} />
    );

    expect(screen.getByRole('radio', { name: 'Keep running' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'After a number of messages' }));
    const limit = screen.getByRole('textbox', { name: 'Message limit' });
    await user.clear(limit);
    await user.type(limit, '0');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number greater than 0.');
    expect(onApply).not.toHaveBeenCalled();

    await user.clear(limit);
    await user.type(limit, '500{enter}');
    expect(onApply).toHaveBeenCalledWith({ messageLimit: 500 });
    expect(onClose).toHaveBeenCalled();
  });

  test('keeps a multi-line check, and applies on Cmd+Enter', async () => {
    const user = userEvent.setup();
    const onApply = rs.fn();
    const check = 'let n = this.n\n$n > 3';
    render(
      <StopConditionEditor
        effective={{ kind: 'condition', reason: 'Stops when its check is true.' }}
        name="redpanda"
        onApply={onApply}
        onClose={rs.fn()}
        slot={{ ...openSlot, condition: { check } }}
      />
    );
    const field = screen.getByRole('textbox', { name: 'Bloblang condition' });
    expect(field).toHaveValue(check);
    await user.type(field, '{enter}# done', { initialSelectionStart: check.length, initialSelectionEnd: check.length });
    expect(onApply).not.toHaveBeenCalled();
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(onApply).toHaveBeenCalledWith({ check: `${check}\n# done` });
  });

  test('offers restarting only for an input that can finish by itself', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <StopConditionEditor effective={continuous} name="redpanda" onApply={rs.fn()} onClose={rs.fn()} slot={openSlot} />
    );
    await user.click(screen.getByRole('radio', { name: 'When a message matches' }));
    expect(screen.queryByText('Read the input again if it finishes first')).not.toBeInTheDocument();
    unmount();

    render(
      <StopConditionEditor
        effective={natural}
        name="aws_s3"
        onApply={rs.fn()}
        onClose={rs.fn()}
        slot={{ path: ['input'], ownEnd: natural }}
      />
    );
    expect(screen.getByRole('radio', { name: 'When it runs out of data' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'When it goes idle' }));
    expect(screen.queryByText('Read the input again if it finishes first')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'When a message matches' }));
    await user.click(screen.getByRole('checkbox', { name: 'Read the input again if it finishes first' }));
    expect(screen.getByTestId('stop-backstop-hint')).toHaveTextContent('read again and again and never stops');
  });

  test('shows a restart_input the YAML sets with an idle timeout, and warns it never stops', async () => {
    const user = userEvent.setup();
    const onApply = rs.fn();
    render(
      <StopConditionEditor
        effective={continuous}
        name="generate"
        onApply={onApply}
        onClose={rs.fn()}
        slot={{ path: ['input'], condition: { idleTimeout: '30s', restartInput: true }, ownEnd: natural }}
      />
    );
    expect(screen.getByRole('checkbox', { name: 'Read the input again if it finishes first' })).toBeChecked();
    expect(screen.getByTestId('stop-backstop-hint')).toHaveTextContent('never goes idle and never stops');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith({ idleTimeout: '30s', restartInput: true });
  });

  test('warns when a count alone can leave an input that never ends waiting', async () => {
    const user = userEvent.setup();
    render(
      <StopConditionEditor effective={continuous} name="redpanda" onApply={rs.fn()} onClose={rs.fn()} slot={openSlot} />
    );
    await user.click(screen.getByRole('radio', { name: 'After a number of messages' }));
    expect(screen.getByTestId('stop-backstop-hint')).toHaveTextContent(
      'If fewer than 1000 messages arrive, it keeps running. Also stop when idle as a backstop.'
    );
    await user.click(screen.getByRole('checkbox', { name: 'Also stop when idle' }));
    expect(screen.queryByTestId('stop-backstop-hint')).not.toBeInTheDocument();
  });

  test('points at the stop condition only when it is what needs fixing', () => {
    const broken: InputEndBehavior = {
      kind: 'invalid',
      reason: 'Its stop condition needs a check or an idle timeout.',
    };
    const { unmount } = render(
      <StopConditionEditor
        effective={broken}
        name="kafka"
        onApply={rs.fn()}
        onClose={rs.fn()}
        slot={{ path: ['input'], condition: {}, ownEnd: continuous }}
      />
    );
    expect(screen.getByText(CHOOSE_BELOW_RE)).toBeInTheDocument();
    unmount();

    const empty: InputEndBehavior = {
      kind: 'invalid',
      reason: 'It has no inputs yet, and Connect needs at least one.',
    };
    render(
      <StopConditionEditor
        effective={empty}
        isGroup
        name="broker"
        onApply={rs.fn()}
        onClose={rs.fn()}
        slot={{ path: ['input'], ownEnd: empty }}
      />
    );
    expect(screen.getByText('It has no inputs yet, and Connect needs at least one.')).toBeInTheDocument();
    expect(screen.queryByText(CHOOSE_BELOW_RE)).not.toBeInTheDocument();
  });

  test('a wrapper with no input yet is explained, not edited', () => {
    render(
      <StopConditionEditor
        effective={{ kind: 'invalid', reason: 'Its stop condition has no input to read from.' }}
        name="read_until"
        onApply={rs.fn()}
        onClose={rs.fn()}
        slot={{ ...openSlot, locked: 'Its `read_until` has no input to read from yet. Add one in the YAML first.' }}
      />
    );
    expect(screen.getByText('When', { exact: false })).toHaveTextContent('When read_until stops');
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
  });

  test('choosing to keep running clears the condition', async () => {
    const user = userEvent.setup();
    const onApply = rs.fn();
    render(
      <StopConditionEditor
        effective={{ kind: 'condition', reason: 'Stops after 1 minute without new messages.' }}
        name="redpanda"
        onApply={onApply}
        onClose={rs.fn()}
        slot={{ path: ['input'], condition: { idleTimeout: '1m' }, ownEnd: continuous }}
      />
    );
    expect(screen.getByText('Stops after 1 minute without new messages.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Keep running' }));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith(null);
  });
});

describe('StopConditionSection', () => {
  test('shows the current end with a Set action, and config keys as code', () => {
    render(
      <StopConditionSection
        effective={continuous}
        name="generate"
        onApply={rs.fn()}
        slot={{ path: ['input'], ownEnd: { ...continuous, finiteHint: 'Set `count` to stop after a fixed number.' } }}
      />
    );
    expect(screen.getByRole('button', { name: 'Set the stop condition for generate' })).toHaveTextContent('Set');
    expect(screen.getByText('count').tagName).toBe('CODE');
  });

  test('has no action when read-only', () => {
    render(<StopConditionSection effective={natural} name="aws_s3" slot={{ path: ['input'], ownEnd: natural }} />);
    expect(screen.getByTestId('stop-condition-section')).toHaveTextContent(
      'Reads every object in the bucket, then stops.'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('summaries', () => {
  test('a broker row counts the members that keep it running', () => {
    const members = { total: 3, continuous: 1, unknown: 0, invalid: 0 };
    const group = { isGroup: true };
    expect(stopRowText('broker', openSlot, { ...continuous, members }, group)).toEqual({
      eyebrow: 'Continuous',
      text: '1 of 3 inputs never stops',
    });
    expect(stopRowText('broker', openSlot, { ...continuous, members: { ...members, continuous: 3 } }, group).text).toBe(
      'none of its 3 inputs stop'
    );
    expect(stopRowText('sequence', openSlot, { ...natural, members }, group).text).toBe('after its last input stops');
    const stopped = { kind: 'condition' as const, reason: 'Stops after 5 seconds without new messages.' };
    expect(
      stopRowText('broker', { path: ['input'], condition: { idleTimeout: '5s' }, ownEnd: natural }, stopped, group)
    ).toEqual({ eyebrow: 'Stops', text: 'after 5 seconds without new messages' });
  });

  test('an input card’s row is short enough for the card, and invites a condition when it can take one', () => {
    const stopped = { kind: 'condition' as const, reason: '' };
    const limited: StopSlot = {
      path: ['input'],
      condition: { check: 'counter() >= 1000', idleTimeout: '1m' },
      ownEnd: continuous,
    };
    expect(stopRowText('kafka', limited, stopped)).toEqual({ eyebrow: 'Stops', text: 'after 1K msgs or 1m idle' });
    expect(stopRowText('aws_s3', { path: ['input'], ownEnd: natural }, natural).text).toBe('when its data runs out');
    expect(stopRowText('kafka', openSlot, continuous, { editable: true }).text).toBe('set a stop condition');
    expect(stopRowText('kafka', openSlot, continuous).text).toBe('no stop condition');
    const zero: StopSlot = { path: ['input'], condition: { idleTimeout: '0s' }, ownEnd: continuous };
    expect(stopRowText('kafka', zero, continuous).text).toBe('condition never fires');
    const empty: StopSlot = { path: ['input'], condition: {}, ownEnd: continuous };
    expect(stopRowText('kafka', empty, { kind: 'invalid', reason: 'x' })).toEqual({
      eyebrow: 'Fix stop',
      text: 'condition incomplete',
    });
    expect(stopRowText('plugin', openSlot, { kind: 'unknown', reason: 'x' }).text).toBe('may not stop on its own');
  });
});
