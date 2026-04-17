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

import { Box, Button, Flex, Tabs as RpTabs, useColorModeValue } from '@redpanda-data/ui';
import React, { type FC, type ReactNode, useCallback } from 'react';

import { MessageHeaders } from './message-headers';
import { MessageMetaData } from './message-meta-data';
import { PayloadComponent } from './payload-component';
import { TroubleshootReportViewer } from './troubleshoot-report-viewer';
import type { TopicMessage } from '../../../../../state/rest-interfaces';
import { prettyBytes } from '../../../../../utils/utils';

const ExpandedMessageFooter: FC<{ children?: ReactNode; onDownloadRecord?: () => void }> = ({
  children,
  onDownloadRecord,
}) => (
  <Flex gap={2} my={4} style={{ justifyContent: 'flex-end' }}>
    {children}
    {Boolean(onDownloadRecord) && (
      <Button onClick={onDownloadRecord} variant="outline">
        Download Record
      </Button>
    )}
  </Flex>
);

type ExpandedMessageProps = {
  msg: TopicMessage;
  loadLargeMessage?: () => Promise<void>;
  onDownloadRecord?: () => void;
  topicName?: string;
  onLoadLargeMessage?: (topicName: string, partitionID: number, offset: number) => Promise<void>;
  onSetDownloadMessages?: (messages: TopicMessage[]) => void;
  onCopyKey?: (original: TopicMessage) => void;
  onCopyValue?: (original: TopicMessage) => void;
};

export const ExpandedMessage: FC<ExpandedMessageProps> = React.memo(
  ({
    msg,
    loadLargeMessage,
    onDownloadRecord,
    topicName,
    onLoadLargeMessage,
    onSetDownloadMessages,
    onCopyKey,
    onCopyValue,
  }) => {
    const bg = useColorModeValue('gray.50', 'gray.600');
    const handleLoadLargeMessage = useCallback(
      () =>
        onLoadLargeMessage && topicName !== undefined
          ? onLoadLargeMessage(topicName, msg.partitionID, msg.offset)
          : (loadLargeMessage?.() ?? Promise.resolve()),
      [loadLargeMessage, msg.offset, msg.partitionID, onLoadLargeMessage, topicName]
    );
    const handleDownloadRecord = useCallback(() => {
      if (onSetDownloadMessages) {
        onSetDownloadMessages([msg]);
        return;
      }
      onDownloadRecord?.();
    }, [msg, onDownloadRecord, onSetDownloadMessages]);
    const handleCopyKey = useCallback(() => {
      onCopyKey?.(msg);
    }, [msg, onCopyKey]);
    const handleCopyValue = useCallback(() => {
      onCopyValue?.(msg);
    }, [msg, onCopyValue]);

    return (
      <Box bg={bg} px={10} py={6}>
        <MessageMetaData msg={msg} />
        <RpTabs
          defaultIndex={1}
          isFitted
          items={[
            {
              key: 'key',
              name: (
                <Box minWidth="6rem">
                  {msg.key === null || msg.key.size === 0 ? 'Key' : `Key (${prettyBytes(msg.key.size)})`}
                </Box>
              ),
              isDisabled: msg.key === null || msg.key.size === 0,
              component: (
                <Box>
                  <TroubleshootReportViewer payload={msg.key} />
                  <PayloadComponent loadLargeMessage={handleLoadLargeMessage} payload={msg.key} />
                  <ExpandedMessageFooter onDownloadRecord={handleDownloadRecord}>
                    {onCopyKey ? (
                      <Button isDisabled={msg.key.isPayloadNull} onClick={handleCopyKey} variant="outline">
                        Copy Key
                      </Button>
                    ) : null}
                  </ExpandedMessageFooter>
                </Box>
              ),
            },
            {
              key: 'value',
              name: (
                <Box minWidth="6rem">
                  {msg.value === null || msg.value.size === 0 ? 'Value' : `Value (${prettyBytes(msg.value.size)})`}
                </Box>
              ),
              component: (
                <Box>
                  <TroubleshootReportViewer payload={msg.value} />
                  <PayloadComponent loadLargeMessage={handleLoadLargeMessage} payload={msg.value} />
                  <ExpandedMessageFooter onDownloadRecord={handleDownloadRecord}>
                    {onCopyValue ? (
                      <Button isDisabled={msg.value.isPayloadNull} onClick={handleCopyValue} variant="outline">
                        Copy Value
                      </Button>
                    ) : null}
                  </ExpandedMessageFooter>
                </Box>
              ),
            },
            {
              key: 'headers',
              name: (
                <Box minWidth="6rem">{msg.headers.length === 0 ? 'Headers' : `Headers (${msg.headers.length})`}</Box>
              ),
              isDisabled: msg.headers.length === 0,
              component: (
                <Box>
                  <MessageHeaders msg={msg} />
                  {onSetDownloadMessages || onDownloadRecord ? (
                    <ExpandedMessageFooter onDownloadRecord={handleDownloadRecord} />
                  ) : null}
                </Box>
              ),
            },
          ]}
          variant="fitted"
        />
      </Box>
    );
  }
);
ExpandedMessage.displayName = 'ExpandedMessage';
