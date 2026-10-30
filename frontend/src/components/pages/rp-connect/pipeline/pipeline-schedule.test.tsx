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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { SCHEDULE_PREVIEW_STORAGE_KEY, useSchedulePreviewStore } from 'state/rpcn-schedule-preview';
import { render, screen, waitFor, within } from 'test-utils';

rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return { ...actual, isFeatureFlagEnabled: (flag: string) => flag === 'enableRpcnPipelineSchedules' };
});

import {
  PipelineScheduleCell,
  PipelineScheduleDialog,
  useClock,
  usePipelineScheduleControl,
} from './pipeline-schedule';
import { defaultSchedule, type PipelineSchedule } from '../utils/pipeline-schedule';

const FINITE = 'input:\n  sql_select:\n    table: orders\noutput:\n  drop: {}\n';
const CHECK_ONLY =
  'input:\n  read_until:\n    check: counter() >= 1000\n    input:\n      redpanda:\n        topics: [orders]\noutput:\n  drop: {}\n';
const BROKEN = 'input: [';
const CONTINUOUS = 'input:\n  redpanda:\n    topics: [orders]\noutput:\n  drop: {}\n';

const PIPELINE_ID = 'p1';
const ACTIVE_PILL = /^Hourly at :15in /;
const NEXT_RUN = /^Next in /;

const storedSchedule = () => Object.values(useSchedulePreviewStore.getState().schedules)[0];

function seed(overrides: Partial<PipelineSchedule>) {
  useSchedulePreviewStore.getState().saveSchedule(PIPELINE_ID, { ...defaultSchedule('UTC'), ...overrides });
}

function renderDialog(configYaml: string) {
  const user = userEvent.setup();
  render(
    <PipelineScheduleDialog
      configYaml={configYaml}
      fixHint={<span>Add one on the canvas.</span>}
      onOpenChange={() => undefined}
      open
      pipelineId={PIPELINE_ID}
    />
  );
  return user;
}

function Control({ configYaml }: { configYaml: string }) {
  const { button } = usePipelineScheduleControl({ pipelineId: PIPELINE_ID, configYaml, fixHint: null });
  return <>{button}</>;
}

function ControlWithDialog() {
  const { button, dialog } = usePipelineScheduleControl({
    pipelineId: PIPELINE_ID,
    configYaml: FINITE,
    fixHint: null,
  });
  return (
    <>
      {button}
      {dialog}
    </>
  );
}

beforeEach(() => {
  window.localStorage.removeItem(SCHEDULE_PREVIEW_STORAGE_KEY);
  useSchedulePreviewStore.setState({ schedules: {} });
});

describe('the PipelineScheduleDialog readiness', () => {
  test('a pipeline that stops on its own folds its inputs away until asked for', async () => {
    const user = renderDialog(FINITE);

    const readiness = screen.getByTestId('schedule-readiness');
    expect(within(readiness).getByText('Each run ends on its own')).toBeInTheDocument();
    // Nothing to fix, so the inputs fold away until asked for.
    expect(readiness).toHaveTextContent('Its input stops by itself.');
    expect(within(readiness).queryByText('sql_select')).not.toBeInTheDocument();
    await user.click(within(readiness).getByRole('button', { name: 'Show inputs' }));
    expect(within(readiness).getByText('sql_select')).toBeInTheDocument();
  });

  test('a pipeline that never stops is refused, naming the input to fix', () => {
    renderDialog(CONTINUOUS);

    const readiness = screen.getByTestId('schedule-readiness');
    expect(within(readiness).getByText('This pipeline never stops on its own')).toBeInTheDocument();
    expect(within(readiness).getByText('redpanda')).toBeInTheDocument();
    expect(within(readiness).getByText('Add one on the canvas.')).toBeInTheDocument();
    const toggle = screen.getByTestId('schedule-enabled');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAttribute('data-disabled');
  });

  test('each input that blocks it says how to fix it', () => {
    renderDialog('input:\n  generate:\n    mapping: root = 1\noutput:\n  drop: {}\n');
    expect(screen.getByTestId('schedule-readiness')).toHaveTextContent(
      'generate — Generates messages until the pipeline is stopped. Set count to stop after a fixed number of messages.'
    );
  });

  test('a broker with a stop condition of its own is listed itself, not its members', async () => {
    const user = renderDialog(
      'input:\n  read_until:\n    idle_timeout: 30s\n    input:\n      broker:\n        inputs:\n          - redpanda: { topics: [a] }\n          - redpanda: { topics: [b] }\noutput:\n  drop: {}\n'
    );
    const readiness = screen.getByTestId('schedule-readiness');
    expect(within(readiness).getByText('Each run ends on its own')).toBeInTheDocument();
    await user.click(within(readiness).getByRole('button', { name: 'Show inputs' }));
    expect(
      within(readiness)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['broker — Stops after 30 seconds without new messages.']);
  });

  test('an input that runs a broker is listed as itself, so it is named when it blocks', () => {
    renderDialog(
      'input:\n  batched:\n    policy: { count: 10, period: 1s }\n    child:\n      broker:\n        inputs:\n          - redpanda: { topics: [a] }\noutput:\n  drop: {}\n'
    );
    const readiness = screen.getByTestId('schedule-readiness');
    expect(within(readiness).getByText('This pipeline never stops on its own')).toBeInTheDocument();
    expect(within(readiness).getByText('batched')).toBeInTheDocument();
  });

  test('a broker whose own batching may not end is named, with its fix', () => {
    renderDialog(
      'input:\n  broker:\n    inputs:\n      - sql_select: { table: orders }\n      - sql_select: { table: refunds }\n    batching: { count: 10 }\noutput:\n  drop: {}\n'
    );
    const items = within(screen.getByTestId('schedule-readiness')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'broker — Its batching has no period, so once its input ends, a last partial batch can wait forever. Set batching.period (such as 1s) so the last batch is sent.',
    ]);
  });

  test('a broken input is named even where its group’s stop condition decides the end', () => {
    renderDialog(
      'input:\n  read_until:\n    idle_timeout: 30s\n    input:\n      broker:\n        inputs:\n          - read_until: { input: { redpanda: { topics: [a] } } }\n          - redpanda: { topics: [b] }\noutput:\n  drop: {}\n'
    );
    const items = within(screen.getByTestId('schedule-readiness')).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('redpanda — Its stop condition needs a check or an idle timeout.');
  });

  test('a YAML that doesn’t parse asks for a fix, not an input', () => {
    renderDialog(BROKEN);
    expect(within(screen.getByTestId('schedule-readiness')).getByText('Fix the YAML first')).toBeInTheDocument();
  });

  test('an input that might wait forever is ready, with a warning', () => {
    renderDialog(CHECK_ONLY);
    const readiness = screen.getByTestId('schedule-readiness');
    expect(within(readiness).getByText('Each run ends on its own')).toBeInTheDocument();
    // redpanda reads in batches, and Connect counts each once.
    expect(readiness).toHaveTextContent('If fewer than 1000 batches arrive, it keeps running.');
  });
});

