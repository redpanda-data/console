import {
  Box,
  Button,
  Code,
  HStack,
  Tabs as RpTabs,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Tr,
  useColorModeValue,
  useToast,
} from '@redpanda-data/ui';
import { KowlJsonView } from 'components/misc/KowlJsonView';
import { type FC, type ReactNode, useMemo, useState } from 'react';
import { navigatorClipboardErrorHandler } from 'utils/tsxUtils';
import type { LogEntry } from './agent-details';

function getPayloadAsString(value: string | Uint8Array | object): string {
  if (value == null) return '';

  if (typeof value === 'string') return value;

  if (value instanceof Uint8Array) return JSON.stringify(Array.from(value), null, 4);

  return JSON.stringify(value, null, 4);
}
interface AgentExpandedMessageProps {
  msg: LogEntry;
  loadLargeMessage?: () => Promise<void>;
}

/**
 * ExpandedMessageFooter displays actions related to the expanded message
 */
const ExpandedMessageFooter: FC<{
  children?: ReactNode;
}> = ({ children }) => {
  return (
    <HStack spacing={2} justifyContent="flex-end" mt={4}>
      {children}
    </HStack>
  );
};

/**
 * Displays message payload using appropriate format based on type
 */
const PayloadComponent: FC<{
  payload: unknown;
  loadLargeMessage?: () => Promise<void>;
}> = ({ payload, loadLargeMessage }) => {
  try {
    if (payload == null) {
      return <Text color="gray.500">No payload</Text>;
    }

    const isPrimitive = typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean';

    if (isPrimitive) {
      return (
        <Box className="codeBox" data-testid="payload-content">
          {String(payload)}
        </Box>
      );
    }

    return <KowlJsonView srcObj={payload} />;
  } catch (e) {
    return <Text color="red.500">Error displaying payload: {(e as Error).message ?? String(e)}</Text>;
  }
};

/**
 * Message headers display table
 */
const MessageHeaders: FC<{ msg: LogEntry }> = ({ msg }) => {
  const headers = useMemo(() => {
    if (msg.value.fullData && typeof msg.value.fullData === 'object' && 'headers' in msg.value.fullData) {
      return Array.isArray(msg.value.fullData.headers) ? msg.value.fullData.headers : [];
    }
    return [];
  }, [msg]);

  if (headers.length === 0) {
    return <Text color="gray.500">No headers</Text>;
  }

  return (
    <Table size="sm" variant="simple">
      <Tbody>
        {headers.map((header: { key: string; value: string }, idx: number) => (
          <Tr key={idx}>
            <Th width="150px">{header.key}</Th>
            <Td>{header.value}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
};

export const AgentExpandedMessage: FC<AgentExpandedMessageProps> = ({ msg, loadLargeMessage }) => {
  const toast = useToast();

  const bg = useColorModeValue('gray.50', 'gray.600');

  // Calculate the number of headers for display in the tab
  const headers = useMemo(() => {
    if (msg.value.fullData && typeof msg.value.fullData === 'object' && 'headers' in msg.value.fullData) {
      return Array.isArray(msg.value.fullData.headers) ? msg.value.fullData.headers : [];
    }
    return [];
  }, [msg]);

  return (
    <Box bg={bg} py={6} px={10}>
      <RpTabs
        variant="line"
        isFitted
        defaultIndex={1}
        items={[
          {
            key: 'key',
            name: <Box minWidth="6rem">{!msg.key || msg.key.size === '0' ? 'Key' : `Key (${msg.key.size})`}</Box>,
            isDisabled: !msg.key || !msg.key.value,
            component: (
              <Box>
                <Code>{msg.key.value}</Code>
                <ExpandedMessageFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(getPayloadAsString(msg.key.value))
                        .then(() => {
                          toast({
                            status: 'success',
                            description: 'Key copied to clipboard',
                          });
                        })
                        .catch(navigatorClipboardErrorHandler);
                    }}
                    isDisabled={!msg.key || !msg.key.value}
                  >
                    Copy Key
                  </Button>
                </ExpandedMessageFooter>
              </Box>
            ),
          },
          {
            key: 'value',
            name: (
              <Box minWidth="6rem">{!msg.value || msg.value.size === '0' ? 'Value' : `Value (${msg.value.size})`}</Box>
            ),
            component: (
              <Box>
                <PayloadComponent payload={msg.value.fullData || msg.value.value} loadLargeMessage={loadLargeMessage} />
                <ExpandedMessageFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(getPayloadAsString(msg.value.fullData || msg.value.value))
                        .then(() => {
                          toast({
                            status: 'success',
                            description: 'Value copied to clipboard',
                          });
                        })
                        .catch(navigatorClipboardErrorHandler);
                    }}
                    isDisabled={!msg.value || !msg.value.value}
                  >
                    Copy Value
                  </Button>
                </ExpandedMessageFooter>
              </Box>
            ),
          },
          {
            key: 'headers',
            name: <Box minWidth="6rem">{headers.length === 0 ? 'Headers' : `Headers (${headers.length})`}</Box>,
            isDisabled: headers.length === 0,
            component: (
              <Box>
                <MessageHeaders msg={msg} />
              </Box>
            ),
          },
        ]}
      />
    </Box>
  );
};
