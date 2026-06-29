import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { RotateCwIcon } from 'lucide-react';
import {
  UpdateRoleMembershipRequestSchema,
  type UpdateRoleMembershipResponse,
} from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { UpdateUserRequestSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useEffect, useState } from 'react';
import { generatePassword } from 'utils/password';

import { StateRoleSelector } from './user-create';
import { useListRolesQuery, useUpdateRoleMembershipMutation } from '../../../../react-query/api/security';
import { getSASLMechanism, useUpdateUserMutationWithToast } from '../../../../react-query/api/user';
import { rolesApi } from '../../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { formatToastErrorMessageGRPC, showToast } from '../../../../utils/toast.utils';
import { SASL_MECHANISMS, type SaslMechanism } from '../../../../utils/user';
import { Button } from '../../../redpanda-ui/components/button';
import { Checkbox } from '../../../redpanda-ui/components/checkbox';
import { CopyButton } from '../../../redpanda-ui/components/copy-button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../redpanda-ui/components/dialog';
import { Field, FieldDescription, FieldLabel } from '../../../redpanda-ui/components/field';
import { Input } from '../../../redpanda-ui/components/input';
import { Label } from '../../../redpanda-ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../redpanda-ui/components/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../redpanda-ui/components/tooltip';

type ChangePasswordModalProps = {
  userName: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

export const ChangePasswordModal = ({ userName, isOpen, setIsOpen }: ChangePasswordModalProps) => {
  const [password, setPassword] = useState(() => generatePassword(30, false));
  const [mechanism, setMechanism] = useState<SaslMechanism | undefined>(undefined);
  const [generateWithSpecialChars, setGenerateWithSpecialChars] = useState(false);
  const isValidPassword = password && password.length >= 4 && password.length <= 64;
  const { mutateAsync: updateUser, isPending: isUpdateUserPending } = useUpdateUserMutationWithToast();

  const onSavePassword = async () => {
    try {
      await updateUser(
        create(UpdateUserRequestSchema, {
          user: { name: userName, mechanism: mechanism ? getSASLMechanism(mechanism) : undefined, password },
        })
      );
      showToast({ status: 'success', title: `Password for user ${userName} updated` });
      setIsOpen(false);
    } catch (error) {
      showToast({
        status: 'error',
        title: formatToastErrorMessageGRPC({
          error: ConnectError.from(error),
          action: 'update',
          entity: 'user',
        }),
      });
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && isUpdateUserPending) setIsOpen(false);
      }}
      open={isOpen}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Change {userName} password</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel required>Password</FieldLabel>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Input
                    aria-invalid={!isValidPassword}
                    data-testid="create-user-password"
                    name="test"
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    value={password}
                  />
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          aria-label="Refresh"
                          onClick={() => setPassword(generatePassword(30, generateWithSpecialChars))}
                          size="icon"
                          variant="ghost"
                        >
                          <RotateCwIcon size={16} />
                        </Button>
                      }
                    />
                    <TooltipContent side="top">Generate new random password</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger render={<CopyButton content={password} size="icon" variant="ghost" />} />
                    <TooltipContent side="top">Copy password</TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={generateWithSpecialChars}
                    id="special-chars-edit"
                    onCheckedChange={(checked) => {
                      const val = checked === true;
                      setGenerateWithSpecialChars(val);
                      setPassword(generatePassword(30, val));
                    }}
                  />
                  <Label className="cursor-pointer" htmlFor="special-chars-edit">
                    Generate with special characters
                  </Label>
                </div>
              </div>
              <FieldDescription>Must be at least 4 characters and should not exceed 64 characters.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel required>SASL mechanism</FieldLabel>
              <Select onValueChange={(v) => setMechanism(v as SaslMechanism)} value={mechanism ?? ''}>
                <SelectTrigger>
                  <SelectValue placeholder="Select mechanism..." />
                </SelectTrigger>
                <SelectContent>
                  {SASL_MECHANISMS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button disabled={isUpdateUserPending} onClick={() => setIsOpen(false)} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!isValidPassword || mechanism === undefined || isUpdateUserPending}
            onClick={onSavePassword}
            type="submit"
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type ChangeRolesModalProps = {
  userName: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

export const ChangeRolesModal = ({ userName, isOpen, setIsOpen }: ChangeRolesModalProps) => {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const [selectedRoles, setSelectedRoles] = useState<string[] | undefined>(undefined);
  const { mutateAsync: updateRoleMembership, isPending: isUpdateMembershipPending } = useUpdateRoleMembershipMutation();
  const { data, isLoading } = useListRolesQuery({ filter: { principal: userName } });
  const originalRoles = data.roles.map((r) => r.name);

  useEffect(() => {
    if (!isLoading && selectedRoles === undefined) {
      queueMicrotask(() => setSelectedRoles([...originalRoles]));
    }
  }, [originalRoles, isLoading, selectedRoles]);

  const onSaveRoles = async () => {
    if (!featureRolesApi) return;

    const formattedSelectedRoles = selectedRoles ?? [];
    const addedRoles = formattedSelectedRoles.except(originalRoles);
    const removedRoles = originalRoles.except(formattedSelectedRoles);
    const promises: Promise<UpdateRoleMembershipResponse>[] = [
      ...removedRoles.map((r) =>
        updateRoleMembership(
          create(UpdateRoleMembershipRequestSchema, { roleName: r, remove: [{ principal: userName }] })
        )
      ),
      ...addedRoles.map((r) =>
        updateRoleMembership(create(UpdateRoleMembershipRequestSchema, { roleName: r, add: [{ principal: userName }] }))
      ),
    ];

    try {
      await Promise.allSettled(promises);
      // TODO: Until we haven't migrated everything from mobx is better to not remove this
      await Promise.all([rolesApi.refreshRoles(), rolesApi.refreshRoleMembers()]);
      showToast({
        status: 'success',
        title: `${addedRoles.length} roles added, ${removedRoles.length} removed from user ${userName}`,
      });
      setIsOpen(false);
    } catch (error) {
      showToast({
        status: 'error',
        title: formatToastErrorMessageGRPC({
          error: ConnectError.from(error),
          action: 'update',
          entity: 'role',
        }),
      });
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && isUpdateMembershipPending) setIsOpen(false);
      }}
      open={isOpen}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Change {userName} roles</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Field>
            <FieldLabel>Assign roles</FieldLabel>
            <FieldDescription>Assign roles to this user. This is optional and can be changed later.</FieldDescription>
            <StateRoleSelector roles={selectedRoles ?? []} setRoles={setSelectedRoles} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button disabled={isUpdateMembershipPending} onClick={() => setIsOpen(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={isUpdateMembershipPending} onClick={onSaveRoles} type="submit">
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