describe('the PipelineScheduleDialog saving', () => {
  test('a pipeline that stops on its own can be scheduled', async () => {
    const user = renderDialog(FINITE);

    // A new schedule starts switched off.
    const toggle = screen.getByTestId('schedule-enabled');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Next runs' })).getAllByRole('listitem')).toHaveLength(3);

    await user.click(toggle);
    await user.click(screen.getByTestId('schedule-save'));

    expect(storedSchedule()).toMatchObject({ enabled: true, cadence: 'daily', time: '02:00' });
    expect(JSON.parse(window.localStorage.getItem(SCHEDULE_PREVIEW_STORAGE_KEY) ?? '{}')).not.toEqual({});
  });

  test('a schedule left on for a pipeline that no longer stops cannot be saved until paused', async () => {
    seed({ enabled: true });
    const user = renderDialog(CONTINUOUS);

    const save = screen.getByTestId('schedule-save');
    expect(save).toBeDisabled();
    expect(screen.getByText('On hold: no runs until the pipeline stops on its own.')).toBeInTheDocument();
    await user.click(screen.getByTestId('schedule-enabled'));
    expect(save).toBeEnabled();
    expect(save).toHaveTextContent('Save paused');
    await user.click(save);
    expect(storedSchedule()).toMatchObject({ enabled: false });
  });

  test('runs closer than 15 minutes apart are rejected', async () => {
    seed({ enabled: true, cadence: 'custom', every: 30, unit: 'minutes' });
    const user = renderDialog(FINITE);

    const every = screen.getByTestId('schedule-every');
    await user.clear(every);
    await user.type(every, '10');
    await user.click(screen.getByTestId('schedule-save'));

    expect(await screen.findByText('Runs must be at least 15 minutes apart.')).toBeInTheDocument();
    expect(storedSchedule()).toMatchObject({ every: 30 });
  });

  test('fields the cadence hides never block saving, and are stored clean', async () => {
    useSchedulePreviewStore.setState({
      schedules: {
        [`default/${PIPELINE_ID}`]: {
          ...defaultSchedule('UTC'),
          enabled: true,
          every: Number.NaN,
          maxRuntime: Number.NaN,
        },
      },
    });
    const user = renderDialog(FINITE);

    await user.click(screen.getByTestId('schedule-save'));
    expect(storedSchedule()).toMatchObject({ cadence: 'daily', every: 2, maxRuntime: 1 });
  });

  test('a saved schedule can be removed', async () => {
    seed({ enabled: true });
    const user = renderDialog(FINITE);

    await user.click(screen.getByTestId('schedule-remove'));
    expect(storedSchedule()).toBeUndefined();
  });
});

describe('schedule preview store', () => {
  test('with storage unreadable, a save or removal keeps the other schedules this page holds', () => {
    const getItem = rs.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const { saveSchedule, removeSchedule } = useSchedulePreviewStore.getState();
      saveSchedule('pipeline-a', defaultSchedule('UTC'));
      saveSchedule('pipeline-b', defaultSchedule('UTC'));
      expect(Object.keys(useSchedulePreviewStore.getState().schedules)).toHaveLength(2);
      removeSchedule('pipeline-a');
      expect(Object.keys(useSchedulePreviewStore.getState().schedules)).toHaveLength(1);
    } finally {
      getItem.mockRestore();
    }
  });
});

