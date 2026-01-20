import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { useQuery } from '@connectrpc/connect-query';
import {
  type ListAIGatewaysRequest,
  ListAIGatewaysRequest_FilterSchema,
  ListAIGatewaysRequestSchema,
  type ListAIGatewaysResponse,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_gateway_pb';
import { listAIGateways } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_gateway-AIGatewayService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';

const AI_GATEWAY_DEFAULT_PAGE_SIZE = 50;

export const useListAIGatewaysQuery = (
  input?: MessageInit<ListAIGatewaysRequest>,
  options?: QueryOptions<GenMessage<ListAIGatewaysRequest>, ListAIGatewaysResponse>
) => {
  const listAIGatewaysRequest = create(ListAIGatewaysRequestSchema, {
    pageToken: '',
    pageSize: input?.pageSize ?? AI_GATEWAY_DEFAULT_PAGE_SIZE,
    filter: input?.filter
      ? create(ListAIGatewaysRequest_FilterSchema, {
          nameContains: input.filter.nameContains,
          tags: input.filter.tags,
          secretId: input.filter.secretId,
        })
      : undefined,
  });

  return useQuery(listAIGateways, listAIGatewaysRequest, {
    enabled: options?.enabled,
  });
};
