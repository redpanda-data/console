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

import { Flex, Text } from '@redpanda-data/ui';
import { InfoIcon, WarningIcon } from 'components/icons';
import { observer } from 'mobx-react';
import React, { type ReactNode } from 'react';

import type { TopicMessage } from '../../../../../state/rest-interfaces';
import type { PreviewTagV2 } from '../../../../../state/ui';
import { uiState } from '../../../../../state/ui-state';
import { cullText, prettyBytes } from '../../../../../utils/utils';
import { EmptyBadge } from '../common/empty-badge';
import { getPreviewTags } from '../preview-settings';

export const MessagePreview = observer(
  ({
    msg,
    previewFields,
    isCompactTopic: _isCompactTopic,
    previewDisplayMode,
  }: {
    msg: TopicMessage;
    previewFields: () => PreviewTagV2[];
    isCompactTopic: boolean;
    previewDisplayMode?: 'single' | 'wrap' | 'rows';
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
  }) => {
    const value = msg.value;

    if (value.troubleshootReport && value.troubleshootReport.length > 0) {
      return (
        <Flex alignItems="center" color="red.600" gap="2">
          <WarningIcon fontSize="1.25em" />
          There were issues deserializing the value
        </Flex>
      );
    }

    if (value.isPayloadTooLarge) {
      return (
        <Flex alignItems="center" color="blue.500" gap="2">
          <InfoIcon fontSize="1.25em" />
          Message size exceeds the display limit.
        </Flex>
      );
    }

    const isPrimitive =
      typeof value.payload === 'string' || typeof value.payload === 'number' || typeof value.payload === 'boolean';

    try {
      let text: ReactNode = <></>;

      if (value.isPayloadNull) {
        return <EmptyBadge mode="null" />;
      }
      if (
        value.encoding === 'null' ||
        value.payload === null ||
        (typeof value.payload === 'string' && value.payload.length === 0)
      ) {
        return <EmptyBadge mode="empty" />;
      }
      if (msg.value.encoding === 'binary') {
        // If the original data was binary, display as hex dump
        text = msg.valueBinHexPreview as React.ReactNode;
      } else if (isPrimitive) {
        // If we can show the value as a primitive, do so.
        text = value.payload as React.ReactNode;
      } else {
        // Only thing left is 'object'
        // Stuff like 'bigint', 'function', or 'symbol' would not have been deserialized
        const previewTags = previewFields().filter((t) => t.searchInMessageValue);
        if (previewTags.length > 0) {
          const caseSensitive = uiState.topicSettings.previewTagsCaseSensitive === 'caseSensitive';
          const tags = getPreviewTags(value.payload as Record<string, unknown>, previewTags, caseSensitive);
          const displayMode = previewDisplayMode ?? uiState.topicSettings.previewDisplayMode;
          text = (
            <span className="cellDiv fade" style={{ fontSize: '95%' }}>
              <div className={`previewTags previewTags-${displayMode}`}>{tags}</div>
            </span>
          );
          return text;
        }
        // Normal display (json, no filters). Just stringify the whole object
        text = cullText(JSON.stringify(value.payload), 300);
      }

      return (
        <Flex flexDirection="column">
          <code>
            <span className="cellDiv" style={{ fontSize: '95%' }}>
              {text}
            </span>
          </code>
          <Text color="gray.500">
            {value.encoding?.toUpperCase() || 'UNKNOWN'} - {prettyBytes(value.size)}
          </Text>
        </Flex>
      );
    } catch (e) {
      return <span style={{ color: 'red' }}>Error in RenderPreview: {(e as Error).message ?? String(e)}</span>;
    }
  }
);
