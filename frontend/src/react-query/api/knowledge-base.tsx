import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { useMutation, useQuery } from '@connectrpc/connect-query';
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
  options?: QueryOptions<GenMessage<ListKnowledgeBasesRequest>, ListKnowledgeBasesResponse>,
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

export const useCreateKnowledgeBaseMutation = () => {
  return useMutation(createKnowledgeBase, {
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'knowledge base',
      });
    },
  });
};

export const useUpdateKnowledgeBaseMutation = () => {
  return useMutation(updateKnowledgeBase, {
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'update',
        entity: 'knowledge base',
      });
    },
  });
};

export const useDeleteKnowledgeBaseMutation = () => {
  return useMutation(deleteKnowledgeBase, {
    onError: (error) => {
      return formatToastErrorMessageGRPC({
        error,
        action: 'delete',
        entity: 'knowledge base',
      });
    },
  });
};
