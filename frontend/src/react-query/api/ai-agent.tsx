import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import type { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient, useQuery as useTanstackQuery } from '@tanstack/react-query';
import {
  AIAgent_State,
  AIAgentService,
  type GetAIAgentRequest,
  GetAIAgentRequestSchema,
  type GetAIAgentResponse,
  type ListAIAgentsRequest,
  ListAIAgentsRequest_FilterSchema,
  ListAIAgentsRequestSchema,
  type ListAIAgentsResponse,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import {
  createAIAgent,
  deleteAIAgent,
  getAIAgent,
  listAIAgents,
  startAIAgent,
  stopAIAgent,
  updateAIAgent,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent-AIAgentService_connectquery';
import { type MessageInit, type QueryOptions, SHORT_POLLING_INTERVAL } from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

// TODO: Make this dynamic so that pagination can be used properly
const AI_AGENT_MAX_PAGE_SIZE = 50;

export const useListAIAgentsQuery = (
  input?: MessageInit<ListAIAgentsRequest>,
  options?: QueryOptions<GenMessage<ListAIAgentsRequest>, ListAIAgentsResponse>
) => {
  const listAIAgentsRequest = create(ListAIAgentsRequestSchema, {
    pageToken: '',
    pageSize: AI_AGENT_MAX_PAGE_SIZE,
    filter: input?.filter
      ? create(ListAIAgentsRequest_FilterSchema, {
          nameContains: input.filter.nameContains,
          tags: input.filter.tags,
        })
      : undefined,
  });

  return useQuery(listAIAgents, listAIAgentsRequest, {
    enabled: options?.enabled,
  });
};

export const useGetAIAgentQuery = (
  input?: MessageInit<GetAIAgentRequest>,
  options?: QueryOptions<GenMessage<GetAIAgentResponse>>
) => {
  const getAIAgentRequest = create(GetAIAgentRequestSchema, { id: input?.id });

  return useQuery(getAIAgent, getAIAgentRequest, {
    enabled: options?.enabled,
    refetchInterval:
      options?.refetchInterval ??
      ((query) => {
        const state = query?.state?.data?.aiAgent?.state;
        // Poll every 2 seconds when agent is starting or in unspecified state
        const shouldPoll = state === AIAgent_State.STARTING || state === AIAgent_State.UNSPECIFIED;
        return shouldPoll ? SHORT_POLLING_INTERVAL : false;
      }),
    refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
  });
};

export const useCheckAIAgentNameUniqueness = () => {
  const { data: agents, isLoading } = useListAIAgentsQuery();

  const checkNameUniqueness = (displayName: string, excludeId?: string): boolean => {
    if (!agents?.aiAgents || isLoading) {
      return true;
    }

    return !agents.aiAgents.some(
      (agent) => agent.displayName.toLowerCase() === displayName.toLowerCase() && agent.id !== excludeId
    );
  };

  return { checkNameUniqueness, isLoading };
};

export const useCreateAIAgentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(createAIAgent, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: AIAgentService.method.listAIAgents,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'AI agent',
      }),
  });
};

export const useUpdateAIAgentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(updateAIAgent, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: AIAgentService.method.listAIAgents,
          cardinality: 'finite',
        }),
        exact: false,
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: AIAgentService.method.getAIAgent,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'update',
        entity: 'AI agent',
      }),
  });
};

export const useDeleteAIAgentMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: ConnectError) => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation(deleteAIAgent, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: AIAgentService.method.listAIAgents,
          cardinality: 'finite',
        }),
        exact: false,
      });
      options?.onSuccess?.();
    },
    onError: (error) => {
      options?.onError?.(error);
    },
  });
};

export const useStopAIAgentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(stopAIAgent, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: AIAgentService.method.getAIAgent,
          cardinality: 'finite',
        }),
        exact: false,
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: AIAgentService.method.listAIAgents,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'stop',
        entity: 'AI agent',
      }),
  });
};

export const useStartAIAgentMutation = () => {
  const queryClient = useQueryClient();

  return useMutation(startAIAgent, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: AIAgentService.method.getAIAgent,
          cardinality: 'finite',
        }),
        exact: false,
      });
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: AIAgentService.method.listAIAgents,
          cardinality: 'finite',
        }),
        exact: false,
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'start',
        entity: 'AI agent',
      }),
  });
};

const GITHUB_CODE_SNIPPETS_API_BASE_URL =
  'https://raw.githubusercontent.com/redpanda-data/how-to-connect-code-snippets';

const fetchA2ACodeSnippet = async (language?: string): Promise<string> => {
  if (!language) {
    return '';
  }

  const response = await fetch(`${GITHUB_CODE_SNIPPETS_API_BASE_URL}/refs/heads/main/a2a/${language}/README.md`);

  if (!response.ok) {
    throw new Error(`Failed to fetch code snippet: ${response.status}`);
  }

  return response.text();
};

export const useGetA2ACodeSnippetQuery = (input: { language?: string }) =>
  useTanstackQuery({
    queryKey: ['a2a-code-snippet', input.language],
    queryFn: () => fetchA2ACodeSnippet(input.language),
    enabled: !!input.language,
  });
