import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { useQuery } from '@connectrpc/connect-query';
import {
  type GetConsoleInfoRequest,
  GetConsoleInfoRequestSchema,
  type GetConsoleInfoResponse,
  type GetKafkaAuthorizerInfoRequest,
  GetKafkaAuthorizerInfoRequestSchema,
  type GetKafkaAuthorizerInfoResponse,
  type GetKafkaConnectInfoRequest,
  GetKafkaConnectInfoRequestSchema,
  type GetKafkaConnectInfoResponse,
  type GetKafkaInfoRequest,
  GetKafkaInfoRequestSchema,
  type GetKafkaInfoResponse,
  type GetRedpandaInfoRequest,
  GetRedpandaInfoRequestSchema,
  type GetRedpandaInfoResponse,
  type GetRedpandaPartitionBalancerStatusRequest,
  GetRedpandaPartitionBalancerStatusRequestSchema,
  type GetRedpandaPartitionBalancerStatusResponse,
  type GetSchemaRegistryInfoRequest,
  GetSchemaRegistryInfoRequestSchema,
  type GetSchemaRegistryInfoResponse,
} from 'protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import {
  getConsoleInfo,
  getKafkaAuthorizerInfo,
  getKafkaConnectInfo,
  getKafkaInfo,
  getRedpandaInfo,
  getRedpandaPartitionBalancerStatus,
  getSchemaRegistryInfo,
} from 'protogen/redpanda/api/console/v1alpha1/cluster_status-ClusterStatusService_connectquery';
import type { QueryOptions } from 'react-query/react-query.utils';

export const useGetKafkaInfoQuery = (options?: QueryOptions<GenMessage<GetKafkaInfoRequest>, GetKafkaInfoResponse>) => {
  const kafkaInfoRequest = create(GetKafkaInfoRequestSchema);

  return useQuery(getKafkaInfo, kafkaInfoRequest, {
    enabled: options?.enabled,
  });
};

export const useGetKafkaAuthorizerInfoQuery = (
  options?: QueryOptions<GenMessage<GetKafkaAuthorizerInfoRequest>, GetKafkaAuthorizerInfoResponse>,
) => {
  const kafkaAuthorizerInfoRequest = create(GetKafkaAuthorizerInfoRequestSchema);

  return useQuery(getKafkaAuthorizerInfo, kafkaAuthorizerInfoRequest, {
    enabled: options?.enabled,
  });
};

export const useGetRedpandaInfoQuery = (
  options?: QueryOptions<GenMessage<GetRedpandaInfoRequest>, GetRedpandaInfoResponse>,
) => {
  const redpandaInfoRequest = create(GetRedpandaInfoRequestSchema);

  return useQuery(getRedpandaInfo, redpandaInfoRequest, {
    enabled: options?.enabled,
  });
};

export const useGetRedpandaPartitionBalancerStatusQuery = (
  options?: QueryOptions<
    GenMessage<GetRedpandaPartitionBalancerStatusRequest>,
    GetRedpandaPartitionBalancerStatusResponse
  >,
) => {
  const redpandaPartitionBalancerStatusRequest = create(GetRedpandaPartitionBalancerStatusRequestSchema);

  return useQuery(getRedpandaPartitionBalancerStatus, redpandaPartitionBalancerStatusRequest, {
    enabled: options?.enabled,
  });
};

export const useGetConsoleInfoQuery = (
  options?: QueryOptions<GenMessage<GetConsoleInfoRequest>, GetConsoleInfoResponse>,
) => {
  const consoleInfoRequest = create(GetConsoleInfoRequestSchema);

  return useQuery(getConsoleInfo, consoleInfoRequest, {
    enabled: options?.enabled,
  });
};

export const useGetKafkaConnectInfoQuery = (
  options?: QueryOptions<GenMessage<GetKafkaConnectInfoRequest>, GetKafkaConnectInfoResponse>,
) => {
  const kafkaConnectInfoRequest = create(GetKafkaConnectInfoRequestSchema);

  return useQuery(getKafkaConnectInfo, kafkaConnectInfoRequest, {
    enabled: options?.enabled,
  });
};

export const useGetSchemaRegistryInfoQuery = (
  options?: QueryOptions<GenMessage<GetSchemaRegistryInfoRequest>, GetSchemaRegistryInfoResponse>,
) => {
  const schemaRegistryInfoRequest = create(GetSchemaRegistryInfoRequestSchema);

  return useQuery(getSchemaRegistryInfo, schemaRegistryInfoRequest, {
    enabled: options?.enabled,
  });
};

/**
 * Hook that fetches all cluster status information at once
 */
export const useGetAllClusterStatusQuery = (options?: {
  kafkaEnabled?: boolean;
  authorizerEnabled?: boolean;
  redpandaEnabled?: boolean;
  partitionBalancerEnabled?: boolean;
  consoleEnabled?: boolean;
  kafkaConnectEnabled?: boolean;
  schemaRegistryEnabled?: boolean;
}) => {
  const kafkaInfoQuery = useGetKafkaInfoQuery({
    enabled: options?.kafkaEnabled,
  });

  const authorizerInfoQuery = useGetKafkaAuthorizerInfoQuery({
    enabled: options?.authorizerEnabled,
  });

  const redpandaInfoQuery = useGetRedpandaInfoQuery({
    enabled: options?.redpandaEnabled,
  });

  const partitionBalancerQuery = useGetRedpandaPartitionBalancerStatusQuery({
    enabled: options?.partitionBalancerEnabled,
  });

  const consoleInfoQuery = useGetConsoleInfoQuery({
    enabled: options?.consoleEnabled,
  });

  const kafkaConnectInfoQuery = useGetKafkaConnectInfoQuery({
    enabled: options?.kafkaConnectEnabled,
  });

  const schemaRegistryInfoQuery = useGetSchemaRegistryInfoQuery({
    enabled: options?.schemaRegistryEnabled,
  });

  const isLoading =
    kafkaInfoQuery.isLoading ||
    authorizerInfoQuery.isLoading ||
    redpandaInfoQuery.isLoading ||
    partitionBalancerQuery.isLoading ||
    consoleInfoQuery.isLoading ||
    kafkaConnectInfoQuery.isLoading ||
    schemaRegistryInfoQuery.isLoading;

  const isError =
    kafkaInfoQuery.isError ||
    authorizerInfoQuery.isError ||
    redpandaInfoQuery.isError ||
    partitionBalancerQuery.isError ||
    consoleInfoQuery.isError ||
    kafkaConnectInfoQuery.isError ||
    schemaRegistryInfoQuery.isError;

  return {
    isLoading,
    isError,
    kafka: kafkaInfoQuery.data,
    authorizer: authorizerInfoQuery.data,
    redpanda: redpandaInfoQuery.data,
    partitionBalancer: partitionBalancerQuery.data,
    console: consoleInfoQuery.data,
    kafkaConnect: kafkaConnectInfoQuery.data,
    schemaRegistry: schemaRegistryInfoQuery.data,
  };
};
