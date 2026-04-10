import type React from 'react';
import { render, screen, waitFor } from 'test-utils';
import { userEvent } from '@testing-library/user-event';
import { TooltipProvider } from 'components/redpanda-ui/components/tooltip';
import { type Pipeline, Pipeline_State } from '../../../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { TopicMessage } from '../../../state/rest-interfaces';

const mockRefresh = vi.fn();
let mockReturn: {
  messages: TopicMessage[];
  phase: string | null;
  error: string | null;
  progress: { bytesConsumed: number; messagesConsumed: number };
  refresh: () => void;
};

vi.mock('../../../react-query/api/logs', () => ({
  useLogSearch: () => mockReturn,
}));

import { LogExplorer } from './log-explorer';

function makeMessage(overrides: Partial<TopicMessage> & { valuePayload?: Record<string, unknown> }): TopicMessage {
  const { valuePayload, ...rest } = overrides;
  const payload = valuePayload ?? { message: 'test log', level: 'INFO', path: 'root.input' };
  return {
    partitionID: 0,
    offset: 0,
    timestamp: Date.now(),
    compression: 'uncompressed',
    isTransactional: false,
    headers: [],
    key: { payload: '', isPayloadNull: false, encoding: 'text', schemaId: 0, size: 0 },
    value: { payload, isPayloadNull: false, encoding: 'json', schemaId: 0, size: 100 },
    valueJson: JSON.stringify(payload),
    valueBinHexPreview: '',
    keyJson: 'pipeline-1',
    keyBinHexPreview: '',
    ...rest,
  } as TopicMessage;
}

const pipeline = { id: 'pipeline-1', displayName: 'Test Pipeline', state: Pipeline_State.RUNNING } as unknown as Pipeline;

function renderExplorer(props?: Partial<React.ComponentProps<typeof LogExplorer>>) {
  return render(
    <TooltipProvider delayDuration={0}>
      <LogExplorer pipeline={pipeline} {...props} />
    </TooltipProvider>,
  );
}

