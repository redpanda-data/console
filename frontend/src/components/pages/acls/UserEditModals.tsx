import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import {
  Button,
  Checkbox,
  CopyButton,
  Flex,
  FormField,
  IconButton,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  PasswordInput,
  Tooltip,
  useToast,
} from '@redpanda-data/ui';
import {
  UpdateRoleMembershipRequestSchema,
  type UpdateRoleMembershipResponse,
} from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { SASLMechanism, UpdateUserRequestSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useEffect, useState } from 'react';
import { MdRefresh } from 'react-icons/md';
import { useListRolesQuery, useUpdateRoleMembershipMutation } from '../../../react-query/api/security';
import { useUpdateUserMutationWithToast } from '../../../react-query/api/user';
import { rolesApi } from '../../../state/backendApi';
import { Features } from '../../../state/supportedFeatures';
import { formatToastErrorMessageGRPC, showToast } from '../../../utils/toast.utils';
import { SingleSelect } from '../../misc/Select';
import { generatePassword, StateRoleSelector } from './UserCreate';

type ChangePasswordModalProps = {
  userName: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

export const ChangePasswordModal = ({ userName, isOpen, setIsOpen }: ChangePasswordModalProps) => {
  const toast = useToast();
  const [password, setPassword] = useState(generatePassword(30, false));
  const [mechanism, setMechanism] = useState<SASLMechanism>();
  const [generateWithSpecialChars, setGenerateWithSpecialChars] = useState(false);
  const isValidPassword = password && password.length >= 4 && password.length <= 64;
  const { mutateAsync: updateUser, isPending: isUpdateUserPending } = useUpdateUserMutationWithToast();

  const onSavePassword = async () => {
    const updateRequest = create(UpdateUserRequestSchema, {
      user: {
        name: userName,
        mechanism: mechanism,
        password: password,
      },
    });
    try {
      await updateUser(updateRequest);
      toast({
        status: 'success',
        title: `Password for user ${userName} updated`,
      });
      setIsOpen(false);
    } catch (error) {
      showToast({
        title: formatToastErrorMessageGRPC({
          error: ConnectError.from(error),
          action: 'update',
          entity: 'user',
        }),
        status: 'error',
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        isUpdateUserPending && setIsOpen(false);
      }}
    >
      <ModalOverlay />
      <ModalContent minW="2xl">
        <ModalHeader>{`Change ${userName} password`}</ModalHeader>
        <ModalBody>
          <Flex gap={4} flexDirection="column">
            <FormField
              description="Must be at least 4 characters and should not exceed 64 characters."
              showRequiredIndicator={true}
              label="Password"
              data-testid="create-user-password"
            >
              <Flex direction="column" gap="2">
                <Flex alignItems="center" gap="2">
                  <PasswordInput
                    name="test"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    isInvalid={!isValidPassword}
                  />

                  <Tooltip label={'Generate new random password'} placement="top" hasArrow>
                    <IconButton
                      onClick={() => setPassword(generatePassword(30, generateWithSpecialChars))}
                      variant="ghost"
                      aria-label="Refresh"
                      icon={<MdRefresh size={16} />}
                      display="inline-flex"
                    />
                  </Tooltip>
                  <Tooltip label={'Copy password'} placement="top" hasArrow>
                    <CopyButton content={password} variant="ghost" />
                  </Tooltip>
                </Flex>
                <Checkbox
                  isChecked={generateWithSpecialChars}
                  onChange={(e) => {
                    setGenerateWithSpecialChars(e.target.checked);
                    setPassword(generatePassword(30, e.target.checked));
                  }}
                >
                  Generate with special characters
                </Checkbox>
              </Flex>
            </FormField>
            <FormField label="SASL mechanism" showRequiredIndicator>
              <SingleSelect<SASLMechanism | undefined>
                options={[
                  {
                    value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
                    label: 'SCRAM-SHA-256',
                  },
                  {
                    value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512,
                    label: 'SCRAM-SHA-512',
                  },
                ]}
                value={mechanism}
                onChange={(e) => {
                  setMechanism(e);
                }}
              />
            </FormField>
          </Flex>
        </ModalBody>
        <ModalFooter display="flex" gap={2}>
          <Button
            variant="ghost"
            isDisabled={isUpdateUserPending}
            onClick={() => {
              setIsOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="solid"
            type="submit"
            onClick={onSavePassword}
            isDisabled={!isValidPassword || mechanism === undefined || isUpdateUserPending}
          >
            Save changes
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

type ChangeRolesModalProps = {
  userName: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
};

export const ChangeRolesModal = ({ userName, isOpen, setIsOpen }: ChangeRolesModalProps) => {
  const toast = useToast();
  const [selectedRoles, setSelectedRoles] = useState<string[] | undefined>(undefined);
  const { mutateAsync: updateRoleMembership, isPending: isUpdateMembershipPending } = useUpdateRoleMembershipMutation();
  const { data, isLoading } = useListRolesQuery({ filter: { principal: userName } });
  const originalRoles = data.roles.map((r) => r.name);

  useEffect(() => {
    if (!isLoading && selectedRoles === undefined) {
      setSelectedRoles([...originalRoles]);
    }
  }, [originalRoles, isLoading, selectedRoles]);

  const onSaveRoles = async () => {
    if (!Features.rolesApi) return;
    let formattedSelectedRoles: string[] = [];
    if (selectedRoles) {
      formattedSelectedRoles = selectedRoles;
    }
    const addedRoles = formattedSelectedRoles.except(originalRoles);
    const removedRoles = originalRoles.except(formattedSelectedRoles);
    try {
      const promises: Promise<UpdateRoleMembershipResponse>[] = [];

      // Remove user from "removedRoles"
      for (const r of removedRoles) {
        const membership = create(UpdateRoleMembershipRequestSchema, {
          roleName: r,
          remove: [{ principal: userName }],
        });
        promises.push(updateRoleMembership(membership));
      }
      // Add to newly selected roles
      for (const r of addedRoles) {
        const membership = create(UpdateRoleMembershipRequestSchema, {
          roleName: r,
          add: [{ principal: userName }],
        });
        promises.push(updateRoleMembership(membership));
      }

      await Promise.allSettled(promises);
      // TODO: Until we haven't migrated everything from mobx is better to not remove this
      await rolesApi.refreshRoles();
      await rolesApi.refreshRoleMembers();

      toast({
        status: 'success',
        title: `${addedRoles.length} roles added, ${removedRoles.length} removed from user ${userName}`,
      });
      setIsOpen(false);
    } catch (error) {
      showToast({
        title: formatToastErrorMessageGRPC({
          error: ConnectError.from(error),
          action: 'update',
          entity: 'role',
        }),
        status: 'error',
      });
    }
  };
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        isUpdateMembershipPending && setIsOpen(false);
      }}
    >
      <ModalOverlay />
      <ModalContent minW="2xl">
        <ModalHeader>{`Change ${userName} roles`}</ModalHeader>
        <ModalBody>
          <FormField
            isDisabled={!Features.rolesApi}
            label="Assign roles"
            description="Assign roles to this user. This is optional and can be changed later."
          >
            <StateRoleSelector roles={selectedRoles || []} setRoles={setSelectedRoles} />
          </FormField>
        </ModalBody>
        <ModalFooter display="flex" gap={2}>
          <Button
            variant="ghost"
            isDisabled={isUpdateMembershipPending}
            onClick={() => {
              setIsOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="solid"
            type="submit"
            onClick={onSaveRoles}
            isDisabled={isUpdateMembershipPending}
            isLoading={isUpdateMembershipPending}
          >
            Save changes
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
