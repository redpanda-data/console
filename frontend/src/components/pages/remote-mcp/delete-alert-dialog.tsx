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
import { Input } from 'components/redpanda-ui/components/input';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import React from 'react';

export interface DeleteAlertDialogProps {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  onDelete: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export const DeleteAlertDialog: React.FC<DeleteAlertDialogProps> = ({
  resourceId,
  resourceName,
  resourceType,
  onDelete,
  onOpenChange,
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
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Delete {resourceType}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <Text>
              You are about to delete <InlineCode>{resourceName}</InlineCode>
            </Text>
            <Text>This action will cause data loss. To confirm, type "delete" into the confirmation box below.</Text>
            <Input
              placeholder='Type "delete" to confirm'
              className="mt-4"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmationText('')}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={!isDeleteConfirmed}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
