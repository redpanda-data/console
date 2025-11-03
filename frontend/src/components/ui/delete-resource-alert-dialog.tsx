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

'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from 'components/redpanda-ui/components/alert-dialog';
import { DropdownMenuItem } from 'components/redpanda-ui/components/dropdown-menu';
import { Input } from 'components/redpanda-ui/components/input';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { Loader2, Trash2 } from 'lucide-react';
import React, { type ReactNode } from 'react';

export type DeleteResourceAlertDialogProps = {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  onDelete: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  isDeleting?: boolean;
  // Optional: Additional content to show in the dialog
  children?: ReactNode;
};

export const DeleteResourceAlertDialog: React.FC<DeleteResourceAlertDialogProps> = ({
  resourceId,
  resourceName,
  resourceType,
  onDelete,
  onOpenChange,
  isDeleting,
  children,
}) => {
  const [confirmationText, setConfirmationText] = React.useState('');
  const isDeleteConfirmed = confirmationText.toLowerCase() === 'delete';

  const handleDelete = () => {
    if (isDeleteConfirmed) {
      onDelete(resourceId);
      setConfirmationText('');
    }
  };

  return (
    <AlertDialog onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <DropdownMenuItem className="text-red-600 focus:text-red-600" onSelect={(e) => e.preventDefault()}>
          {isDeleting ? (
            <div className="flex items-center gap-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Deleting
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Trash2 className="h-4 w-4" /> Delete
            </div>
          )}
        </DropdownMenuItem>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Delete {resourceType}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <Text>
              You are about to delete <InlineCode>{resourceName}</InlineCode>
            </Text>
            <Text>This action will cause data loss. To confirm, type "delete" into the confirmation box below.</Text>
            <Input
              className="mt-4"
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder='Type "delete" to confirm'
              value={confirmationText}
            />
            {children}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmationText('')}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isDeleteConfirmed}
            onClick={handleDelete}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
