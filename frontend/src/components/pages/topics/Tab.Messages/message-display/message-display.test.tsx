import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@redpanda-data/ui', async () => {
  const React = await import('react');

  const Div = React.forwardRef<HTMLDivElement, Record<string, unknown>>(({ children, ...props }, ref) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  ));

  return {
    __esModule: true,
    Box: Div,
    Flex: Div,
    Text: Div,
    Button: React.forwardRef<HTMLButtonElement, Record<string, unknown>>(({ children, isDisabled, ...props }, ref) => (
      <button disabled={Boolean(isDisabled)} ref={ref} {...props}>
        {children}
      </button>
    )),
    Tabs: ({ defaultIndex = 0, items }: { defaultIndex?: number; items: Array<{ component: React.ReactNode }> }) => (
      <div>{items[defaultIndex]?.component}</div>
    ),
    useColorModeValue: (light: unknown) => light,
    useToast: () => vi.fn(),
  };
});

import { ExpandedMessage } from './expanded-message';
import { MessageKeyPreview } from './message-key-preview';
import { MessagePreview } from './message-preview';
import { CompressionType, type Payload, type TopicMessage } from '../../../../../state/rest-interfaces';

const { kowlJsonViewSpy } = vi.hoisted(() => ({
  kowlJsonViewSpy: vi.fn(),
}));

vi.mock('../../../../../state/ui-state', () => ({
  uiState: {
    topicSettings: {
      previewDisplayMode: 'wrap',
      previewTagsCaseSensitive: 'caseInsensitive',
    },
  },
}));

vi.mock('../../../../../config', () => ({
  isServerless: () => false,
}));

vi.mock('../../../../../state/backend-api', () => ({
  api: {},
  createMessageSearch: vi.fn(),
}));

vi.mock('components/icons', () => ({
  WarningIcon: () => <span data-testid="warning-icon" />,
  InfoIcon: () => <span data-testid="info-icon" />,
}));

vi.mock('../preview-settings', () => ({
  getPreviewTags: () => [],
}));

vi.mock('../../../../misc/kowl-json-view', () => ({
  KowlJsonView: (props: { srcObj: object | string | null | undefined }) => {
    kowlJsonViewSpy(props);
    return <div data-testid="mock-kowl-json-view" />;
  },
}));

vi.mock('./message-headers', () => ({
  MessageHeaders: () => <div data-testid="message-headers" />,
}));

vi.mock('./message-meta-data', () => ({
  MessageMetaData: () => <div data-testid="message-meta-data" />,
}));

vi.mock('./troubleshoot-report-viewer', () => ({
  TroubleshootReportViewer: () => null,
}));

function buildPayload(overrides: Partial<Payload> = {}): Payload {
  return {
    payload: 'sample',
    isPayloadNull: false,
    encoding: 'text',
    schemaId: 0,
    size: 6,
    ...overrides,
  };
}

function buildMessage(overrides: Partial<TopicMessage> = {}): TopicMessage {
  return {
    partitionID: 1,
    offset: 42,
    timestamp: 0,
    compression: CompressionType.Uncompressed,
    isTransactional: false,
    headers: [],
    key: buildPayload({ payload: 'sample-key', size: 10 }),
    value: buildPayload({ payload: 'sample-value', size: 12 }),
    valueJson: '"sample-value"',
    valueBinHexPreview: '',
    keyJson: '"sample-key"',
    keyBinHexPreview: '',
    ...overrides,
  };
}

describe('topic message rendering', () => {
  beforeEach(() => {
    kowlJsonViewSpy.mockReset();
  });

  test('reuses cached key and value JSON previews instead of re-stringifying payload objects', () => {
    const keyPayload = { market: 'BSEX' };
    const valuePayload = { marketName: 'BAKU STOCK EXCHANGE' };
    const msg = buildMessage({
      key: buildPayload({ payload: keyPayload, encoding: 'json', size: 18 }),
      value: buildPayload({ payload: valuePayload, encoding: 'json', size: 32 }),
      keyJson: 'cached key preview',
      valueJson: 'cached value preview',
    });
    const stringifySpy = vi.spyOn(JSON, 'stringify');

    render(
      <>
        <MessageKeyPreview msg={msg} previewFields={() => []} />
        <MessagePreview isCompactTopic={false} msg={msg} previewFields={() => []} />
      </>
    );

    expect(screen.getByText('cached key preview')).toBeInTheDocument();
    expect(screen.getByText('cached value preview')).toBeInTheDocument();
    expect(stringifySpy.mock.calls.some(([value]) => value === keyPayload)).toBe(false);
    expect(stringifySpy.mock.calls.some(([value]) => value === valuePayload)).toBe(false);

    stringifySpy.mockRestore();
  });

  test('does not rerender expanded object payloads when parent rerenders with stable props', () => {
    const msg = buildMessage({
      key: buildPayload({ payload: 'sample-key', encoding: 'text', size: 10 }),
      value: buildPayload({
        payload: { marketName: 'BAKU STOCK EXCHANGE' },
        encoding: 'json',
        size: 32,
      }),
      valueJson: 'cached value preview',
    });
    const props = {
      msg,
      topicName: 'market-data',
      onLoadLargeMessage: vi.fn().mockResolvedValue(undefined),
      onSetDownloadMessages: vi.fn(),
      onCopyKey: vi.fn(),
      onCopyValue: vi.fn(),
    };

    const { rerender } = render(<ExpandedMessage {...props} />);

    expect(kowlJsonViewSpy).toHaveBeenCalledTimes(1);

    rerender(<ExpandedMessage {...props} />);

    expect(kowlJsonViewSpy).toHaveBeenCalledTimes(1);
  });

  test('calls onDownloadRecord when "Download Record" button is clicked', async () => {
    const user = userEvent.setup();
    const onDownloadRecord = vi.fn();
    const msg = buildMessage();

    render(
      <ExpandedMessage loadLargeMessage={() => Promise.resolve()} msg={msg} onDownloadRecord={onDownloadRecord} />
    );

    const downloadButton = screen.getByRole('button', { name: /download record/i });
    await user.click(downloadButton);

    expect(onDownloadRecord).toHaveBeenCalledTimes(1);
  });

  test('rerenders expanded object payloads when the message prop changes', () => {
    const props = {
      topicName: 'market-data',
      onLoadLargeMessage: vi.fn().mockResolvedValue(undefined),
      onSetDownloadMessages: vi.fn(),
      onCopyKey: vi.fn(),
      onCopyValue: vi.fn(),
    };
    const firstMessage = buildMessage({
      value: buildPayload({
        payload: { marketName: 'BAKU STOCK EXCHANGE' },
        encoding: 'json',
        size: 32,
      }),
      valueJson: 'cached value preview',
    });
    const secondMessage = buildMessage({
      offset: 43,
      value: buildPayload({
        payload: { marketName: 'NASDAQ DUBAI' },
        encoding: 'json',
        size: 24,
      }),
      valueJson: 'cached value preview 2',
    });

    const { rerender } = render(<ExpandedMessage {...props} msg={firstMessage} />);

    expect(kowlJsonViewSpy).toHaveBeenCalledTimes(1);

    rerender(<ExpandedMessage {...props} msg={secondMessage} />);

    expect(kowlJsonViewSpy).toHaveBeenCalledTimes(2);
  });
});
