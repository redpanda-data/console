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
import {
  LONG_LIVED_CACHE_STALE_TIME,
  NO_LIVED_CACHE_STALE_TIME,
  type QueryOptions,
} from 'react-query/react-query.utils';

export const useGetPipelineServiceConfigSchemaQuery = (
  options?: QueryOptions<GenMessage<GetPipelineServiceConfigSchemaResponse>, GetPipelineServiceConfigSchemaResponse>
) => {
  const request = create(GetPipelineServiceConfigSchemaRequestSchema, {});

  return useQuery(getPipelineServiceConfigSchema, request, {
    staleTime: LONG_LIVED_CACHE_STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    ...options,
  });
};

export const useListComponentsQuery = (
  options?: QueryOptions<GenMessage<ListComponentsResponse>, ListComponentsResponse>
) => {
  const listComponentsRequest = create(ListComponentsRequestSchema, {});

  return useQuery(listComponents, listComponentsRequest, {
    staleTime: LONG_LIVED_CACHE_STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
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
    staleTime: NO_LIVED_CACHE_STALE_TIME,
    ...options,
  });
};
