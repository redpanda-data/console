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
import type { ButtonVariants } from 'components/redpanda-ui/components/button';
import { Button } from 'components/redpanda-ui/components/button';
import { DropdownMenuItem } from 'components/redpanda-ui/components/dropdown-menu';
import { Input } from 'components/redpanda-ui/components/input';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { Loader2, Trash2 } from 'lucide-react';
import React, { type ReactNode } from 'react';

export type DeleteResourceAlertDialogProps = {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  onDelete: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  isDeleting?: boolean;
  children?: ReactNode;
  triggerVariant?: 'dropdown' | 'button';
  buttonVariant?: ButtonVariants['variant'];
  buttonIcon?: React.ReactNode;
  buttonText?: string;
  // Controlled-only mode: parent owns open state and renders the trigger.
  // Use with `DeleteResourceMenuItem` when the dialog must outlive a closing
  // dropdown menu.
  open?: boolean;
  confirmButtonTestId?: string;
};

const DialogBody: React.FC<{
  resourceType: string;
  resourceName: string;
  confirmationText: string;
  setConfirmationText: (value: string) => void;
  children?: ReactNode;
  isDeleting?: boolean;
  isDeleteConfirmed: boolean;
  handleDelete: () => void;
  confirmButtonTestId?: string;
}> = ({
  resourceType,
  resourceName,
  confirmationText,
  setConfirmationText,
  children,
  isDeleting,
  isDeleteConfirmed,
  handleDelete,
  confirmButtonTestId,
}) => (
  <AlertDialogContent>
    <AlertDialogHeader className="text-left">
      <AlertDialogTitle>Delete {resourceType}</AlertDialogTitle>
      <AlertDialogDescription className="space-y-4">
        <div className="text-body">
          You are about to delete <InlineCode>{resourceName}</InlineCode>
        </div>
        <div className="text-body">
          This action will cause data loss. To confirm, type "delete" into the confirmation box below.
        </div>
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
      <AlertDialogCancel render={<Button variant="secondary-ghost">Cancel</Button>} />
      <AlertDialogAction
        disabled={!isDeleteConfirmed || isDeleting}
        onClick={handleDelete}
        render={<Button data-testid={confirmButtonTestId} variant="destructive">{isDeleting ? 'Deleting...' : 'Delete'}</Button>} />
    </AlertDialogFooter>
  </AlertDialogContent>
);

export const DeleteResourceAlertDialog: React.FC<DeleteResourceAlertDialogProps> = ({
  resourceId,
  resourceName,
  resourceType,
  onDelete,
  onOpenChange,
  isDeleting,
  children,
  triggerVariant = 'dropdown',
  buttonVariant = 'destructive-outline',
  buttonIcon,
  buttonText: buttonTextProp,
  open,
  confirmButtonTestId,
}) => {
  const [confirmationText, setConfirmationText] = React.useState('');
  const isDeleteConfirmed = confirmationText.toLowerCase() === 'delete';
  const buttonText = buttonTextProp === undefined ? undefined : 'Delete';
  const isControlled = open !== undefined;

  const handleDelete = () => {
    if (isDeleteConfirmed) {
      onDelete(resourceId);
      setConfirmationText('');
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setConfirmationText('');
    }
    onOpenChange?.(next);
  };

  if (isControlled) {
    return (
      <AlertDialog onOpenChange={handleOpenChange} open={open}>
        <DialogBody
          children={children}
          confirmButtonTestId={confirmButtonTestId}
          confirmationText={confirmationText}
          handleDelete={handleDelete}
          isDeleteConfirmed={isDeleteConfirmed}
          isDeleting={isDeleting}
          resourceName={resourceName}
          resourceType={resourceType}
          setConfirmationText={setConfirmationText}
        />
      </AlertDialog>
    );
  }

  const renderTrigger = () => {
    if (triggerVariant === 'button') {
      return (
        <Button disabled={isDeleting} icon={buttonIcon} variant={buttonVariant} size={!buttonText ? 'icon' : undefined}>
          {buttonText && !isDeleting && buttonText}
          {isDeleting && (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
            </>
          )}
        </Button>
      );
    }

    return (
      <DropdownMenuItem className="text-error focus:text-error">
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
    );
  };

  return (
    <AlertDialog onOpenChange={handleOpenChange}>
      <AlertDialogTrigger nativeButton={triggerVariant === 'button'} render={renderTrigger()} />
      <DialogBody
        children={children}
        confirmButtonTestId={confirmButtonTestId}
        confirmationText={confirmationText}
        handleDelete={handleDelete}
        isDeleteConfirmed={isDeleteConfirmed}
        isDeleting={isDeleting}
        resourceName={resourceName}
        resourceType={resourceType}
        setConfirmationText={setConfirmationText}
      />
    </AlertDialog>
  );
};

// `DropdownMenuItem` styled as the "Delete" entry that opens a controlled
// `DeleteResourceAlertDialog`. Use this inside `DropdownMenuContent` while
// rendering the dialog itself as a sibling of the dropdown — otherwise the
// menu's unmount on close tears down the dialog mid-flow.
export const DeleteResourceMenuItem: React.FC<{
  isDeleting?: boolean;
  onSelect: () => void;
  testId?: string;
}> = ({ isDeleting, onSelect, testId }) => (
  <DropdownMenuItem
    className="text-error focus:text-error"
    data-testid={testId}
    // Base UI's Menu.Item exposes `onClick`, not Radix's `onSelect`. The
    // dialog is a controlled sibling that outlives this menu, so letting the
    // menu close on click is fine.
    onClick={() => onSelect()}
  >
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
);
