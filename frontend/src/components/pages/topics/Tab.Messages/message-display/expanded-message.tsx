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
import type { FC, ReactNode } from 'react';

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
  <Flex gap={2} justifyContent="flex-end" my={4}>
    {children}
    {Boolean(onDownloadRecord) && (
      <Button onClick={onDownloadRecord} variant="outline">
        Download Record
      </Button>
    )}
  </Flex>
);

export const ExpandedMessage: FC<{
  msg: TopicMessage;
  loadLargeMessage: () => Promise<void>;
  onDownloadRecord?: () => void;
  onCopyKey?: (original: TopicMessage) => void;
  onCopyValue?: (original: TopicMessage) => void;
}> = ({ msg, loadLargeMessage, onDownloadRecord, onCopyKey, onCopyValue }) => {
  const bg = useColorModeValue('gray.50', 'gray.600');

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
                <PayloadComponent loadLargeMessage={loadLargeMessage} payload={msg.key} />
                <ExpandedMessageFooter onDownloadRecord={onDownloadRecord}>
                  {Boolean(onCopyKey) && (
                    <Button isDisabled={msg.key.isPayloadNull} onClick={() => onCopyKey(msg)} variant="outline">
                      Copy Key
                    </Button>
                  )}
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
                <PayloadComponent loadLargeMessage={loadLargeMessage} payload={msg.value} />
                <ExpandedMessageFooter onDownloadRecord={onDownloadRecord}>
                  {Boolean(onCopyValue) && (
                    <Button isDisabled={msg.value.isPayloadNull} onClick={() => onCopyValue(msg)} variant="outline">
                      Copy Value
                    </Button>
                  )}
                </ExpandedMessageFooter>
              </Box>
            ),
          },
          {
            key: 'headers',
            name: <Box minWidth="6rem">{msg.headers.length === 0 ? 'Headers' : `Headers (${msg.headers.length})`}</Box>,
            isDisabled: msg.headers.length === 0,
            component: (
              <Box>
                <MessageHeaders msg={msg} />
                {Boolean(onDownloadRecord) && <ExpandedMessageFooter onDownloadRecord={onDownloadRecord} />}
              </Box>
            ),
          },
        ]}
        variant="fitted"
      />
    </Box>
  );
};
