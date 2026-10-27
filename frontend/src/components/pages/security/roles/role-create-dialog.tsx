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
import { ConnectError } from '@connectrpc/connect';
import { useNavigate } from '@tanstack/react-router';
import { CreateRoleRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { useState } from 'react';
import { toast } from 'sonner';

import { useCreateRoleMutation } from '../../../../react-query/api/security';
import { Button } from '../../../redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../redpanda-ui/components/dialog';
import { FieldError } from '../../../redpanda-ui/components/field';
import { Input } from '../../../redpanda-ui/components/input';
import { Label } from '../../../redpanda-ui/components/label';
import { useRoleNameAvailability } from '../hooks/use-role-name-availability';

type RoleCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const RoleCreateDialog = ({ open, onOpenChange }: RoleCreateDialogProps) => {
  const [roleName, setRoleName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();
  const { mutateAsync: createRole } = useCreateRoleMutation();
  const { trimmed, alreadyExists } = useRoleNameAvailability(roleName);

  const handleClose = () => {
    setRoleName('');
    setSubmitted(false);
    onOpenChange(false);
  };

  const createAndOpenRole = async (name: string) => {
    await createRole(create(CreateRoleRequestSchema, { role: { name } }));
    toast.success(`Role "${name}" created`);
    handleClose();
    // Handled here so a navigation failure is not reported as a failed role create.
    navigate({
      to: '/security/roles/$roleName/details',
      params: { roleName: encodeURIComponent(name) },
      search: { host: undefined },
    }).catch((error: unknown) => {
      toast.error('Failed to navigate', { description: String(error) });
    });
  };

  const handleSubmit = async () => {
    setSubmitted(true);
    if (!trimmed || alreadyExists) {
      return;
    }
    setIsSubmitting(true);
    try {
      await createAndOpenRole(trimmed);
    } catch (err) {
      toast.error(`Failed to create role: ${ConnectError.from(err).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create role</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="role-name">Role name</Label>
            <Input
              autoFocus
              id="role-name"
              onChange={(e) => setRoleName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="analytics-writer"
              value={roleName}
            />
            {submitted && alreadyExists && <FieldError>A role with this name already exists.</FieldError>}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={handleClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={!trimmed || (submitted && alreadyExists) || isSubmitting} onClick={handleSubmit}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
