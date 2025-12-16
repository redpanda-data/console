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
import { Button } from 'components/redpanda-ui/components/button';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import type { KnowledgeBaseTableRow } from './knowledge-base-list-page';

type KnowledgeBaseActionsCellProps = {
  knowledgeBase: KnowledgeBaseTableRow;
  onDelete: (knowledgeBaseId: string) => void;
  isDeletingKnowledgeBase: boolean;
};

export const KnowledgeBaseActionsCell = ({
  knowledgeBase,
  onDelete,
  isDeletingKnowledgeBase,
}: KnowledgeBaseActionsCellProps) => {
  const handleCopySuccess = () => {
    toast.success('Retrieval API URL copied to clipboard');
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
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
        <DropdownMenuContent align="end" className="w-[200px]">
          <CopyButton
            className="[&]:transform-none! w-full justify-start gap-4 rounded-sm px-2 py-1.5 font-normal text-sm hover:bg-accent [&]:scale-100! [&_svg]:size-4"
            content={knowledgeBase.retrievalApiUrl}
            onCopy={handleCopySuccess}
            variant="ghost"
          >
            Copy URL
          </CopyButton>
          <DropdownMenuSeparator />
          <DeleteResourceAlertDialog
            isDeleting={isDeletingKnowledgeBase}
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
