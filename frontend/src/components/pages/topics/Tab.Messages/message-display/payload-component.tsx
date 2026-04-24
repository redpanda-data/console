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

import { Button, Flex, useToast } from '@redpanda-data/ui';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import type { Payload } from '../../../../../state/rest-interfaces';
import { KowlJsonView } from '../../../../misc/kowl-json-view';
import { getControlCharacterName } from '../helpers';

// Regex for checking printable ASCII characters
const PRINTABLE_CHAR_REGEX = /[\x20-\x7E]/;

function highlightControlChars(str: string, maxLength?: number): ReactNode[] {
  const elements: ReactNode[] = [];
  let sequentialChars = '';
  let numChars = 0;

  for (const char of str) {
    const code = char.charCodeAt(0);
    if (code < 32) {
      if (sequentialChars.length > 0) {
        elements.push(sequentialChars);
        sequentialChars = '';
      }
      elements.push(<span className="controlChar">{getControlCharacterName(code)}</span>);
      if (code === 10) {
        elements.push(<br />);
      }
    } else {
      sequentialChars += char;
    }

    if (maxLength !== undefined) {
      numChars += 1;
      if (numChars >= maxLength) {
        break;
      }
    }
  }

  if (sequentialChars.length > 0) {
    elements.push(sequentialChars);
  }

  return elements;
}

type PayloadRenderData =
  | { type: 'null' }
  | { type: 'code'; content: React.ReactNode }
  | { type: 'rawBytesUnavailable' }
  | { type: 'controlChars'; content: string }
  | { type: 'primitive'; content: string }
  | { type: 'json'; content: string | object | null | undefined }
  | { type: 'error'; content: string };

function preparePayloadData(payload: Payload): PayloadRenderData {
  try {
    if (payload === null || payload === undefined || payload.payload === null || payload.payload === undefined) {
      return { type: 'null' };
    }

    const val = payload.payload;
    const isPrimitive = typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean';

    if (payload.encoding === 'binary') {
      const mode = 'hex' as 'ascii' | 'raw' | 'hex';
      if (mode === 'raw') {
        return { type: 'code', content: val as React.ReactNode };
      }
      if (mode === 'hex') {
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
      const str = String(val);
      let result = '';
      for (let i = 0; i < str.length; i++) {
        let ch = String.fromCharCode(str.charCodeAt(i));
        ch = PRINTABLE_CHAR_REGEX.test(ch) ? ch : '. ';
        result += `${ch} `;
      }
      return { type: 'code', content: result };
    }

    if (payload.encoding === 'utf8WithControlChars') {
      return { type: 'controlChars', content: val as string };
    }

    if (isPrimitive) {
      return { type: 'primitive', content: String(val) };
    }

    return { type: 'json', content: val };
  } catch (e) {
    const err = e as Error;
    const msg = err.message !== undefined ? err.message : String(e);
    return { type: 'error', content: msg };
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
export const PayloadComponent = (p: { payload: Payload; loadLargeMessage: () => Promise<void> }) => {
  const { payload, loadLargeMessage } = p;
  const toast = useToast();
  const [isLoadingLargeMessage, setLoadingLargeMessage] = useState(false);
  const renderData = useMemo(() => preparePayloadData(payload), [payload]);

  if (payload.isPayloadTooLarge) {
    return (
      <Flex flexDirection="column" gap="4">
        <Flex alignItems="center" gap="2">
          Because this message size exceeds the display limit, loading it could cause performance degradation.
        </Flex>
        <Button
          data-testid="load-anyway-button"
          isLoading={isLoadingLargeMessage}
          loadingText="Loading..."
          onClick={() => {
            setLoadingLargeMessage(true);
            loadLargeMessage()
              .catch((err) =>
                toast({
                  status: 'error',
                  description: err instanceof Error ? err.message : String(err),
                })
              )
              .finally(() => setLoadingLargeMessage(false));
          }}
          size="small"
          variant="outline"
          width="10rem"
        >
          Load anyway
        </Button>
      </Flex>
    );
  }

  if (renderData.type === 'null') {
    return <code>null</code>;
  }
  if (renderData.type === 'code') {
    return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{renderData.content}</code>;
  }
  if (renderData.type === 'rawBytesUnavailable') {
    return <div>Raw bytes not available</div>;
  }
  if (renderData.type === 'controlChars') {
    return (
      <div className="codeBox" data-testid="payload-content">
        {highlightControlChars(renderData.content)}
      </div>
    );
  }
  if (renderData.type === 'primitive') {
    return (
      <div className="codeBox" data-testid="payload-content">
        {renderData.content}
      </div>
    );
  }
  if (renderData.type === 'json') {
    // Avro JSON encodes bytes fields as \u00XX escape sequences. Re-escape
    // Latin-1 code points in the viewer so copy-paste yields the original
    // bytes rather than their UTF-8 encoding.
    return <KowlJsonView escapeLatin1={payload.encoding === 'avro'} srcObj={renderData.content} />;
  }
  return <span style={{ color: 'red' }}>Error in RenderExpandedMessage: {renderData.content}</span>;
};
