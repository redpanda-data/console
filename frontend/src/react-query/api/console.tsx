import { create } from '@bufbuild/protobuf';
import { useMutation } from '@connectrpc/connect-query';
import { publishMessage } from 'protogen/redpanda/api/console/v1alpha1/console_service-ConsoleService_connectquery';
import {
  type PublishMessagePayloadOptions,
  PublishMessagePayloadOptionsSchema,
  type PublishMessageRequest,
  PublishMessageRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/publish_messages_pb';
import type { MessageInit } from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const usePublishMessageMutation = () => {
  return useMutation(publishMessage, {
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'publish',
        entity: 'message',
      });
    },
  });
};

/**
 * Helper function to create a PublishMessageRequest with payload options
 */
export const createPublishMessageRequest = (
  topic: string,
  partitionId = -1,
  key?: MessageInit<PublishMessagePayloadOptions>,
  value?: MessageInit<PublishMessagePayloadOptions>,
  headers: { key: string; value: Uint8Array }[] = [],
  useTransactions = false,
  compression = 0,
): MessageInit<PublishMessageRequest> => {
  const request = create(PublishMessageRequestSchema, {
    topic,
    partitionId,
    headers,
    useTransactions,
    compression,
  });

  if (key) {
    request.key = create(PublishMessagePayloadOptionsSchema, key);
  }

  if (value) {
    request.value = create(PublishMessagePayloadOptionsSchema, value);
  }

  return request;
};
