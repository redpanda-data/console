/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { FC } from 'react';
import { useState } from 'react';

import { Button } from '../../../redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../redpanda-ui/components/dialog';
import { Input } from '../../../redpanda-ui/components/input';
import { usePendingAction } from '../hooks/use-pending-action';

type DeleteUserConfirmModalProps = {
  userName: string;
  onConfirm: () => Promise<void> | void;
} & (
  | { buttonEl: React.ReactElement; open?: never; onOpenChange?: never }
  | { buttonEl?: never; open: boolean; onOpenChange: (open: boolean) => void }
);

export const DeleteUserConfirmModal: FC<DeleteUserConfirmModalProps> = ({
  userName,
  onConfirm,
  buttonEl,
  open: controlledOpen,
  onOpenChange,
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const { run, isPending, errorMessage, clearError } = usePendingAction();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled ? onOpenChange! : setUncontrolledOpen;

  const close = () => {
    setOpen(false);
    setConfirmText('');
    clearError();
  };

  // Dismissing mid-deletion would hide how it ended, so Escape and outside clicks wait for it to settle.
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setOpen(true);
    } else if (!isPending) {
      close();
    }
  };

  const handleConfirm = () => {
    run(async () => {
      await onConfirm();
      close();
    });
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {buttonEl && <DialogTrigger render={buttonEl} />}
      <DialogContent variant="destructive">
        <DialogHeader>
          <DialogTitle>Delete user {userName}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            This user has roles and ACLs assigned to it. Those roles and ACLs will not be deleted, but the user will
            need to be recreated and reassigned to them to be used again. To confirm, type the user name in the box
            below.
          </DialogDescription>
          <Input
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={`Type "${userName}" to confirm`}
            testId="txt-confirmation-delete"
            value={confirmText}
          />
          {errorMessage !== null && (
            <p className="text-body text-destructive" role="alert">
              Could not complete the deletion: {errorMessage}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button disabled={isPending} onClick={close} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={confirmText !== userName || isPending}
            onClick={handleConfirm}
            testId="test-delete-item"
            variant="destructive"
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
