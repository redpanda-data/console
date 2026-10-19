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
import { render, screen, within } from 'test-utils';

rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return { ...actual, isFeatureFlagEnabled: (flag: string) => flag === 'enableRpcnPipelineSchedules' };
});

import {
  PipelineScheduleDialog,
  PipelineScheduleLine,
  PipelineScheduleMeta,
  usePipelineScheduleControl,
} from './pipeline-schedule';
import { defaultSchedule, type PipelineSchedule } from '../utils/pipeline-schedule';

const FINITE = 'input:\n  sql_select:\n    table: orders\noutput:\n  drop: {}\n';
const CHECK_ONLY =
  'input:\n  read_until:\n    check: counter() >= 1000\n    input:\n      redpanda:\n        topics: [orders]\noutput:\n  drop: {}\n';
const BROKEN = 'input: [';
const CONTINUOUS = 'input:\n  redpanda:\n    topics: [orders]\noutput:\n  drop: {}\n';

const PIPELINE_ID = 'p1';
const ACTIVE_META = /^Every hour at :15 · next run in /;
const NEXT_RUN = /^Next in /;

const storedSchedule = () => Object.values(useSchedulePreviewStore.getState().schedules)[0];

function seed(overrides: Partial<PipelineSchedule>) {
  useSchedulePreviewStore.getState().saveSchedule(PIPELINE_ID, { ...defaultSchedule('UTC'), ...overrides });
}

function renderDialog(configYaml: string) {
  return render(
    <PipelineScheduleDialog
      configYaml={configYaml}
      fixHint={<span>Add one on the canvas.</span>}
      onOpenChange={() => undefined}
      open
      pipelineId={PIPELINE_ID}
    />
  );
}

beforeEach(() => {
  window.localStorage.removeItem(SCHEDULE_PREVIEW_STORAGE_KEY);
  useSchedulePreviewStore.setState({ schedules: {} });
});

