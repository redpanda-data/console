/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License,
 * use of this software will be governed by the Apache License, Version 2.0
 */

import { CopyIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { DeleteResourceAlertDialog, DeleteResourceMenuItem } from 'components/ui/delete-resource-alert-dialog';
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

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(secret.id);
      toast.success('Secret ID copied to clipboard');
    } catch {
      toast.error('Could not copy the secret ID');
    }
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
  };

  return (
    <div data-actions-column>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button className="h-8 w-8" data-testid="secret-actions-menu-trigger" size="icon" variant="ghost">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-[200px]">
          {/* Stays open after copying, as the copy button it replaced did. */}
          <DropdownMenuItem closeOnClick={false} data-testid="secret-copy-id-button" onClick={handleCopyId}>
            <div className="flex items-center gap-4">
              <CopyIcon className="h-4 w-4" />
              Copy ID
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="secret-edit-menu-item" onClick={() => onEdit(secret.id)}>
            <div className="flex items-center gap-4">
              <Pencil className="h-4 w-4" />
              Edit
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DeleteResourceMenuItem isDeleting={isDeleting} onSelect={() => setIsDeleteDialogOpen(true)} />
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Render the dialog as a sibling of the dropdown so the dialog survives the menu's unmount on close. */}
      <DeleteResourceAlertDialog
        isDeleting={isDeleting}
        onDelete={handleDelete}
        onOpenChange={setIsDeleteDialogOpen}
        open={isDeleteDialogOpen}
        resourceId={secret.id}
        resourceName={secret.id}
        resourceType="Secret"
      >
        {resources.length > 0 && <ResourceInUseAlert resources={resources} />}
      </DeleteResourceAlertDialog>
    </div>
  );
};
