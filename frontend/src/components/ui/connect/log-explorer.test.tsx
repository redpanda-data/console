import { render, screen, waitFor } from 'test-utils';
import { userEvent } from '@testing-library/user-event';
import { TooltipProvider } from 'components/redpanda-ui/components/tooltip';
import type { Pipeline } from '../../../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { TopicMessage } from '../../../state/rest-interfaces';

const mockRefresh = vi.fn();
let mockReturn: {
  messages: TopicMessage[];
  phase: string | null;
  error: string | null;
  refresh: () => void;
};

vi.mock('../../../hooks/use-log-search', () => ({
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

const pipeline = { id: 'pipeline-1', displayName: 'Test Pipeline' } as unknown as Pipeline;

function renderExplorer() {
  return render(
    <TooltipProvider>
      <LogExplorer pipeline={pipeline} />
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
      refresh: mockRefresh,
    };
  });

  test('shows spinner while searching with no messages', () => {
    mockReturn.phase = 'Searching...';
    renderExplorer();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  test('shows empty state when no messages and search complete', () => {
    renderExplorer();
    expect(screen.getByText('No messages')).toBeInTheDocument();
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
    const refreshBtn = screen.getAllByRole('button').find((btn) => btn.querySelector('.lucide-refresh-ccw'));
    expect(refreshBtn).toBeDefined();
    await user.click(refreshBtn!);
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
});