describe('schedule status', () => {
  test('without a schedule, the header offers to add one', () => {
    render(<Control configYaml={FINITE} />);
    expect(screen.getByTestId('pipeline-schedule-button')).toHaveTextContent('Schedule');
    expect(screen.queryByTestId('pipeline-schedule-pill')).not.toBeInTheDocument();
  });

  test('with one, the header’s control is the schedule: its cadence, then its next run', () => {
    seed({ enabled: true, cadence: 'hourly', time: '00:15' });
    render(<Control configYaml={FINITE} />);
    expect(screen.queryByTestId('pipeline-schedule-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('pipeline-schedule-pill')).toHaveTextContent(ACTIVE_PILL);
  });

  test('a schedule for a pipeline that no longer stops is on hold', () => {
    seed({ enabled: true });
    render(<Control configYaml={CONTINUOUS} />);
    const pill = screen.getByTestId('pipeline-schedule-pill');
    expect(pill).toHaveAttribute('data-state', 'on-hold');
    expect(pill).toHaveTextContent('On hold');
  });

  test('saving the first schedule hands focus to the pill that replaces the button', async () => {
    const user = userEvent.setup();
    render(<ControlWithDialog />);
    await user.click(screen.getByTestId('pipeline-schedule-button'));
    await user.click(await screen.findByTestId('schedule-save'));
    await waitFor(() => expect(screen.getByTestId('pipeline-schedule-pill')).toHaveFocus());
  });

  test('a half-typed edit keeps the last answer instead of flashing on hold', () => {
    seed({ enabled: true, cadence: 'hourly', time: '00:15' });
    const { rerender } = render(<Control configYaml={FINITE} />);
    rerender(<Control configYaml={BROKEN} />);
    expect(screen.getByTestId('pipeline-schedule-pill')).toHaveTextContent(ACTIVE_PILL);
  });

  test('the list cell reads paused, on hold or the next run', () => {
    const schedule = { ...defaultSchedule('UTC'), enabled: false };
    const { rerender } = render(<PipelineScheduleCell end={{ status: 'finite' }} schedule={schedule} />);
    expect(screen.getByTestId('pipeline-schedule-line')).toHaveTextContent('Paused');

    const enabled = { ...schedule, enabled: true };
    rerender(<PipelineScheduleCell end={{ status: 'continuous' }} schedule={enabled} />);
    expect(screen.getByTestId('pipeline-schedule-line')).toHaveTextContent('On hold');

    rerender(<PipelineScheduleCell end={{ status: 'finite' }} schedule={enabled} />);
    expect(screen.getByTestId('pipeline-schedule-line')).toHaveTextContent(NEXT_RUN);
  });

  test('the list cell’s second line shows the cadence: its weekdays, or what kind it is', () => {
    const weekly = { ...defaultSchedule('UTC'), enabled: true, cadence: 'weekly' as const, weekdays: [1, 4, 6] };
    const { rerender } = render(<PipelineScheduleCell end={{ status: 'finite' }} schedule={weekly} />);
    expect(screen.getByRole('img', { name: 'On Monday, Thursday and Saturday' })).toBeInTheDocument();

    rerender(
      <PipelineScheduleCell end={{ status: 'finite' }} schedule={{ ...weekly, cadence: 'monthly', dayOfMonth: 15 }} />
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('pipeline-schedule-line')).toHaveTextContent('15th of the month');
  });
});

// Notes the time each render reads.
const ClockProbe = ({ seen }: { seen: number[] }) => {
  seen.push(useClock());
  return null;
};

describe('the schedule clock', () => {
  beforeEach(() => {
    rs.useFakeTimers();
    return () => {
      rs.useRealTimers();
    };
  });

  // Nothing ticks the clock while no label is shown.
  test('a label shown after a while with none on the page starts from the time now', () => {
    render(<ClockProbe seen={[]} />).unmount();
    rs.setSystemTime(Date.now() + 3 * 60 * 60_000);
    const seen: number[] = [];
    render(<ClockProbe seen={seen} />);
    expect(seen[0]).toBe(Date.now());
  });
});

describe('preview store', () => {
  test('keeps schedules another tab saved, and entries it can’t read', () => {
    window.localStorage.setItem(
      SCHEDULE_PREVIEW_STORAGE_KEY,
      JSON.stringify({ 'default/other': { ...defaultSchedule('UTC'), enabled: true }, 'default/old': { v: 0 } })
    );
    useSchedulePreviewStore.getState().saveSchedule(PIPELINE_ID, defaultSchedule('UTC'));
    const stored = JSON.parse(window.localStorage.getItem(SCHEDULE_PREVIEW_STORAGE_KEY) ?? '{}');
    expect(Object.keys(stored).sort()).toEqual(['default/old', 'default/other', `default/${PIPELINE_ID}`]);
    expect(Object.keys(useSchedulePreviewStore.getState().schedules).sort()).toEqual([
      'default/other',
      `default/${PIPELINE_ID}`,
    ]);
  });
});
