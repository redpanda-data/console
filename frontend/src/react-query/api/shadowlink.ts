/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import type { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  createShadowLink,
  deleteShadowLink,
  listShadowLinks,
} from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import { ListShadowLinksRequestSchema, ShadowLinkService } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

/**
 * Hook to list all shadow links
 */
export const useListShadowLinksQuery = () => {
  const listShadowLinksRequest = create(ListShadowLinksRequestSchema, {});

  return useQuery(listShadowLinks, listShadowLinksRequest);
};

/**
 * Hook to create a new shadow link
 */
export const useCreateShadowLinkMutation = (options?: { onSuccess?: () => void }) => {
  const queryClient = useQueryClient();

  return useMutation(createShadowLink, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: ShadowLinkService.method.listShadowLinks,
          cardinality: 'finite',
        }),
        exact: false,
      });
      options?.onSuccess?.();
    },
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'shadow link',
      }),
  });
};

/**
 * Hook to delete a shadow link
 */
export const useDeleteShadowLinkMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: ConnectError) => void;
}) => {
  const queryClient = useQueryClient();

  return useMutation(deleteShadowLink, {
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: ShadowLinkService.method.listShadowLinks,
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
