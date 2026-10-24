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

import { useNavigate } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import { useState } from 'react';
import { toast } from 'sonner';

import { CreateUserButton, CreateUserConfirmationModal, CreateUserModal } from './user-create';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../redpanda-ui/components/dialog';
import { useCreateUserForm } from '../hooks/use-create-user-form';

type CreateUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const CreateUserDialog = ({ open, onOpenChange }: CreateUserDialogProps) => {
  const [step, setStep] = useState<'form' | 'confirmation'>('form');
  const { state, isSubmitting, createUser } = useCreateUserForm(() => setStep('confirmation'));
  const navigate = useNavigate();
  const { username, mechanism, password, users } = state;

  const handleClose = () => onOpenChange(false);

  const onGoToUserDetails = () => {
    handleClose();
    navigate({ to: `/security/users/${username}/details` }).catch((error: unknown) => {
      toast.error('Failed to navigate', { description: String(error) });
    });
  };

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent size="md">
        {step === 'form' && (
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
          </DialogHeader>
        )}
        <DialogBody>
          {step === 'form' ? (
            <CreateUserModal state={state} />
          ) : (
            <CreateUserConfirmationModal
              closeModal={handleClose}
              mechanism={mechanism}
              onGoToUserDetails={onGoToUserDetails}
              password={password}
              username={username}
            />
          )}
        </DialogBody>
        {step === 'form' && (
          <DialogFooter>
            <Button onClick={handleClose} type="button" variant="outline">
              Cancel
            </Button>
            <CreateUserButton
              isSubmitting={isSubmitting}
              isValidPassword={state.isValidPassword}
              isValidUsername={state.isValidUsername}
              onClick={createUser}
              userExists={users.includes(username)}
              usernameEmpty={!username}
            />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
