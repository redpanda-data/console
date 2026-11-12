/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { TroubleshootReport } from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import type { CompressionTypeNumType, CompressionTypeType } from '../state/rest-interfaces';

export type MessageDataType =
  | 'null'
  | 'avro'
  | 'protobuf'
  | 'protobufSchema'
  | 'protobufBSR'
  | 'json'
  | 'jsonSchema'
  | 'xml'
  | 'text'
  | 'utf8WithControlChars'
  | 'consumerOffsets'
  | 'binary'
  | 'msgpack'
  | 'uint'
  | 'smile'
  | 'cbor';

export type Payload = {
  payload: unknown; // json obj
  isPayloadNull: boolean;
  encoding?: MessageDataType; // actual format of the message (before the backend converted it to json)
  schemaId: number;
  size: number;

  troubleshootReport?: TroubleshootReport[];
  isPayloadTooLarge?: boolean;
  normalizedPayload?: Uint8Array; // used to show hex bytes if payload couldn't be decoded
  rawBytes?: Uint8Array;
};

export type TopicMessage = {
  partitionID: number;
  offset: number;
  timestamp: number;

  compression: CompressionTypeType;
  isTransactional: boolean;

  headers: {
    key: string;
    value: Payload;
  }[];
  key: Payload;
  value: Payload;

  // Added by the frontend
  valueJson: string; // Value json is what is used for (local) filtering
  valueBinHexPreview?: string;
  keyJson: string;
  keyBinHexPreview?: string;
};

export type ListMessageResponse = {
  elapsedMs: number;
  fetchedMessages: number;
  isCancelled: boolean;
  messages: TopicMessage[];
};

export type GetTopicMessagesResponse = {
  kafkaMessages: ListMessageResponse;
};

export type GetTopicOffsetsByTimestampRequest = {
  topics: GetTopicOffsetsByTimestampRequestTopic[];
  timestamp: number; // unix ms
};

export type GetTopicOffsetsByTimestampRequestTopic = {
  topicName: string;
  partitionIds: number[];
};

export type GetTopicOffsetsByTimestampResponse = {
  topicOffsets: TopicOffset[];
};

export type TopicOffset = {
  topicName: string;
  partitions: PartitionOffset[];
};

export type PartitionOffset = {
  error: string | undefined;
  partitionId: number;

  // will return the first message after the given timestamp
  // if there is no message at or after this timestamp, the offset will be -1
  offset: number;

  // unix ms
  // if offset is not -1, this will tell us the timestamp of that message
  timestamp: number;
};

export type PublishRecordsRequest = {
  // TopicNames is a list of topic names into which the records shall be produced to.
  topicNames: string[];

  // CompressionType that shall be used when producing the records to Kafka.
  compressionType: CompressionTypeNumType;

  // UseTransactions indicates whether we should produce the records transactional. If only one record shall
  // be produced this option should always be false.
  useTransactions: boolean;

  // Records contains one or more records (key, value, headers) that shall be produced.
  records: PublishRecord[];
};

export type PublishRecord = {
  key: string; // base64
  value: null | string; // base64

  headers: {
    key: string; // base64
    value: string; // base64
  }[];

  partitionId: number; // -1 for automatic
};

export type ProduceRecordsResponse = {
  records: ProduceRecordResponse[];
  // Error indicates that producing for all records have failed. E.g. because creating a transaction has failed
  // when transactions were enabled. Another option could be that the Kafka client creation has failed because
  // brokers are temporarily offline.
  error?: string;
};

export type ProduceRecordResponse = {
  topicName: string;
  partitionId: number;
  offset: number;
  error?: string;
};

export type DeleteRecordsResponseData = {
  topicName: string;
  partitions: [
    {
      partitionId: number;
      lowWaterMark: number;
      error: string;
    },
  ];
};

export type TopicConsumer = {
  groupId: string;
  summedLag: number;
};

export type GetTopicConsumersResponse = {
  topicName: string;
  topicConsumers: TopicConsumer[];
};
