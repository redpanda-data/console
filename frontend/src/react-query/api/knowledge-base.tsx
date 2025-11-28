import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  GetKnowledgeBaseRequestSchema,
  type ListKnowledgeBasesRequest,
  ListKnowledgeBasesRequestSchema,
  type ListKnowledgeBasesResponse,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeBase,
  listKnowledgeBases,
  updateKnowledgeBase,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base-KnowledgeBaseService_connectquery';
import type { MessageInit, QueryOptions } from 'react-query/react-query.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const useListKnowledgeBasesQuery = (
  input?: MessageInit<ListKnowledgeBasesRequest>,
  options?: QueryOptions<GenMessage<ListKnowledgeBasesRequest>, ListKnowledgeBasesResponse>
) => {
  const listKnowledgeBasesRequest = create(ListKnowledgeBasesRequestSchema, {
    ...input,
  });

  return useQuery(listKnowledgeBases, listKnowledgeBasesRequest, {
    enabled: options?.enabled,
  });
};

export const useGetKnowledgeBaseQuery = (input?: { id?: string }) => {
  const getKnowledgeBaseRequest = create(GetKnowledgeBaseRequestSchema, { id: input?.id });

  return useQuery(getKnowledgeBase, getKnowledgeBaseRequest, {
    enabled: !!input?.id,
  });
};

export const useCreateKnowledgeBaseMutation = () =>
  useMutation(createKnowledgeBase, {
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'knowledge base',
      }),
  });

export const useUpdateKnowledgeBaseMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(updateKnowledgeBase, {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listKnowledgeBases,
          cardinality: 'finite',
        }),
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'update',
        entity: 'knowledge base',
      }),
  });
};

export const useDeleteKnowledgeBaseMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(deleteKnowledgeBase, {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: listKnowledgeBases,
          cardinality: 'finite',
        }),
      });
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'delete',
        entity: 'knowledge base',
      }),
  });
};
