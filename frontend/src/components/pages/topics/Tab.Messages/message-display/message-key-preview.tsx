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
import { getControlCharacterName } from '../helpers';
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

export const MessageKeyPreview = observer(
  ({
    msg,
    previewFields,
    previewDisplayMode,
  }: {
    msg: TopicMessage;
    previewFields: () => PreviewTagV2[];
    previewDisplayMode?: 'single' | 'wrap' | 'rows';
  }) => {
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
      if (key.payload === null || (typeof key.payload === 'string' && key.payload.length === 0)) {
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
          const caseSensitive = uiState.topicSettings.previewTagsCaseSensitive === 'caseSensitive';
          const tags = getPreviewTags(key.payload as Record<string, unknown>, previewTags, caseSensitive);
          const displayMode = previewDisplayMode ?? uiState.topicSettings.previewDisplayMode;
          text = (
            <span className="cellDiv fade" style={{ fontSize: '95%' }}>
              <div className={`previewTags previewTags-${displayMode}`}>
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
            {key.encoding?.toUpperCase() || 'UNKNOWN'} - {prettyBytes(key.size)}
          </Text>
        </Flex>
      );
    } catch (e) {
      return <span style={{ color: 'red' }}>Error in RenderPreview: {(e as Error).message ?? String(e)}</span>;
    }
  }
);
