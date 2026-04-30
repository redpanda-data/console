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
  // Trigger variant: "dropdown" renders a DropdownMenuItem, "button" renders a Button
  triggerVariant?: 'dropdown' | 'button';
  // Button-specific props when triggerVariant is "button"
  buttonVariant?: ButtonVariants['variant'];
  buttonIcon?: React.ReactNode;
  buttonText?: string;
  /**
   * Controlled open state. When provided, the component renders only the
   * dialog body — the parent supplies its own trigger (typically a
   * `DropdownMenuItem` rendered alongside the dropdown menu) and owns the
   * open state. Use this when the trigger lives inside a `DropdownMenuContent`
   * but the dialog must outlive the menu's close transition (otherwise the
   * dialog and the menu would unmount together when the menu closes).
   */
  open?: boolean;
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
}> = ({
  resourceType,
  resourceName,
  confirmationText,
  setConfirmationText,
  children,
  isDeleting,
  isDeleteConfirmed,
  handleDelete,
}) => (
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
      <AlertDialogCancel asChild>
        <Button variant="secondary-ghost">Cancel</Button>
      </AlertDialogCancel>
      <AlertDialogAction asChild disabled={!isDeleteConfirmed || isDeleting} onClick={handleDelete}>
        <Button variant="destructive">{isDeleting ? 'Deleting...' : 'Delete'}</Button>
      </AlertDialogAction>
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

  // Controlled mode: parent owns the open state and renders the trigger
  // separately (e.g. a `DropdownMenuItem` inside the dropdown). We render only
  // the dialog body so it can live as a sibling of the dropdown and outlive
  // the menu's close transition.
  if (isControlled) {
    return (
      <AlertDialog onOpenChange={handleOpenChange} open={open}>
        <DialogBody
          children={children}
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
    );
  };

  return (
    <AlertDialog onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{renderTrigger()}</AlertDialogTrigger>
      <DialogBody
        children={children}
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

/**
 * `DropdownMenuItem` styled as the "Delete" entry that opens the controlled
 * `DeleteResourceAlertDialog`. Use this inside `DropdownMenuContent` while
 * keeping the dialog itself outside the menu (so the menu's unmount on close
 * does not tear down the dialog mid-flow).
 */
export const DeleteResourceMenuItem: React.FC<{
  isDeleting?: boolean;
  onSelect: () => void;
  testId?: string;
}> = ({ isDeleting, onSelect, testId }) => (
  <DropdownMenuItem
    className="text-red-600 focus:text-red-600"
    data-testid={testId}
    onSelect={(event) => {
      event.preventDefault();
      onSelect();
    }}
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
