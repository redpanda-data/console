import {
  type GetServerlessClusterRequest,
  GetServerlessClusterRequestSchema,
  type GetServerlessClusterResponse,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/serverless_pb';
import { getServerlessCluster } from '@buf/redpandadata_cloud.connectrpc_query-es/redpanda/api/controlplane/v1/serverless-ServerlessClusterService_connectquery';
import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv2';
import { useQuery } from '@connectrpc/connect-query';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';
import { isUuid } from 'utils/uuid.utils';

export const useGetServerlessClusterQuery = (
  input: MessageInit<GetServerlessClusterRequest>,
  options?: QueryOptions<GenMessage<GetServerlessClusterResponse>>
) => {
  const getServerlessClusterRequest = create(GetServerlessClusterRequestSchema, input);

  return useQuery(getServerlessCluster, getServerlessClusterRequest, {
    ...options,
    enabled: options?.enabled && getServerlessClusterRequest?.id !== '' && !isUuid(getServerlessClusterRequest?.id), // Don't call query if it's a cluster UUID instead of XID
  });
};
