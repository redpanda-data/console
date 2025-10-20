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

import { WarningIcon } from '@chakra-ui/icons';
import { Flex, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import React, { type ReactNode } from 'react';

import type { TopicMessage } from '../../../../../state/rest-interfaces';
import type { PreviewTagV2 } from '../../../../../state/ui';
import { uiState } from '../../../../../state/ui-state';
import { cullText, prettyBytes } from '../../../../../utils/utils';
import { EmptyBadge } from '../common/empty-badge';
import { getPreviewTags } from '../preview-settings';

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

function getControlCharacterName(code: number): string {
  switch (code) {
    case 0:
      return 'NUL';
    case 1:
      return 'SOH';
    case 2:
      return 'STX';
    case 3:
      return 'ETX';
    case 4:
      return 'EOT';
    case 5:
      return 'ENQ';
    case 6:
      return 'ACK';
    case 7:
      return 'BEL';
    case 8:
      return 'BS';
    case 9:
      return 'HT';
    case 10:
      return 'LF';
    case 11:
      return 'VT';
    case 12:
      return 'FF';
    case 13:
      return 'CR';
    case 14:
      return 'SO';
    case 15:
      return 'SI';
    case 16:
      return 'DLE';
    case 17:
      return 'DC1';
    case 18:
      return 'DC2';
    case 19:
      return 'DC3';
    case 20:
      return 'DC4';
    case 21:
      return 'NAK';
    case 22:
      return 'SYN';
    case 23:
      return 'ETB';
    case 24:
      return 'CAN';
    case 25:
      return 'EM';
    case 26:
      return 'SUB';
    case 27:
      return 'ESC';
    case 28:
      return 'FS';
    case 29:
      return 'GS';
    case 30:
      return 'RS';
    case 31:
      return 'US';
    default:
      return '';
  }
}

export const MessageKeyPreview = observer(
  ({ msg, previewFields }: { msg: TopicMessage; previewFields: () => PreviewTagV2[] }) => {
    const key = msg.key;

    if (key.troubleshootReport && key.troubleshootReport.length > 0) {
      return (
        <Flex alignItems="center" color="red.600" gap="2">
          <WarningIcon fontSize="1.25em" />
          There were issues deserializing the key
        </Flex>
      );
    }

    const isPrimitive =
      typeof key.payload === 'string' || typeof key.payload === 'number' || typeof key.payload === 'boolean';
    try {
      if (key.isPayloadNull) {
        return <EmptyBadge mode="null" />;
      }
      if (key.payload == null || (typeof key.payload === 'string' && key.payload.length === 0)) {
        return <EmptyBadge mode="empty" />;
      }

      let text: ReactNode = <></>;

      if (key.encoding === 'binary') {
        text = cullText(msg.keyBinHexPreview as string, 44);
      } else if (key.encoding === 'utf8WithControlChars') {
        text = highlightControlChars(key.payload as string);
      } else if (isPrimitive) {
        text = cullText(key.payload as string, 44);
      } else {
        // Only thing left is 'object'
        // Stuff like 'bigint', 'function', or 'symbol' would not have been deserialized
        const previewTags = previewFields().filter((t) => t.searchInMessageValue);
        if (previewTags.length > 0) {
          const tags = getPreviewTags(key.payload as Record<string, unknown>, previewTags);
          text = (
            <span className="cellDiv fade" style={{ fontSize: '95%' }}>
              <div className={`previewTags previewTags-${uiState.topicSettings.previewDisplayMode}`}>
                {tags.map((t, i) => (
                  <React.Fragment key={i}>{t}</React.Fragment>
                ))}
              </div>
            </span>
          );
          return text;
        }
        // Normal display (json, no filters). Just stringify the whole object
        text = cullText(JSON.stringify(key.payload), 44);
      }

      return (
        <Flex flexDirection="column">
          <span className="cellDiv" style={{ minWidth: '10ch', width: 'auto', maxWidth: '45ch' }}>
            <code style={{ fontSize: '95%' }}>{text}</code>
          </span>
          <Text color="gray.500">
            {key.encoding.toUpperCase()} - {prettyBytes(key.size)}
          </Text>
        </Flex>
      );
    } catch (e) {
      return <span style={{ color: 'red' }}>Error in RenderPreview: {(e as Error).message ?? String(e)}</span>;
    }
  }
);
