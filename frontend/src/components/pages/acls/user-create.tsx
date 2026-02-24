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

import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Checkbox,
  CopyButton,
  createStandaloneToast,
  Flex,
  FormField,
  Grid,
  Heading,
  IconButton,
  Input,
  isMultiValue,
  PasswordInput,
  redpandaTheme,
  redpandaToastOptions,
  Select,
  Text,
  Tooltip,
} from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import { RotateCwIcon } from 'components/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useListRolesQuery } from '../../../react-query/api/security';
import { invalidateUsersCache, useLegacyListUsersQuery } from '../../../react-query/api/user';
import { appGlobal } from '../../../state/app-global';
import { api, rolesApi } from '../../../state/backend-api';
import { AclRequestDefault } from '../../../state/rest-interfaces';
import { Features } from '../../../state/supported-features';
import { uiState } from '../../../state/ui-state';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SASL_MECHANISMS,
  type SaslMechanism,
  validatePassword,
  validateUsername,
} from '../../../utils/user';
import PageContent from '../../misc/page-content';
import { SingleSelect } from '../../misc/select';

const { ToastContainer, toast } = createStandaloneToast({
  theme: redpandaTheme,
  defaultOptions: {
    ...redpandaToastOptions.defaultOptions,
    isClosable: false,
    duration: 2000,
  },
});

const UserCreatePage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(() => generatePassword(30, false));
  const [mechanism, setMechanism] = useState<SaslMechanism>('SCRAM-SHA-256');
  const [generateWithSpecialChars, setGenerateWithSpecialChars] = useState(false);
  const [step, setStep] = useState<'CREATE_USER' | 'CREATE_USER_CONFIRMATION'>('CREATE_USER');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const { data: usersData } = useLegacyListUsersQuery();
  const users = usersData?.users?.map((u) => u.name) ?? [];

  const isValidUsername = validateUsername(username);
  const isValidPassword = validatePassword(password);

  useEffect(() => {
    uiState.pageTitle = 'Create user';
    uiState.pageBreadcrumbs = [];
    uiState.pageBreadcrumbs.push({ title: 'Access Control', linkTo: '/security' });
    uiState.pageBreadcrumbs.push({ title: 'Create user', linkTo: '/security/users/create' });

    const refreshData = async () => {
      if (api.userData !== null && api.userData !== undefined && !api.userData.canListAcls) {
        return;
      }
      await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), api.refreshServiceAccounts()]);
    };

    refreshData().catch(() => {
      // Silently ignore refresh errors
    });
    appGlobal.onRefresh = () =>
      refreshData().catch(() => {
        // Silently ignore refresh errors
      });
  }, []);

  const onCreateUser = useCallback(async (): Promise<boolean> => {
    try {
      setIsCreating(true);
      await api.createServiceAccount({
        username,
        password,
        mechanism,
      });

      if (api.userData !== null && api.userData !== undefined && !api.userData.canListAcls) {
        return false;
      }
      await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), invalidateUsersCache()]);

      const roleAddPromises: Promise<unknown>[] = [];
      for (const r of selectedRoles) {
        roleAddPromises.push(rolesApi.updateRoleMembership(r, [username], [], false));
      }
      await Promise.allSettled(roleAddPromises);

      setStep('CREATE_USER_CONFIRMATION');
    } catch (err) {
      toast({
        status: 'error',
        duration: null,
        isClosable: true,
        title: 'Failed to create user',
        description: String(err),
      });
    } finally {
      setIsCreating(false);
    }
    return true;
  }, [username, password, mechanism, selectedRoles]);

  const onCancel = () => appGlobal.historyPush('/security/users');

  const state = {
    username,
    setUsername,
    password,
    setPassword,
    mechanism,
    setMechanism,
    generateWithSpecialChars,
    setGenerateWithSpecialChars,
    isCreating,
    isValidUsername,
    isValidPassword,
    selectedRoles,
    setSelectedRoles,
    users,
  };

  return (
    <>
      <ToastContainer />

      <PageContent>
        <Box>
          {step === 'CREATE_USER' ? (
            <CreateUserModal onCancel={onCancel} onCreateUser={onCreateUser} state={state} />
          ) : (
            <CreateUserConfirmationModal
              closeModal={onCancel}
              mechanism={mechanism}
              password={password}
              username={username}
            />
          )}
        </Box>
      </PageContent>
    </>
  );
};