describe('PipelineScheduleDialog', () => {
  test('a pipeline that stops on its own can be scheduled', async () => {
    const user = userEvent.setup();
    renderDialog(FINITE);

    const readiness = screen.getByTestId('schedule-readiness');
    expect(within(readiness).getByText('Each run ends on its own')).toBeInTheDocument();
    expect(within(readiness).getByText('sql_select')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-enabled')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Next runs' })).getAllByRole('listitem')).toHaveLength(3);

    await user.click(screen.getByTestId('schedule-save'));

    expect(storedSchedule()).toMatchObject({ enabled: true, cadence: 'daily', time: '02:00' });
    expect(JSON.parse(window.localStorage.getItem(SCHEDULE_PREVIEW_STORAGE_KEY) ?? '{}')).not.toEqual({});
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

  test('a broker with a stop condition of its own is listed itself, not its members', () => {
    renderDialog(
      'input:\n  read_until:\n    idle_timeout: 30s\n    input:\n      broker:\n        inputs:\n          - redpanda: { topics: [a] }\n          - redpanda: { topics: [b] }\noutput:\n  drop: {}\n'
    );
    const readiness = screen.getByTestId('schedule-readiness');
    expect(within(readiness).getByText('Each run ends on its own')).toBeInTheDocument();
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

  test('a schedule left on for a pipeline that no longer stops cannot be saved until paused', async () => {
    const user = userEvent.setup();
    seed({ enabled: true });
    renderDialog(CONTINUOUS);

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
    const user = userEvent.setup();
    seed({ enabled: true, cadence: 'custom', every: 30, unit: 'minutes' });
    renderDialog(FINITE);

    const every = screen.getByTestId('schedule-every');
    await user.clear(every);
    await user.type(every, '10');
    await user.click(screen.getByTestId('schedule-save'));

    expect(await screen.findByText('Runs must be at least 15 minutes apart.')).toBeInTheDocument();
    expect(storedSchedule()).toMatchObject({ every: 30 });
  });

  test('fields the cadence hides never block saving, and are stored clean', async () => {
    const user = userEvent.setup();
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
    renderDialog(FINITE);

    await user.click(screen.getByTestId('schedule-save'));
    expect(storedSchedule()).toMatchObject({ cadence: 'daily', every: 2, maxRuntime: 1 });
  });

  test('YAML that doesn’t parse asks for a fix, not an input', () => {
    renderDialog(BROKEN);
    expect(within(screen.getByTestId('schedule-readiness')).getByText('Fix the YAML first')).toBeInTheDocument();
  });

  test('an input that might wait forever is ready, with a warning', () => {
    renderDialog(CHECK_ONLY);
    const readiness = screen.getByTestId('schedule-readiness');
    expect(within(readiness).getByText('Each run ends on its own')).toBeInTheDocument();
    expect(readiness).toHaveTextContent('If fewer than 1000 messages arrive, it keeps running.');
  });

  test('a saved schedule can be removed', async () => {
    const user = userEvent.setup();
    seed({ enabled: true });
    renderDialog(FINITE);

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
  const renderMeta = (configYaml: string) =>
    render(<PipelineScheduleMeta configYaml={configYaml} onOpen={() => undefined} pipelineId={PIPELINE_ID} />);

  test('shows nothing without a schedule', () => {
    renderMeta(FINITE);
    expect(screen.queryByTestId('pipeline-schedule-meta')).not.toBeInTheDocument();
  });

  test('an active schedule names its cadence and next run', () => {
    seed({ enabled: true, cadence: 'hourly', time: '00:15' });
    renderMeta(FINITE);
    expect(screen.getByTestId('pipeline-schedule-meta')).toHaveTextContent(ACTIVE_META);
  });

  test('a schedule for a pipeline that no longer stops is on hold', () => {
    seed({ enabled: true });
    renderMeta(CONTINUOUS);
    expect(screen.getByTestId('pipeline-schedule-meta')).toHaveTextContent('Schedule on hold');
  });

  test('a half-typed edit keeps the last answer instead of flashing on hold', () => {
    seed({ enabled: true, cadence: 'hourly', time: '00:15' });
    const { rerender } = renderMeta(FINITE);
    rerender(<PipelineScheduleMeta configYaml={BROKEN} onOpen={() => undefined} pipelineId={PIPELINE_ID} />);
    expect(screen.getByTestId('pipeline-schedule-meta')).toHaveTextContent(ACTIVE_META);
  });

  test('the header gets no meta item, and so no separator, without a schedule', () => {
    function Probe() {
      const { meta, button } = usePipelineScheduleControl({
        pipelineId: PIPELINE_ID,
        configYaml: FINITE,
        fixHint: null,
      });
      return (
        <>
          <span data-testid="probe">{meta === null ? 'no meta' : 'meta'}</span>
          {button}
        </>
      );
    }
    const { rerender } = render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('no meta');
    expect(screen.getByTestId('pipeline-schedule-button')).toBeInTheDocument();
    seed({ enabled: true });
    rerender(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('meta');
  });

  test('the list line reads paused, on hold or the next run', () => {
    seed({ enabled: false });
    const { rerender } = render(<PipelineScheduleLine end={{ status: 'finite' }} pipelineId={PIPELINE_ID} />);
    expect(screen.getByTestId('pipeline-schedule-line')).toHaveTextContent('Paused');

    seed({ enabled: true });
    rerender(<PipelineScheduleLine end={{ status: 'continuous' }} pipelineId={PIPELINE_ID} />);
    expect(screen.getByTestId('pipeline-schedule-line')).toHaveTextContent('On hold');

    rerender(<PipelineScheduleLine end={{ status: 'finite' }} pipelineId={PIPELINE_ID} />);
    expect(screen.getByTestId('pipeline-schedule-line')).toHaveTextContent(NEXT_RUN);
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
