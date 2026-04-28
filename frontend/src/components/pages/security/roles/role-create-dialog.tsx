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
import { CreateRoleRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { useState } from 'react';
import { toast } from 'sonner';

import { useCreateRoleMutation, useListRolesQuery } from '../../../../react-query/api/security';
import { Button } from '../../../redpanda-ui/components/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../redpanda-ui/components/dialog';
import { FieldError } from '../../../redpanda-ui/components/field';
import { Input } from '../../../redpanda-ui/components/input';
import { Label } from '../../../redpanda-ui/components/label';

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
  const { data: rolesData } = useListRolesQuery();

  const existingNames = new Set((rolesData?.roles ?? []).map((r) => r.name));
  const trimmed = roleName.trim();
  const alreadyExists = trimmed !== '' && existingNames.has(trimmed);

  const handleClose = () => {
    setRoleName('');
    setSubmitted(false);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    setSubmitted(true);
    if (!trimmed || alreadyExists) return;
    setIsSubmitting(true);
    try {
      await createRole(create(CreateRoleRequestSchema, { role: { name: trimmed } }));
      toast.success(`Role "${trimmed}" created`);
      handleClose();
      navigate({ to: '/security/roles/$roleName/details', params: { roleName: encodeURIComponent(trimmed) } });
    } catch (err) {
      toast.error(`Failed to create role: ${err instanceof Error ? err.message : String(err)}`);
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
