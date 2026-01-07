/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License,
 * use of this software will be governed by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { MoreHorizontal, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useListResourcesForSecretQuery } from 'react-query/api/secret';
import { toast } from 'sonner';

import { ResourceInUseAlert } from './resource-in-use-alert';
import type { SecretTableRow } from './secrets-store-list-page';

export type SecretsStoreActionsCellProps = {
  secret: SecretTableRow;
  onEdit: (secretId: string) => void;
  onDelete: (secretId: string) => Promise<void>;
  isDeleting: boolean;
};

export const SecretsStoreActionsCell = ({ secret, onEdit, onDelete, isDeleting }: SecretsStoreActionsCellProps) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data: resourcesData } = useListResourcesForSecretQuery(secret.id, {
    enabled: isDeleteDialogOpen,
  });

  const resources = resourcesData?.resources || [];

  const handleCopySuccess = () => {
    toast.success('Secret ID copied to clipboard');
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
  };

  return (
    <div data-actions-column>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="h-8 w-8 data-[state=open]:bg-muted"
            data-testid="secret-actions-menu-trigger"
            size="icon"
            variant="ghost"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <CopyButton
            className="[&]:transform-none! w-full justify-start gap-4 rounded-sm px-2 py-1.5 font-normal text-sm hover:bg-accent [&]:scale-100! [&_svg]:size-4"
            content={secret.id}
            data-testid="secret-copy-id-button"
            onCopy={handleCopySuccess}
            variant="ghost"
          >
            Copy ID
          </CopyButton>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="secret-edit-menu-item" onClick={() => onEdit(secret.id)}>
            <div className="flex items-center gap-4">
              <Pencil className="h-4 w-4" />
              Edit
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DeleteResourceAlertDialog
            isDeleting={isDeleting}
            onDelete={handleDelete}
            onOpenChange={setIsDeleteDialogOpen}
            resourceId={secret.id}
            resourceName={secret.id}
            resourceType="Secret"
          >
            {resources.length > 0 && <ResourceInUseAlert resources={resources} />}
          </DeleteResourceAlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
