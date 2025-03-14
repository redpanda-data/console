import type { LogEntry } from 'components/pages/agents/agent-details';
import { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import { ConsoleService } from 'protogen/redpanda/api/console/v1alpha1/console_service_connect';
import { ListMessagesRequest } from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback } from 'react';
import { useStream } from 'react-query/use-stream';
import type { Payload, TopicMessage } from 'state/restInterfaces';
import { PartitionOffsetOrigin } from 'state/ui';
import { sanitizeString } from 'utils/filterHelper';
import { encodeBase64 } from 'utils/utils';
import { useListMessagesStream } from './hooks/useListMessagesStream';

const REDPANDA_CONNECT_LOGS_TOPIC = '__redpanda.connect.logs';
const MAX_REDPANDA_CONNECT_LOGS_RESULT_COUNT = 1000;
const REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS = 5;

/**
 * Transforms a TopicMessage into a LogEntry format suitable for the DataTable
 * Safely parses JSON values and handles potential errors
 */
export const transformMessageToLogEntry = (message: TopicMessage): LogEntry => {
  // Generate a unique ID for each log entry
  const id = `${message.offset}_${message.partitionID}_${message.timestamp}`;

  // Extract information from the Payload objects
  const valueString = message.value?.payload
    ? typeof message.value.payload === 'string'
      ? message.value.payload
      : JSON.stringify(message.value.payload).substring(0, 100) +
        (JSON.stringify(message.value.payload).length > 100 ? '...' : '')
    : 'null';

  const keyString = message.key?.payload
    ? typeof message.key.payload === 'string'
      ? message.key.payload
      : JSON.stringify(message.key.payload).substring(0, 50) +
        (JSON.stringify(message.key.payload).length > 50 ? '...' : '')
    : 'null';

  // Get the size in a human-readable format
  const getSize = (payload: Payload | undefined): string => {
    if (!payload) return '0 B';
    return payload.size < 1024 ? `${payload.size} B` : `${(payload.size / 1024).toFixed(1)} KB`;
  };

  // Determine the type based on the payload
  const getType = (payload: Payload | undefined): string => {
    if (!payload) return 'null';
    return payload.encoding;
  };

  return {
    id,
    timestamp: new Date(message.timestamp).toLocaleString(),
    key: {
      value: keyString,
      type: getType(message.key),
      size: getSize(message.key),
    },
    value: {
      value: valueString,
      type: getType(message.value),
      size: getSize(message.value),
      fullData: message.value?.payload || {},
    },
  };
};

/**
 * Hook for retrieving messages related to a specific pipeline
 * @param pipelineId - The ID of the pipeline to fetch messages for
 * @returns Promise that resolves to the messages for the pipeline
 */
export const useListRedpandaConnectMessagesStream = ({ pipelineId }: { pipelineId: Pipeline['id'] }) => {
  const { searchForPipeline } = useListMessagesStream();

  const fetchMessages = useCallback(async () => {
    return searchForPipeline(REDPANDA_CONNECT_LOGS_TOPIC, pipelineId, {
      timeWindowHours: REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS,
      maxResults: MAX_REDPANDA_CONNECT_LOGS_RESULT_COUNT,
    });
  }, [pipelineId, searchForPipeline]);

  return fetchMessages();
};

// TODO: Work in progress to make it work with react-query streaming
export const useListRedpandaConnectMessagesStreamingQuery = ({ pipelineId }: { pipelineId: Pipeline['id'] }) => {
  const lastXHours = REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS;
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - lastXHours);

  const filterCode: string = `return key == "${pipelineId}";`;
  const request = new ListMessagesRequest({
    topic: REDPANDA_CONNECT_LOGS_TOPIC,
    partitionId: -1,
    startOffset: BigInt(PartitionOffsetOrigin.Timestamp),
    startTimestamp: BigInt(startTime.getTime()),
    maxResults: MAX_REDPANDA_CONNECT_LOGS_RESULT_COUNT,
    filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
  });

  return useStream(
    {
      ...ConsoleService.methods.listMessages,
      service: ConsoleService,
    },
    request,
  );
};
