import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { useQuery } from '@connectrpc/connect-query';
import {
  GetPipelineServiceConfigSchemaRequestSchema,
  type GetPipelineServiceConfigSchemaResponse,
  LintPipelineConfigRequestSchema,
  type LintPipelineConfigResponse,
  ListComponentsRequestSchema,
  type ListComponentsResponse,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  getPipelineServiceConfigSchema,
  lintPipelineConfig,
  listComponents,
} from 'protogen/redpanda/api/dataplane/v1/pipeline-PipelineService_connectquery';
import type { QueryOptions } from 'react-query/react-query.utils';

export const useGetPipelineServiceConfigSchemaQuery = (
  options?: QueryOptions<GenMessage<GetPipelineServiceConfigSchemaResponse>, GetPipelineServiceConfigSchemaResponse>
) => {
  const request = create(GetPipelineServiceConfigSchemaRequestSchema, {});

  return useQuery(getPipelineServiceConfigSchema, request, {
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 3,
    ...options,
  });
};

export const useListComponentsQuery = (
  options?: QueryOptions<GenMessage<ListComponentsResponse>, ListComponentsResponse>
) => {
  const listComponentsRequest = create(ListComponentsRequestSchema, {});

  return useQuery(listComponents, listComponentsRequest, {
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 3,
    ...options,
  });
};

export const useLintPipelineConfigQuery = (
  configYaml: string,
  options?: QueryOptions<GenMessage<LintPipelineConfigResponse>, LintPipelineConfigResponse> & {
    enabled?: boolean;
  }
) => {
  const request = create(LintPipelineConfigRequestSchema, { configYaml });

  return useQuery(lintPipelineConfig, request, {
    staleTime: 0,
    ...options,
  });
};