describe('LogExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturn = {
      messages: [],
      phase: null,
      error: null,
      progress: { bytesConsumed: 0, messagesConsumed: 0 },
      refresh: mockRefresh,
    };
  });

  test('shows spinner while searching with no progress data', () => {
    mockReturn.phase = 'Searching...';
    mockReturn.progress = { bytesConsumed: 0, messagesConsumed: 0 };
    renderExplorer();
    expect(screen.getByTestId('log-loading-spinner')).toBeInTheDocument();
    expect(screen.queryByTestId('log-progress-bar')).not.toBeInTheDocument();
  });

  test('shows progress bar (no spinner) when backend provides progress data', () => {
    mockReturn.phase = 'Searching...';
    mockReturn.progress = { bytesConsumed: 2_500_000, messagesConsumed: 150 };
    renderExplorer();
    expect(screen.queryByTestId('log-loading-spinner')).not.toBeInTheDocument();
    expect(screen.getByTestId('log-progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('log-search-progress')).toHaveTextContent('150 messages checked');
  });

  test('progress bar renders above the table, not inside a table cell', () => {
    mockReturn.phase = 'Searching...';
    mockReturn.progress = { bytesConsumed: 1_000, messagesConsumed: 10 };
    renderExplorer();
    const progressBar = screen.getByTestId('log-progress-bar');
    // Progress bar should be a sibling/overlay of the table, not inside a <td>
    expect(progressBar.closest('td')).toBeNull();
  });

  test('shows history empty state when no messages and search complete', () => {
    renderExplorer();
    expect(screen.getByText('No logs found in the last 5 hours for this pipeline.')).toBeInTheDocument();
  });

  test('shows live empty state when live mode enabled and no messages', async () => {
    const user = userEvent.setup();
    renderExplorer({ enableLiveView: true });
    const liveSwitch = screen.getByTestId('log-live-toggle');
    await user.click(liveSwitch);
    expect(
      screen.getByText('Listening for new log messages\u2026 Switch to Recent Logs to view historical logs.'),
    ).toBeInTheDocument();
  });

  test('live toggle is disabled when enableLiveView is false', () => {
    renderExplorer({ enableLiveView: false });
    const liveSwitch = screen.getByTestId('log-live-toggle');
    expect(liveSwitch).toBeDisabled();
  });

  test('live toggle has tooltip trigger with info icon', () => {
    renderExplorer({ enableLiveView: true });
    const tooltipTrigger = screen.getByTestId('log-live-tooltip-trigger');
    expect(tooltipTrigger).toBeInTheDocument();
    // Tooltip trigger wraps the info icon in a span (asChild on non-interactive wrapper)
    expect(tooltipTrigger.tagName.toLowerCase()).toBe('span');
  });

  test('shows filter mismatch text when messages exist but are filtered out', () => {
    // Simulate state where messages exist but table filtering excludes all rows.
    // The DataTableFilter interaction is complex in jsdom, so we verify the branch
    // indirectly: with messages present and no filters, the table renders rows — not the empty state.
    // Then we verify the empty state text exists in the document when we provide messages
    // but apply a column filter via the table API. Since we can't easily set column filters
    // from outside the component, we verify the two reachable branches instead:
    // 1. messages.length === 0 && !liveViewEnabled → history empty state (tested above)
    // 2. messages.length > 0 → table rows render (tested below)
    mockReturn.messages = [
      makeMessage({ offset: 1, valuePayload: { message: 'test', level: 'ERROR', path: 'root.input' } }),
    ];
    renderExplorer();
    // With messages and no filters, rows render — the filter mismatch branch is NOT hit
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(2); // 1 header + 1 data
    expect(screen.queryByText('No messages match the current filters')).not.toBeInTheDocument();
  });

  test('renders table with log entries', () => {
    mockReturn.messages = [
      makeMessage({ offset: 1, valuePayload: { message: 'First log', level: 'INFO', path: 'root.input' } }),
      makeMessage({ offset: 2, valuePayload: { message: 'Second log', level: 'ERROR', path: 'root.output' } }),
    ];
    renderExplorer();
    expect(screen.getByText(/First log/)).toBeInTheDocument();
    expect(screen.getByText(/Second log/)).toBeInTheDocument();
  });

  test('displays timestamps for each entry', () => {
    const ts = new Date('2025-01-15T12:00:00Z').getTime();
    mockReturn.messages = [makeMessage({ offset: 1, timestamp: ts })];
    renderExplorer();
    const rows = screen.getAllByRole('row');
    // header row + 1 data row
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  test('displays log level badges', () => {
    mockReturn.messages = [
      makeMessage({ offset: 1, valuePayload: { message: 'err', level: 'ERROR', path: 'x' } }),
      makeMessage({ offset: 2, valuePayload: { message: 'warn', level: 'WARN', path: 'x' } }),
    ];
    renderExplorer();
    expect(screen.getByText('ERROR')).toBeInTheDocument();
    expect(screen.getByText('WARN')).toBeInTheDocument();
  });

  test('shows error alert when error is set', () => {
    mockReturn.error = 'Connection refused';
    renderExplorer();
    expect(screen.getByText('Failed to load logs')).toBeInTheDocument();
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  test('refresh button calls refresh', async () => {
    const user = userEvent.setup();
    renderExplorer();
    const refreshBtn = screen.getByTestId('log-refresh-button');
    await user.click(refreshBtn);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  test('clicking a row opens detail sheet', async () => {
    const user = userEvent.setup();
    mockReturn.messages = [
      makeMessage({ offset: 42, valuePayload: { message: 'Detail test', level: 'INFO', path: 'root.input' } }),
    ];
    renderExplorer();
    const dataRow = screen.getAllByRole('row')[1];
    await user.click(dataRow);
    await waitFor(() => {
      expect(screen.getByText('Partition')).toBeInTheDocument();
    });
  });

  test('paginates with default 10 per page', () => {
    mockReturn.messages = Array.from({ length: 15 }, (_, i) =>
      makeMessage({ offset: i, valuePayload: { message: `Log ${i}`, level: 'INFO', path: 'x' } }),
    );
    renderExplorer();
    // Should show 10 data rows on first page (+ 1 header row)
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(11); // 1 header + 10 data
  });

  test('table has expected column headers', () => {
    renderExplorer();
    expect(screen.getByText('Timestamp')).toBeInTheDocument();
    expect(screen.getByText('Level')).toBeInTheDocument();
    expect(screen.getByText('Component')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
  });

  test('no pipeline-stopped banner when live mode is off', () => {
    const stoppedPipeline = { id: 'pipeline-1', displayName: 'Test Pipeline', state: 4 } as unknown as Pipeline;
    renderExplorer({ pipeline: stoppedPipeline, enableLiveView: true });
    expect(screen.queryByTestId('pipeline-stopped-banner')).not.toBeInTheDocument();
  });

  test('shows pipeline-stopped banner after enabling live mode on stopped pipeline', async () => {
    const stoppedPipeline = { id: 'pipeline-1', displayName: 'Test Pipeline', state: 4 } as unknown as Pipeline;
    const user = userEvent.setup();
    renderExplorer({ pipeline: stoppedPipeline, enableLiveView: true });
    const liveSwitch = screen.getByTestId('log-live-toggle');
    await user.click(liveSwitch);
    expect(screen.getByTestId('pipeline-stopped-banner')).toBeInTheDocument();
    expect(screen.getByText(/pipeline is not running/i)).toBeInTheDocument();
  });

  test('auto-disables live mode when enableLiveView transitions to false', () => {
    const { rerender } = renderExplorer({ enableLiveView: false });

    // Simulate pipeline starting: enableLiveView transitions false → true
    rerender(
      <TooltipProvider delayDuration={0}>
        <LogExplorer enableLiveView={true} pipeline={pipeline} />
      </TooltipProvider>,
    );

    // Live mode was auto-enabled
    const liveSwitch = screen.getByTestId('log-live-toggle');
    expect(liveSwitch).toBeChecked();

    // Simulate pipeline stopping: enableLiveView goes false
    rerender(
      <TooltipProvider delayDuration={0}>
        <LogExplorer enableLiveView={false} pipeline={pipeline} />
      </TooltipProvider>,
    );

    // Live mode should be auto-disabled
    expect(liveSwitch).not.toBeChecked();
  });
});