export default UserCreatePage;

type CreateUserModalProps = {
  state: {
    username: string;
    setUsername: (v: string) => void;
    password: string;
    setPassword: (v: string) => void;
    mechanism: SaslMechanism;
    setMechanism: (v: SaslMechanism) => void;
    generateWithSpecialChars: boolean;
    setGenerateWithSpecialChars: (v: boolean) => void;
    isCreating: boolean;
    isValidUsername: boolean;
    isValidPassword: boolean;
    selectedRoles: string[];
    setSelectedRoles: (v: string[]) => void;
    users: string[];
  };
  onCreateUser: () => Promise<boolean>;
  onCancel: () => void;
};

const CreateUserModal = ({ state, onCreateUser, onCancel }: CreateUserModalProps) => {
  const userAlreadyExists = state.users.includes(state.username);

  const errorText = useMemo(() => {
    if (!state.isValidUsername) {
      return 'The username contains invalid characters. Use only letters, numbers, dots, underscores, at symbols, and hyphens.';
    }

    if (userAlreadyExists) {
      return 'User already exists';
    }
  }, [state.isValidUsername, userAlreadyExists]);

  return (
    <Box maxWidth="460px">
      <Flex direction="column" gap="2em">
        <FormField
          description="Must not contain any whitespace. Dots, hyphens and underscores may be used."
          errorText={errorText}
          isInvalid={(!state.isValidUsername || userAlreadyExists) && state.username.length > 0}
          label="Username"
          showRequiredIndicator
        >
          <Input
            autoComplete="off"
            autoFocus
            data-testid="create-user-name"
            onChange={(v) => {
              state.setUsername(v.target.value);
            }}
            placeholder="Username"
            spellCheck={false}
            value={state.username}
            width="100%"
          />
        </FormField>

        <FormField
          data-testid="create-user-password"
          description={`Must be at least ${PASSWORD_MIN_LENGTH} characters and should not exceed ${PASSWORD_MAX_LENGTH} characters.`}
          label="Password"
          showRequiredIndicator={true}
        >
          <Flex direction="column" gap="2">
            <Flex alignItems="center" gap="2">
              <PasswordInput
                isInvalid={!state.isValidPassword}
                name="test"
                onChange={(e) => {
                  state.setPassword(e.target.value);
                }}
                value={state.password}
              />

              <Tooltip hasArrow label={'Generate new random password'} placement="top">
                <IconButton
                  aria-label="Refresh"
                  display="inline-flex"
                  icon={<RotateCwIcon size={16} />}
                  onClick={() => {
                    state.setPassword(generatePassword(30, state.generateWithSpecialChars));
                  }}
                  variant="ghost"
                />
              </Tooltip>
              <Tooltip hasArrow label={'Copy password'} placement="top">
                <CopyButton content={state.password} variant="ghost" />
              </Tooltip>
            </Flex>
            <Checkbox
              isChecked={state.generateWithSpecialChars}
              onChange={(e) => {
                state.setGenerateWithSpecialChars(e.target.checked);
                state.setPassword(generatePassword(30, e.target.checked));
              }}
            >
              Generate with special characters
            </Checkbox>
          </Flex>
        </FormField>

        <FormField label="SASL mechanism" showRequiredIndicator>
          <SingleSelect<SaslMechanism>
            onChange={(e) => {
              state.setMechanism(e);
            }}
            options={SASL_MECHANISMS.map((mechanism) => ({
              value: mechanism,
              label: mechanism,
            }))}
            value={state.mechanism}
          />
        </FormField>

        {Boolean(Features.rolesApi) && (
          <FormField
            description="Assign roles to this user. This is optional and can be changed later."
            isDisabled={!Features.rolesApi}
            label="Assign roles"
          >
            <StateRoleSelector roles={state.selectedRoles} setRoles={state.setSelectedRoles} />
          </FormField>
        )}
      </Flex>

      <Flex gap={4} mt={8}>
        <Button
          isDisabled={state.isCreating || !state.isValidUsername || !state.isValidPassword || userAlreadyExists}
          isLoading={state.isCreating}
          loadingText="Creating..."
          onClick={onCreateUser}
        >
          Create
        </Button>
        <Button isDisabled={state.isCreating} onClick={onCancel} variant="link">
          Cancel
        </Button>
      </Flex>
    </Box>
  );
};

