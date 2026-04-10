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
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../redpanda-ui/components/dialog';
import { Input } from '../../../redpanda-ui/components/input';

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

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled ? onOpenChange! : setUncontrolledOpen;

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) setConfirmText('');
  };

  const handleConfirm = async () => {
    await onConfirm();
    handleOpenChange(false);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {buttonEl && <DialogTrigger asChild>{buttonEl}</DialogTrigger>}
      <DialogContent variant="destructive">
        <DialogHeader>
          <DialogTitle>Delete user {userName}</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          This user has roles and ACLs assigned to it. Those roles and ACLs will not be deleted, but the user will need
          to be recreated and reassigned to them to be used again. To confirm, type the user name in the box below.
        </DialogDescription>
        <Input
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={`Type "${userName}" to confirm`}
          testId="txt-confirmation-delete"
          value={confirmText}
        />
        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={confirmText !== userName}
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
