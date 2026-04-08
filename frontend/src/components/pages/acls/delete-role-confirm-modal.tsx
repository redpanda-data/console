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

import { Button } from '../../redpanda-ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../redpanda-ui/components/dialog';
import { Input } from '../../redpanda-ui/components/input';

export const DeleteRoleConfirmModal: FC<{
  roleName: string;
  numberOfPrincipals: number;
  onConfirm: () => Promise<void> | void;
  buttonEl: React.ReactElement;
}> = ({ roleName, numberOfPrincipals, onConfirm, buttonEl }) => {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

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
      <DialogTrigger asChild>{buttonEl}</DialogTrigger>
      <DialogContent variant="destructive">
        <DialogHeader>
          <DialogTitle>Delete role {roleName}</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          This role is assigned to {numberOfPrincipals} {numberOfPrincipals === 1 ? 'principal' : 'principals'}.
          Deleting it will remove it from these principals and take those permissions away. The ACLs will all be
          deleted. To restore the permissions, the role will need to be recreated and reassigned to these principals. To
          confirm, type the role name in the confirmation box below.
        </DialogDescription>
        <Input onChange={(e) => setConfirmText(e.target.value)} placeholder={roleName} value={confirmText} />
        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            data-testid="confirm-role-delete-button"
            disabled={confirmText !== roleName}
            onClick={handleConfirm}
            variant="destructive"
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
