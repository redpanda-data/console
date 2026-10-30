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

import { StopConditionEditor, StopConditionSection } from './stop-condition';
import type { InputEndBehavior } from '../utils/input-end-behavior';
import type { StopSlot } from '../utils/pipeline-flow-parser';

const continuous: InputEndBehavior = {
  kind: 'continuous',
  reason: 'Keeps consuming new messages until the pipeline is stopped.',
};
const natural: InputEndBehavior = { kind: 'natural', reason: 'Reads every object in the bucket, then stops.' };
const openSlot: StopSlot = { path: ['input'], ownEnd: continuous };
const CHOOSE_BELOW_RE = /Choose how it should stop below/;

// The editor for a `redpanda` input with no stop condition.
function renderOpenEditor() {
  const user = userEvent.setup();
  const onApply = rs.fn(() => true);
  const onClose = rs.fn();
  const { unmount } = render(
    <StopConditionEditor effective={continuous} name="redpanda" onApply={onApply} onClose={onClose} slot={openSlot} />
  );
  return { user, onApply, onClose, unmount };
}

async function replaceLimit(user: ReturnType<typeof userEvent.setup>, text: string) {
  const limit = screen.getByRole('textbox', { name: 'Message limit' });
  await user.clear(limit);
  await user.type(limit, text);
}

async function expectNoRestartWith(user: ReturnType<typeof userEvent.setup>, mode: string) {
  await user.click(screen.getByRole('radio', { name: mode }));
  expect(screen.queryByText('Read the input again if it finishes first')).not.toBeInTheDocument();
}

describe('the StopConditionEditor', () => {
  test('applies a message limit, and won’t apply an invalid one', async () => {
    const { user, onApply, onClose } = renderOpenEditor();

    expect(screen.getByRole('radio', { name: 'Keep running' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'After a number of messages' }));
    await replaceLimit(user, '0');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number greater than 0.');
    expect(onApply).not.toHaveBeenCalled();

    await replaceLimit(user, '500{enter}');
    expect(onApply).toHaveBeenCalledWith({ messageLimit: 500 });
    expect(onClose).toHaveBeenCalled();
  });

  test('keeps a multi-line check, and applies on Cmd+Enter', async () => {
    const user = userEvent.setup();
    const onApply = rs.fn(() => true);
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
    const { user, unmount } = renderOpenEditor();
    await expectNoRestartWith(user, 'When a message matches');
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
    await expectNoRestartWith(user, 'When it goes idle');
    await user.click(screen.getByRole('radio', { name: 'When a message matches' }));
    await user.click(screen.getByRole('checkbox', { name: 'Read the input again if it finishes first' }));
    expect(screen.getByTestId('stop-backstop-hint')).toHaveTextContent('read again and again and never stops');
  });

  test('shows a restart_input the YAML sets with an idle timeout, and warns it never stops', async () => {
    const user = userEvent.setup();
    const onApply = rs.fn(() => true);
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

  test('arrow keys in a field move its caret, not the chosen mode', async () => {
    const user = userEvent.setup();
    render(
      <StopConditionEditor effective={continuous} name="redpanda" onApply={rs.fn()} onClose={rs.fn()} slot={openSlot} />
    );
    await user.click(screen.getByRole('radio', { name: 'After a number of messages' }));
    const limit = screen.getByRole('textbox', { name: 'Message limit' });
    await user.click(limit);
    // Past the end, as the radio group would otherwise take it.
    await user.keyboard('{End}{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'After a number of messages' })).toBeChecked();
    expect(limit).toHaveFocus();
  });

  test('a locked input says when it stops, then why it can’t be edited here', () => {
    render(
      <StopConditionEditor
        effective={{ kind: 'condition', reason: 'Stops after 30 seconds without new messages.' }}
        name="kafka_franz"
        onClose={rs.fn()}
        slot={{
          ...openSlot,
          condition: { idleTimeout: '30s' },
          locked: 'Its `restart_input` is set from an env var. Change its stop condition in the YAML.',
        }}
      />
    );
    expect(screen.getByText('When', { exact: false })).toHaveTextContent('When kafka_franz stops');
    expect(screen.getByText('Stops after 30 seconds without new messages.', { exact: false })).toHaveTextContent(
      'Stops after 30 seconds without new messages. Its restart_input is set from an env var.'
    );
  });

  test('choosing to keep running clears the condition', async () => {
    const user = userEvent.setup();
    const onApply = rs.fn(() => true);
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

describe('the StopConditionEditor when it can’t make the edit', () => {
  test('stays open with its choices when the YAML edit is refused', async () => {
    const { user, onApply, onClose } = renderOpenEditor();
    onApply.mockReturnValue(false);
    await user.click(screen.getByRole('radio', { name: 'After a number of messages' }));
    await replaceLimit(user, '500{enter}');
    expect(onApply).toHaveBeenCalledWith({ messageLimit: 500 });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Message limit' })).toHaveValue('500');
  });

  test('a locked input that Connect refuses says why, then why it can’t be edited here', () => {
    render(
      <StopConditionEditor
        effective={{ kind: 'invalid', reason: 'Connect refuses snapshot_only with more than one table.' }}
        name="aws_dynamodb_cdc"
        onClose={rs.fn()}
        slot={{
          ...openSlot,
          locked: 'This input comes from a YAML alias or merge key. Change its stop condition in the YAML.',
        }}
      />
    );
    expect(screen.getByText('Connect refuses snapshot_only', { exact: false })).toHaveTextContent(
      'Connect refuses snapshot_only with more than one table. This input comes from a YAML alias or merge key.'
    );
  });
});

describe('the StopConditionSection', () => {
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
