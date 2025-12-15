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
import { ConnectError } from '@connectrpc/connect';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { Copy, MoreHorizontal } from 'lucide-react';
import { DeleteKnowledgeBaseRequestSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useDeleteKnowledgeBaseMutation } from 'react-query/api/knowledge-base';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import type { KnowledgeBaseTableRow } from './knowledge-base-list-page';

type KnowledgeBaseActionsCellProps = {
  knowledgeBase: KnowledgeBaseTableRow;
};

export const KnowledgeBaseActionsCell = ({ knowledgeBase }: KnowledgeBaseActionsCellProps) => {
  const { mutate: deleteKnowledgeBase, isPending: isDeleting } = useDeleteKnowledgeBaseMutation();

  const handleDelete = (id: string) => {
    deleteKnowledgeBase(create(DeleteKnowledgeBaseRequestSchema, { id }), {
      onSuccess: () => {
        toast.success(`Knowledge base ${knowledgeBase.displayName} deleted`);
      },
      onError: (error) => {
        const connectError = ConnectError.from(error);
        toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'delete', entity: 'knowledge base' }));
      },
    });
  };

  const handleCopyUrl = () => {
    if (knowledgeBase.retrievalApiUrl) {
      navigator.clipboard.writeText(knowledgeBase.retrievalApiUrl);
      toast.success('Retrieval API URL copied to clipboard');
    } else {
      toast.error('No retrieval API URL available');
    }
  };

  return (
    <div data-actions-column>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 w-8 data-[state=open]:bg-muted" size="icon" variant="ghost">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={handleCopyUrl}>
            <div className="flex items-center gap-4">
              <Copy className="h-4 w-4" /> Copy URL
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DeleteResourceAlertDialog
            isDeleting={isDeleting}
            onDelete={handleDelete}
            resourceId={knowledgeBase.id}
            resourceName={knowledgeBase.displayName}
            resourceType="Knowledge Base"
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
