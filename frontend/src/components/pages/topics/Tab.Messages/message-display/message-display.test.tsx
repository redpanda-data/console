import { expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';

import { MessageKeyPreview } from './message-key-preview';
import { MessagePreview } from './message-preview';
import { CompressionType, type Payload, type TopicMessage } from '../../../../../state/rest-interfaces';

const objectPayload = (payload: object) =>
  ({
    payload,
    isPayloadNull: false,
    encoding: 'json',
    schemaId: 0,
    size: 32,
  }) satisfies Payload;

test('uses the cached key and value previews without serializing either object again', () => {
  const keyPayload = { market: 'BSEX' };
  const valuePayload = { marketName: 'BAKU STOCK EXCHANGE' };
  const msg: TopicMessage = {
    partitionID: 1,
    offset: 42,
    timestamp: 0,
    compression: CompressionType.Uncompressed,
    isTransactional: false,
    headers: [],
    key: objectPayload(keyPayload),
    value: objectPayload(valuePayload),
    keyJson: 'cached key preview',
    valueJson: 'cached value preview',
    valueBinHexPreview: '',
    keyBinHexPreview: '',
  };
  const stringify = rs.spyOn(JSON, 'stringify');

  try {
    render(
      <>
        <MessageKeyPreview msg={msg} previewFields={() => []} />
        <MessagePreview isCompactTopic={false} msg={msg} previewFields={() => []} />
      </>
    );

    expect(screen.getByText('cached key preview')).toBeVisible();
    expect(screen.getByText('cached value preview')).toBeVisible();
    expect(stringify.mock.calls.some(([value]) => value === keyPayload || value === valuePayload)).toBe(false);
  } finally {
    stringify.mockRestore();
  }
});
