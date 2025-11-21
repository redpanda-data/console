import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { useMutation, useQuery } from '@connectrpc/connect-query';
import {
  LintPipelineConfigRequestSchema,
  type LintPipelineConfigResponse,
  ListComponentsRequestSchema,
  type ListComponentsResponse,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  lintPipelineConfig,
  listComponents,
} from 'protogen/redpanda/api/dataplane/v1/pipeline-PipelineService_connectquery';
import type { QueryOptions } from 'react-query/react-query.utils';

export const useListComponentsQuery = (
  options?: QueryOptions<GenMessage<ListComponentsResponse>, ListComponentsResponse>
) => {
  const listComponentsRequest = create(ListComponentsRequestSchema, {});

  return useQuery(listComponents, listComponentsRequest, {
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
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
    enabled: options?.enabled && configYaml.length > 0,
    staleTime: 0,
    ...options,
  });
};

export const useLintPipelineConfigMutation = () => useMutation(lintPipelineConfig);
