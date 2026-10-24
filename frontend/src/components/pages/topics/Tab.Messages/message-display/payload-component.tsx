/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { highlightControlChars } from './highlight-control-chars';
import type { Payload } from '../../../../../state/rest-interfaces';
import { KowlJsonView } from '../../../../misc/kowl-json-view';
import { Button } from '../../../../redpanda-ui/components/button';

// Regex for checking printable ASCII characters
const PRINTABLE_CHAR_REGEX = /[\x20-\x7E]/;

type PayloadRenderData =
  | { type: 'null' }
  | { type: 'code'; content: React.ReactNode }
  | { type: 'rawBytesUnavailable' }
  | { type: 'controlChars'; content: string }
  | { type: 'primitive'; content: string }
  | { type: 'json'; content: string | object | null | undefined }
  | { type: 'error'; content: string };

function isPrimitivePayload(val: unknown): boolean {
  return typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean';
}

function formatHexBytes(payload: Payload): PayloadRenderData {
  const rawBytes = payload.rawBytes;
  const normalizedPayload = payload.normalizedPayload;
  const bytesSource = rawBytes !== null && rawBytes !== undefined ? rawBytes : normalizedPayload;
  if (
    bytesSource &&
    (typeof bytesSource === 'string' || Array.isArray(bytesSource) || bytesSource instanceof Uint8Array)
  ) {
    let result = '';
    for (const rawByte of bytesSource as Uint8Array) {
      result += `${rawByte.toString(16).padStart(2, '0')} `;
    }
    return { type: 'code', content: result };
  }
  return { type: 'rawBytesUnavailable' };
}

function formatAsciiBytes(val: unknown): PayloadRenderData {
  const str = String(val);
  let result = '';
  for (let i = 0; i < str.length; i++) {
    let ch = String.fromCharCode(str.charCodeAt(i));
    ch = PRINTABLE_CHAR_REGEX.test(ch) ? ch : '. ';
    result += `${ch} `;
  }
  return { type: 'code', content: result };
}

function prepareBinaryPayload(payload: Payload, val: unknown): PayloadRenderData {
  const mode = 'hex' as 'ascii' | 'raw' | 'hex';
  if (mode === 'raw') {
    return { type: 'code', content: val as React.ReactNode };
  }
  if (mode === 'hex') {
    return formatHexBytes(payload);
  }
  return formatAsciiBytes(val);
}

function classifyPayload(payload: Payload): PayloadRenderData {
  if (payload === null || payload === undefined || payload.payload === null || payload.payload === undefined) {
    return { type: 'null' };
  }

  const val = payload.payload;

  if (payload.encoding === 'binary') {
    return prepareBinaryPayload(payload, val);
  }

  if (payload.encoding === 'utf8WithControlChars') {
    return { type: 'controlChars', content: val as string };
  }

  if (isPrimitivePayload(val)) {
    return { type: 'primitive', content: String(val) };
  }

  return { type: 'json', content: val };
}

function preparePayloadData(payload: Payload): PayloadRenderData {
  try {
    return classifyPayload(payload);
  } catch (e) {
    const err = e as Error;
    return { type: 'error', content: err.message === undefined ? String(e) : err.message };
  }
}

function LargePayloadNotice({ loadLargeMessage }: { loadLargeMessage: () => Promise<void> }) {
  const [isLoadingLargeMessage, setLoadingLargeMessage] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        Because this message size exceeds the display limit, loading it could cause performance degradation.
      </div>
      <Button
        className="w-40"
        data-testid="load-anyway-button"
        isLoading={isLoadingLargeMessage}
        onClick={() => {
          setLoadingLargeMessage(true);
          loadLargeMessage()
            .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
            .finally(() => setLoadingLargeMessage(false));
        }}
        size="sm"
        variant="outline"
      >
        Load anyway
      </Button>
    </div>
  );
}

function renderPayloadData(renderData: PayloadRenderData, payload: Payload, viewerStyle: CSSProperties | undefined) {
  switch (renderData.type) {
    case 'null':
      return <code>null</code>;
    case 'code':
      return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{renderData.content}</code>;
    case 'rawBytesUnavailable':
      return <div>Raw bytes not available</div>;
    case 'controlChars':
      return (
        <div className="codeBox" data-testid="payload-content">
          {highlightControlChars(renderData.content)}
        </div>
      );
    case 'primitive':
      return (
        <div className="codeBox" data-testid="payload-content">
          {renderData.content}
        </div>
      );
    case 'json':
      // Avro JSON encodes bytes fields as \u00XX escape sequences. Re-escape
      // Latin-1 code points in the viewer so copy-paste yields the original
      // bytes rather than their UTF-8 encoding.
      return (
        <KowlJsonView escapeLatin1={payload.encoding === 'avro'} srcObj={renderData.content} style={viewerStyle} />
      );
    case 'error':
      return <span className="text-destructive">Error in RenderExpandedMessage: {renderData.content}</span>;
    default:
      return renderData satisfies never;
  }
}

export const PayloadComponent = (p: {
  payload: Payload;
  loadLargeMessage: () => Promise<void>;
  /** Style overrides for the JSON viewer (e.g. lift the default max-height in full-height layouts). */
  viewerStyle?: CSSProperties;
}) => {
  const { payload, loadLargeMessage } = p;
  const renderData = useMemo(() => preparePayloadData(payload), [payload]);

  if (payload.isPayloadTooLarge) {
    return <LargePayloadNotice loadLargeMessage={loadLargeMessage} />;
  }

  return renderPayloadData(renderData, payload, p.viewerStyle);
};
