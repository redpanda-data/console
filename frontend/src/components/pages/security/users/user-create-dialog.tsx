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

import { create } from '@bufbuild/protobuf';
import { useNavigate } from '@tanstack/react-router';
import { CreateUserRequest_UserSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useCallback, useState } from 'react';
import { generatePassword } from 'utils/password';

import { CreateUserConfirmationModal, CreateUserModal } from './user-create';
import { getSASLMechanism, useCreateUserMutation, useListUsersQuery } from '../../../../react-query/api/user';
import { type SaslMechanism, validatePassword, validateUsername } from '../../../../utils/user';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../redpanda-ui/components/dialog';

type CreateUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const CreateUserDialog = ({ open, onOpenChange }: CreateUserDialogProps) => {
  const [formState, setFormState] = useState({
    username: '',
    password: generatePassword(30, false),
    mechanism: 'SCRAM-SHA-256' as SaslMechanism,
    generateWithSpecialChars: false,
  });
  const [step, setStep] = useState<'form' | 'confirmation'>('form');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();
  const { mutateAsync: createUserMutate } = useCreateUserMutation();
  const { data: usersData } = useListUsersQuery();
  const users = usersData?.users?.map((u) => u.name) ?? [];

  const { username, password, mechanism, generateWithSpecialChars } = formState;
  const setUsername = (v: string) => setFormState((prev) => ({ ...prev, username: v }));
  const setPassword = (v: string) => setFormState((prev) => ({ ...prev, password: v }));
  const setMechanism = (v: SaslMechanism) => setFormState((prev) => ({ ...prev, mechanism: v }));
  const setGenerateWithSpecialChars = (v: boolean) =>
    setFormState((prev) => ({ ...prev, generateWithSpecialChars: v }));

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const onCreateUser = useCallback(async (): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      await createUserMutate({
        user: create(CreateUserRequest_UserSchema, {
          name: username,
          password,
          mechanism: getSASLMechanism(mechanism),
        }),
      });
    } catch {
      setIsSubmitting(false);
      return false;
    }
    setIsSubmitting(false);
    setStep('confirmation');
    return true;
  }, [username, password, mechanism, createUserMutate]);

  const onGoToUserDetails = () => {
    handleClose();
    navigate({ to: `/security/users/${username}/details` });
  };

  const state = {
    username,
    setUsername,
    password,
    setPassword,
    mechanism,
    setMechanism,
    generateWithSpecialChars,
    setGenerateWithSpecialChars,
    isCreating: isSubmitting,
    isValidUsername: validateUsername(username),
    isValidPassword: validatePassword(password),
    users,
  };

  return (
    <>
      <Dialog onOpenChange={handleClose} open={open}>
        <DialogContent size="lg">
          {step === 'form' && (
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
            </DialogHeader>
          )}
          {step === 'form' ? (
            <CreateUserModal onCancel={handleClose} onCreateUser={onCreateUser} state={state} />
          ) : (
            <CreateUserConfirmationModal
              closeModal={handleClose}
              mechanism={mechanism}
              onGoToUserDetails={onGoToUserDetails}
              password={password}
              username={username}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
