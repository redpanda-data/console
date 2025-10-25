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
import { observer } from 'mobx-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

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
      numChars++;
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

export const PayloadComponent = observer((p: { payload: Payload; loadLargeMessage: () => Promise<void> }) => {
  const { payload, loadLargeMessage } = p;
  const toast = useToast();
  const [isLoadingLargeMessage, setLoadingLargeMessage] = useState(false);

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

  try {
    if (payload === null || payload === undefined || payload.payload === null || payload.payload === undefined) {
      return <code>null</code>;
    }

    const val = payload.payload;
    const isPrimitive = typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean';

    if (payload.encoding === 'binary') {
      const mode = 'hex' as 'ascii' | 'raw' | 'hex';
      if (mode === 'raw') {
        return (
          <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{val as React.ReactNode}</code>
        );
      }
      if (mode === 'hex') {
        const rawBytes = payload.rawBytes ?? payload.normalizedPayload;

        if (rawBytes && (typeof rawBytes === 'string' || Array.isArray(rawBytes) || rawBytes instanceof Uint8Array)) {
          let result = '';
          for (const rawByte of rawBytes as Uint8Array) {
            result += `${rawByte.toString(16).padStart(2, '0')} `;
          }
          return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{result}</code>;
        }
        return <div>Raw bytes not available</div>;
      }
      const str = String(val);
      let result = '';
      for (let i = 0; i < str.length; i++) {
        let ch = String.fromCharCode(str.charCodeAt(i)); // str.charAt(i);
        ch = PRINTABLE_CHAR_REGEX.test(ch) ? ch : '. ';
        result += `${ch} `;
      }

      return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{result}</code>;
    }

    // Decode payload from base64 and render control characters as code highlighted text, such as
    // `NUL`, `ACK` etc.
    if (payload.encoding === 'utf8WithControlChars') {
      const elements = highlightControlChars(val as string);

      return (
        <div className="codeBox" data-testid="payload-content">
          {elements}
        </div>
      );
    }

    if (isPrimitive) {
      return (
        <div className="codeBox" data-testid="payload-content">
          {String(val)}
        </div>
      );
    }

    return <KowlJsonView srcObj={val} />;
  } catch (e) {
    return <span style={{ color: 'red' }}>Error in RenderExpandedMessage: {(e as Error).message ?? String(e)}</span>;
  }
});
