import { proto3 } from '@bufbuild/protobuf';
import { config as appConfig } from 'config';
import {
  PayloadEncoding,
  CompressionType as ProtoCompressionType,
} from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import { ListMessagesRequest } from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { useCallback } from 'react';
import type { Payload, TopicMessage } from 'state/restInterfaces';
import { CompressionType } from 'state/restInterfaces';
import { PartitionOffsetOrigin } from 'state/ui';
import { sanitizeString } from 'utils/filterHelper';
import { encodeBase64 } from 'utils/utils';

interface SearchOptions {
  timeWindowHours?: number;
  maxResults?: number;
  ignoreSizeLimit?: boolean;
  includeRawPayload?: boolean;
}

/**
 * Hook for searching messages in a topic with specific filters
 * @returns A function to search for messages in a topic filtered by pipeline ID
 */
export const useListMessagesStream = () => {
  /**
   * Searches for messages related to a specific pipeline
   * @param topicName - Name of the topic to search in
   * @param pipelineId - ID of the pipeline to filter by
   * @param options - Search configuration options
   * @returns Promise that resolves to an array of TopicMessages
   */
  const searchForPipeline = useCallback(
    async (topicName: string, pipelineId: string, options: SearchOptions = {}): Promise<TopicMessage[]> => {
      const { timeWindowHours = 5, maxResults = 1000, ignoreSizeLimit = false, includeRawPayload = false } = options;

      // Create filter code for the pipeline ID
      const filterCode = `return key == "${pipelineId}";`;

      // Calculate timestamp for the start time window
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - timeWindowHours);

      // Create the request
      const request = new ListMessagesRequest({
        topic: topicName,
        partitionId: -1,
        startOffset: BigInt(PartitionOffsetOrigin.Timestamp),
        startTimestamp: BigInt(startTime.getTime()),
        maxResults,
        filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
        ignoreMaxSizeLimit: ignoreSizeLimit,
        includeOriginalRawPayload: includeRawPayload,
        keyDeserializer: PayloadEncoding.UNSPECIFIED,
        valueDeserializer: PayloadEncoding.UNSPECIFIED,
      });

      // Collect all messages
      const messages: TopicMessage[] = [];

      // Create abort controller for manual termination if needed
      const abortController = new AbortController();

      // Set timeout to prevent infinite streaming (30 seconds)
      const timeoutMs = 30000;

      return new Promise<TopicMessage[]>((resolve, reject) => {
        // Use timeout to ensure the stream doesn't run indefinitely
        const timeout = setTimeout(() => {
          abortController.abort('Timeout reached');
          resolve(messages);
        }, timeoutMs);

        // Set up the stream
        const client = appConfig.consoleClient;
        if (!client) {
          clearTimeout(timeout);
          reject(new Error('No console client configured'));
          return;
        }

        try {
          // Create the streaming connection
          const streamPromise = client.listMessages(request, {
            timeoutMs,
            signal: abortController.signal,
          });

          // Process the stream
          (async () => {
            try {
              for await (const res of streamPromise) {
                if (abortController.signal.aborted) break;

                try {
                  if (res.controlMessage.case === 'data') {
                    // Convert proto message to TopicMessage
                    const message = convertProtoToTopicMessage(res.controlMessage.value);
                    if (message) {
                      messages.push(message);
                    }
                  } else if (res.controlMessage.case === 'phase') {
                    console.log(`Stream phase: ${res.controlMessage.value.phase}`);
                  } else if (res.controlMessage.case === 'progress') {
                    console.log(`Stream progress: ${res.controlMessage.value.messagesConsumed}`);
                  } else if (res.controlMessage.case === 'done') {
                    // Stream is done, clear timeout and resolve
                    clearTimeout(timeout);
                    abortController.abort('Stream completed');
                    resolve(messages);
                    break;
                  } else if (res.controlMessage.case === 'error') {
                    // Stream had an error, clear timeout and reject
                    clearTimeout(timeout);
                    abortController.abort('Stream error');
                    reject(new Error(res.controlMessage.value.message));
                    break;
                  }
                } catch (error) {
                  console.error('Error processing message:', error);
                }
              }

              // If we exited the loop normally and haven't resolved yet, resolve now
              if (!abortController.signal.aborted) {
                clearTimeout(timeout);
                resolve(messages);
              }
            } catch (e) {
              if (!abortController.signal.aborted) {
                clearTimeout(timeout);
                reject(e);
              }
            }
          })();
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    },
    [],
  );

  return { searchForPipeline };
};

/**
 * Converts a protobuf message to a TopicMessage object
 * @param protoMessage - The protobuf message to convert
 * @returns A TopicMessage object
 */
function convertProtoToTopicMessage(protoMessage: any): TopicMessage | null {
  try {
    const message = {} as TopicMessage;
    message.partitionID = protoMessage.partitionId;

    message.compression = CompressionType.Unknown;
    switch (protoMessage.compression) {
      case ProtoCompressionType.UNCOMPRESSED:
        message.compression = CompressionType.Uncompressed;
        break;
      case ProtoCompressionType.GZIP:
        message.compression = CompressionType.GZip;
        break;
      case ProtoCompressionType.SNAPPY:
        message.compression = CompressionType.Snappy;
        break;
      case ProtoCompressionType.LZ4:
        message.compression = CompressionType.LZ4;
        break;
      case ProtoCompressionType.ZSTD:
        message.compression = CompressionType.ZStd;
        break;
    }

    message.offset = Number(protoMessage.offset);
    message.timestamp = Number(protoMessage.timestamp);
    message.isTransactional = protoMessage.isTransactional;
    message.headers = [];

    for (const header of protoMessage.headers) {
      message.headers.push({
        key: header.key,
        value: {
          payload: JSON.stringify(new TextDecoder().decode(header.value)),
          encoding: 'text',
          schemaId: 0,
          size: header.value.length,
          isPayloadNull: header.value == null,
        },
      });
    }

    // Process key
    const key = protoMessage.key;
    const keyPayload = new TextDecoder().decode(key?.normalizedPayload);

    message.key = {} as Payload;
    message.key.rawBytes = key?.originalPayload;

    switch (key?.encoding) {
      case PayloadEncoding.NULL:
        message.key.encoding = 'null';
        break;
      case PayloadEncoding.BINARY:
        message.key.encoding = 'binary';
        break;
      case PayloadEncoding.XML:
        message.key.encoding = 'xml';
        break;
      case PayloadEncoding.AVRO:
        message.key.encoding = 'avro';
        break;
      case PayloadEncoding.JSON:
        message.key.encoding = 'json';
        break;
      case PayloadEncoding.PROTOBUF:
        message.key.encoding = 'protobuf';
        break;
      case PayloadEncoding.MESSAGE_PACK:
        message.key.encoding = 'msgpack';
        break;
      case PayloadEncoding.TEXT:
        message.key.encoding = 'text';
        break;
      case PayloadEncoding.UTF8:
        message.key.encoding = 'utf8WithControlChars';
        break;
      case PayloadEncoding.UINT:
        message.key.encoding = 'uint';
        break;
      case PayloadEncoding.SMILE:
        message.key.encoding = 'smile';
        break;
      case PayloadEncoding.CONSUMER_OFFSETS:
        message.key.encoding = 'consumerOffsets';
        break;
      case PayloadEncoding.CBOR:
        message.key.encoding = 'cbor';
        break;
      default:
        console.log('Unhandled key encoding type', {
          encoding: key?.encoding,
          encodingName:
            key?.encoding != null ? proto3.getEnumType(PayloadEncoding).findNumber(key.encoding)?.localName : undefined,
        });
    }

    message.key.isPayloadNull = key?.encoding === PayloadEncoding.NULL;
    message.key.payload = keyPayload;
    message.key.normalizedPayload = key?.normalizedPayload;

    try {
      message.key.payload = JSON.parse(keyPayload);
    } catch {}

    message.key.troubleshootReport = key?.troubleshootReport;
    message.key.schemaId = key?.schemaId ?? 0;
    message.keyJson = JSON.stringify(message.key.payload);
    message.key.size = Number(key?.payloadSize);
    message.key.isPayloadTooLarge = key?.isPayloadTooLarge;

    // Process value
    const val = protoMessage.value;
    const valuePayload = new TextDecoder().decode(val?.normalizedPayload);

    message.value = {} as Payload;
    message.value.payload = valuePayload;
    message.value.normalizedPayload = val?.normalizedPayload;
    message.value.rawBytes = val?.originalPayload;

    switch (val?.encoding) {
      case PayloadEncoding.NULL:
        message.value.encoding = 'null';
        break;
      case PayloadEncoding.BINARY:
        message.value.encoding = 'binary';
        break;
      case PayloadEncoding.XML:
        message.value.encoding = 'xml';
        break;
      case PayloadEncoding.AVRO:
        message.value.encoding = 'avro';
        break;
      case PayloadEncoding.JSON:
        message.value.encoding = 'json';
        break;
      case PayloadEncoding.PROTOBUF:
        message.value.encoding = 'protobuf';
        break;
      case PayloadEncoding.MESSAGE_PACK:
        message.value.encoding = 'msgpack';
        break;
      case PayloadEncoding.TEXT:
        message.value.encoding = 'text';
        break;
      case PayloadEncoding.UTF8:
        message.value.encoding = 'utf8WithControlChars';
        break;
      case PayloadEncoding.UINT:
        message.value.encoding = 'uint';
        break;
      case PayloadEncoding.SMILE:
        message.value.encoding = 'smile';
        break;
      case PayloadEncoding.CONSUMER_OFFSETS:
        message.value.encoding = 'consumerOffsets';
        break;
      case PayloadEncoding.CBOR:
        message.value.encoding = 'cbor';
        break;
      default:
        console.log('Unhandled value encoding type', {
          encoding: val?.encoding,
          encodingName:
            val?.encoding != null ? proto3.getEnumType(PayloadEncoding).findNumber(val.encoding)?.localName : undefined,
        });
    }

    message.value.schemaId = val?.schemaId ?? 0;
    message.value.troubleshootReport = val?.troubleshootReport;
    message.value.isPayloadNull = val?.encoding === PayloadEncoding.NULL;
    message.valueJson = valuePayload;
    message.value.isPayloadTooLarge = val?.isPayloadTooLarge;

    try {
      message.value.payload = JSON.parse(valuePayload);
    } catch {}

    message.valueJson = JSON.stringify(message.value.payload);
    message.value.size = Number(val?.payloadSize);

    return message;
  } catch (error) {
    console.error('Error converting proto message to TopicMessage:', error);
    return null;
  }
}
