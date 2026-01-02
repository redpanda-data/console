import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { useQuery } from '@connectrpc/connect-query';
import type {
  GetAIGatewayRequest,
  ListAIGatewaysRequest,
  ListAIGatewaysResponse,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_gateway_pb';
import {
  AIGateway_State,
  GetAIGatewayRequestSchema,
  ListAIGatewaysRequest_FilterSchema,
  ListAIGatewaysRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_gateway_pb';
import {
  getAIGateway,
  listAIGateways,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_gateway-AIGatewayService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';

const AI_GATEWAY_MAX_PAGE_SIZE = 50;

export const useListAIGatewaysQuery = (
  input?: MessageInit<ListAIGatewaysRequest>,
  options?: QueryOptions<GenMessage<ListAIGatewaysRequest>, ListAIGatewaysResponse>
) => {
  const listAIGatewaysRequest = create(ListAIGatewaysRequestSchema, {
    pageToken: '',
    pageSize: AI_GATEWAY_MAX_PAGE_SIZE,
    filter: input?.filter
      ? create(ListAIGatewaysRequest_FilterSchema, {
          nameContains: input.filter.nameContains,
          tags: input.filter.tags,
        })
      : undefined,
  });

  return useQuery(listAIGateways, listAIGatewaysRequest, {
    enabled: options?.enabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
};

export const useGetAIGatewayQuery = (
  input: MessageInit<GetAIGatewayRequest>,
  options?: QueryOptions<GenMessage<GetAIGatewayRequest>, GetAIGatewayRequest>
) => {
  const getAIGatewayRequest = create(GetAIGatewayRequestSchema, {
    id: input.id,
  });

  return useQuery(getAIGateway, getAIGatewayRequest, {
    enabled: options?.enabled && !!input.id,
  });
};

export { AIGateway_State };
