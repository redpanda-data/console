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

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'components/redpanda-ui/components/alert-dialog';
import { Input } from 'components/redpanda-ui/components/input';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { useState } from 'react';

interface DeleteShadowLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shadowLinkName: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export const DeleteShadowLinkDialog = ({
  open,
  onOpenChange,
  shadowLinkName,
  onConfirm,
  isLoading,
}: DeleteShadowLinkDialogProps) => {
  const [confirmationText, setConfirmationText] = useState('');

  const isDeleteConfirmed = confirmationText.toLowerCase() === 'delete';

  const handleCancel = () => {
    setConfirmationText('');
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (isDeleteConfirmed) {
      onConfirm();
    }
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Delete Shadowlink</AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <Text>
              You are about to delete <InlineCode>{shadowLinkName}</InlineCode>
            </Text>
            <Text>This action will cause data loss. To confirm, type "delete" into the confirmation box below.</Text>
            <Input
              className="mt-4"
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder='Type "delete" to confirm'
              value={confirmationText}
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            disabled={!isDeleteConfirmed || isLoading}
            onClick={handleConfirm}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
