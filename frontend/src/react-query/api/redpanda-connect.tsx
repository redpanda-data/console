import type { PartialMessage } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { useMutation } from '@connectrpc/connect-query';
import { type QueryClient, type UseMutationResult, useQueryClient } from '@tanstack/react-query';
import { lintConfig } from 'protogen/redpanda/api/console/v1alpha1/rp_connect-RedpandaConnectService_connectquery';
import type { LintConfigRequest, LintConfigResponse } from 'protogen/redpanda/api/console/v1alpha1/rp_connect_pb';
import type { PipelineCreate } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { TOASTS, formatToastErrorMessageGRPC, showToast } from 'utils/toast.utils';

export const useLintConfigMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(lintConfig, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [lintConfig.service.typeName],
        exact: false,
      });
    },
    onError: (error) => {
      showToast({
        id: TOASTS.REDPANDA_CONNECT.LINT_CONFIG.ERROR,
        resourceName: 'YAML config',
        title: formatToastErrorMessageGRPC({
          error,
          action: 'lint',
          entity: 'YAML config',
        }),
        status: 'error',
      });
    },
  });
};

export interface LintConfigWithPipelineInfo extends LintConfigResponse {
  pipelineName?: string;
  pipelineDescription?: string;
  pipelinePurpose?: string;
  pipelineKey?: string;
  pipelineTags?: Record<string, string>;
}

/**
 * @description Custom hook that lints multiple pipelines in parallel from YAML templates
 */
export const useLintConfigsMutation = () => {
  const queryClient = useQueryClient();
  const lintConfigMutation = useMutation(lintConfig);

  return {
    ...lintConfigMutation,
    mutate: async ({ pipelines }: CreateAgentPipelineParams) => {
      return lintConfigsPromises({ queryClient, lintConfigMutation, pipelines });
    },
    mutateAsync: async ({ pipelines }: CreateAgentPipelineParams) => {
      return lintConfigsPromises({ queryClient, lintConfigMutation, pipelines });
    },
  };
};

interface CreateAgentPipelineParams {
  pipelines: PartialMessage<PipelineCreate>[];
}

interface LintConfigsPromisesProps {
  queryClient: QueryClient;
  lintConfigMutation: UseMutationResult<LintConfigResponse, ConnectError, PartialMessage<LintConfigRequest>, unknown>;
  pipelines: PartialMessage<PipelineCreate>[];
}

const lintConfigsPromises = async ({ queryClient, lintConfigMutation, pipelines }: LintConfigsPromisesProps) => {
  try {
    const lintConfigPromises = [];

    for (const pipeline of pipelines) {
      if (pipeline?.configYaml) {
        const pipelineInfo = {
          pipelineName: pipeline.displayName || 'Unknown',
          pipelineDescription: pipeline.description || '',
          pipelineTags: pipeline.tags || {},
          pipelineKey: pipeline.tags?.__redpanda_cloud_pipeline_purpose?.split('-')[0]?.toUpperCase() || 'Unknown',
          pipelinePurpose: pipeline.tags?.__redpanda_cloud_pipeline_purpose || '',
        };

        const lintConfigPromise = lintConfigMutation
          .mutateAsync({ yamlConfig: pipeline?.configYaml })
          .then((result) => ({ ...result, ...pipelineInfo }));

        lintConfigPromises.push(lintConfigPromise);
      }
    }

    const results = await Promise.all(lintConfigPromises);

    await queryClient.invalidateQueries({ queryKey: [lintConfig.service.typeName] });

    return results as LintConfigWithPipelineInfo[];
  } catch (error) {
    const connectError = ConnectError.from(error);

    showToast({
      id: TOASTS.REDPANDA_CONNECT.LINT_CONFIG.ERROR,
      title: formatToastErrorMessageGRPC({ error: connectError, action: 'lint', entity: 'YAML config' }),
      status: 'error',
    });
  }
};
