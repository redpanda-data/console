/**
 * Copyright 2026 Redpanda Data, Inc.
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
import { Button } from 'components/redpanda-ui/components/button';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { InlineCode } from 'components/redpanda-ui/components/typography';

import { UNTITLED_PIPELINE_NAME } from './draft-copy';

/** Lighter than `DeleteResourceAlertDialog`: no type-to-confirm, since nothing is deployed. */
export function DeleteDraftDialog({
  open,
  draftName,
  isDeleting,
  hasUnsavedChanges,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  draftName: string;
  isDeleting?: boolean;
  hasUnsavedChanges?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const name = draftName.trim() || UNTITLED_PIPELINE_NAME;
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete draft?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block text-body">
              <InlineCode>{name}</InlineCode> and its configuration are deleted for everyone.
            </span>
            {hasUnsavedChanges ? (
              <span className="block text-body">
                Your unsaved changes go with it — this deletes the whole draft, not just your edits.
              </span>
            ) : null}
            <span className="block text-body">This can't be undone.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel render={<Button variant="ghost">Cancel</Button>} />
          <AlertDialogAction
            disabled={isDeleting}
            onClick={onConfirm}
            render={
              <Button icon={isDeleting ? <Spinner /> : undefined} variant="destructive">
                {isDeleting ? 'Deleting...' : 'Delete draft'}
              </Button>
            }
            testId="confirm-delete-draft"
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
