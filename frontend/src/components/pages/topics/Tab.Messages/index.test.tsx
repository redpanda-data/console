import { render, screen } from '../../../../test-utils';
import { CompressionType, type Payload, type TopicMessage } from '../../../../state/restInterfaces';
import { ExpandedMessage, MessageKeyPreview, MessagePreview } from './index';

const { kowlJsonViewSpy } = vi.hoisted(() => ({
  kowlJsonViewSpy: vi.fn(),
}));

vi.mock('../../../../config', () => ({
  isServerless: () => false,
}));

vi.mock('../../../../state/backendApi', () => ({
  api: {
    topicPermissions: new Map(),
  },
  createMessageSearch: vi.fn(),
}));

vi.mock('../../../../state/supportedFeatures', () => ({
  Feature: {},
  isSupported: () => false,
}));

vi.mock('../../../../state/ui', () => ({
  DEFAULT_SEARCH_PARAMS: {},
  FilterEntry: class {},
  PartitionOffsetOrigin: {
    Latest: 0,
  },
}));

vi.mock('../../../../state/uiState', () => ({
  uiState: {
    pageBreadcrumbs: [],
    topicSettings: {
      previewDisplayMode: 'table',
      previewTimestamps: 'default',
      previewColumnFields: [],
      previewTags: {
        count: () => 0,
      },
      searchParams: {
        filters: [],
        sorting: [],
        pageSize: 10,
        valueDeserializer: null,
        keyDeserializer: null,
      },
    },
  },
}));

vi.mock('../../../../protogen/redpanda/api/console/v1alpha1/common_pb', () => ({
  PayloadEncoding: {
    UNSPECIFIED: 0,
    NULL: 1,
    AVRO: 2,
    PROTOBUF: 3,
    PROTOBUF_SCHEMA: 4,
    JSON: 5,
    JSON_SCHEMA: 6,
    XML: 7,
    TEXT: 8,
    UTF8: 9,
    MESSAGE_PACK: 10,
    SMILE: 11,
    BINARY: 12,
    UINT: 13,
    CONSUMER_OFFSETS: 14,
    CBOR: 15,
  },
}));

vi.mock('../../../../state/appGlobal', () => ({
  appGlobal: {
    history: {
      replace: vi.fn(),
    },
  },
}));

vi.mock('./PreviewSettings', () => ({
  PreviewSettings: () => null,
  getPreviewTags: () => [],
}));

vi.mock('../../../misc/KowlJsonView', () => ({
  KowlJsonView: (props: { srcObj: object | string | null | undefined }) => {
    kowlJsonViewSpy(props);
    return <div data-testid="mock-kowl-json-view" />;
  },
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
        <MessagePreview msg={msg} previewFields={() => []} isCompactTopic={false} />
      </>,
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