type CreateUserConfirmationModalProps = {
  username: string;
  password: string;
  mechanism: SaslMechanism;
  closeModal: () => void;
};

const CreateUserConfirmationModal = ({
  username,
  password,
  mechanism,
  closeModal,
}: CreateUserConfirmationModalProps) => (
  <>
    <Heading as="h1" mb={8} mt={4}>
      <Flex alignItems="center">User created successfully</Flex>
    </Heading>

    <Alert mb={4} mt={4} status="info">
      <AlertIcon />
      You will not be able to view this password again. Make sure that it is copied and saved.
    </Alert>

    <Grid alignItems="center" gridColumnGap={6} gridRowGap={2} maxWidth="460px" templateColumns="max-content 1fr">
      <Box data-testid="username" fontWeight="bold">
        Username
      </Box>
      <Box>
        <Flex alignItems="center" gap={2}>
          <Text overflow="hidden" wordBreak="break-all">
            {username}
          </Text>

          <Tooltip hasArrow label={'Copy username'} placement="top">
            <CopyButton content={username} variant="ghost" />
          </Tooltip>
        </Flex>
      </Box>

      <Box data-testid="password" fontWeight="bold">
        Password
      </Box>
      <Box>
        <Flex alignItems="center" gap={2}>
          <PasswordInput isDisabled={true} isReadOnly={true} name="test" value={password} />

          <Tooltip hasArrow label={'Copy password'} placement="top">
            <CopyButton content={password} variant="ghost" />
          </Tooltip>
        </Flex>
      </Box>

      <Box data-testid="mechanism" fontWeight="bold">
        Mechanism
      </Box>
      <Box>
        <Text isTruncated={true} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
          {mechanism}
        </Text>
      </Box>
    </Grid>

    <Flex gap={4} mt={8}>
      <Button onClick={closeModal}>Done</Button>
      <Button
        as={Link}
        to={`/security/acls/create?principalType=User&principalName=${encodeURIComponent(username)}`}
        variant="link"
      >
        Create ACLs
      </Button>
    </Flex>
  </>
);

export const StateRoleSelector = ({ roles, setRoles }: { roles: string[]; setRoles: (roles: string[]) => void }) => {
  const [searchValue, setSearchValue] = useState('');
  const {
    data: { roles: allRoles },
  } = useListRolesQuery();
  const availableRoles = (allRoles ?? [])
    .filter((r: { name: string }) => !roles.includes(r.name))
    .map((r: { name: string }) => ({ value: r.name }));

  return (
    <Flex direction="column" gap={4}>
      <Box w="280px">
        <Select<string>
          inputValue={searchValue}
          isMulti={true}
          noOptionsMessage={() => 'No roles found'}
          onChange={(val) => {
            if (val && isMultiValue(val)) {
              setRoles([...val.map((selectedRole) => selectedRole.value)]);
              setSearchValue('');
            }
          }}
          onInputChange={setSearchValue}
          options={availableRoles}
          // TODO: Selecting an entry triggers onChange properly.
          //       But there is no way to prevent the component from showing no value as intended
          //       Seems to be a bug with the component.
          //       On 'undefined' it should handle selection on its own (this works properly)
          //       On 'null' the component should NOT show any selection after a selection has been made (does not work!)
          //       The override doesn't work either (isOptionSelected={()=>false})
          placeholder="Select roles..."
          value={roles.map((r) => ({ value: r }))}
        />
      </Box>
    </Flex>
  );
};

export function generatePassword(length: number, allowSpecialChars: boolean): string {
  if (length <= 0) {
    return '';
  }

  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = lowercase.toUpperCase();
  const numbers = '0123456789';
  const special = '.,&_+|[]/-()';

  let alphabet = lowercase + uppercase + numbers;
  if (allowSpecialChars) {
    alphabet += special;
  }

  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  let result = '';
  for (const n of randomValues) {
    const index = n % alphabet.length;
    const sym = alphabet[index];

    result += sym;
  }

  return result;
}
