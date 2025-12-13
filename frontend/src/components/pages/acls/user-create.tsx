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
  isSingleValue,
  PasswordInput,
  redpandaTheme,
  redpandaToastOptions,
  Select,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  Tooltip,
} from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { useEffect, useMemo, useState } from 'react';
import { MdRefresh } from 'react-icons/md';
import { Link as ReactRouterLink } from 'react-router-dom';

import { useListRolesQuery } from '../../../react-query/api/security';
import { appGlobal } from '../../../state/app-global';
import { api, rolesApi } from '../../../state/backend-api';
import { AclRequestDefault, type CreateUserRequest } from '../../../state/rest-interfaces';
import { Features } from '../../../state/supported-features';
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
import { PageComponent, type PageInitHelper } from '../page';

const { ToastContainer, toast } = createStandaloneToast({
  theme: redpandaTheme,
  defaultOptions: {
    ...redpandaToastOptions.defaultOptions,
    isClosable: false,
    duration: 2000,
  },
});

export type CreateUserModalState = CreateUserRequest & {
  generateWithSpecialChars: boolean;
  step: 'CREATE_USER' | 'CREATE_USER_CONFIRMATION';
  isCreating: boolean;
  isValidUsername: boolean;
  isValidPassword: boolean;
  selectedRoles: string[];
};

@observer
class UserCreatePage extends PageComponent {
  @observable username = '';
  @observable password: string = generatePassword(30, false);
  @observable mechanism: SaslMechanism = 'SCRAM-SHA-256';

  @observable isValidUsername = false;
  @observable isValidPassword = false;

  @observable generateWithSpecialChars = false;
  @observable step: 'CREATE_USER' | 'CREATE_USER_CONFIRMATION' = 'CREATE_USER';
  @observable isCreating = false;

  @observable selectedRoles: string[] = [];

  constructor(p: Readonly<{ matchedPath: string }>) {
    super(p);
    makeObservable(this);
    this.onCreateUser = this.onCreateUser.bind(this);
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Create user';
    p.addBreadcrumb('Access Control', '/security');
    p.addBreadcrumb('Create user', '/security/users/create');

    // biome-ignore lint/suspicious/noConsole: error logging
    this.refreshData(true).catch(console.error);
    // biome-ignore lint/suspicious/noConsole: error logging
    appGlobal.onRefresh = () => this.refreshData(true).catch(console.error);
  }

  async refreshData(force: boolean) {
    if (api.userData != null && !api.userData.canListAcls) {
      return;
    }

    await Promise.allSettled([api.refreshAcls(AclRequestDefault, force), api.refreshServiceAccounts()]);
  }

  render() {
    // if (api.userData != null && !api.userData.canListAcls) return PermissionDenied;
    // if (api.ACLs?.aclResources === undefined) return DefaultSkeleton;
    // if (!api.serviceAccounts || !api.serviceAccounts.users) return DefaultSkeleton;

    this.isValidUsername = validateUsername(this.username);
    this.isValidPassword = validatePassword(this.password);

    const onCancel = () => appGlobal.historyPush('/security/users');

    return (
      <>
        <ToastContainer />

        <PageContent>
          <Box>
            {this.step === 'CREATE_USER' ? (
              <CreateUserModal onCancel={onCancel} onCreateUser={this.onCreateUser} state={this} />
            ) : (
              <CreateUserConfirmationModal closeModal={onCancel} state={this} />
            )}
          </Box>
        </PageContent>
      </>
    );
  }

  async onCreateUser(): Promise<boolean> {
    try {
      this.isCreating = true;
      await api.createServiceAccount({
        username: this.username,
        password: this.password,
        mechanism: this.mechanism,
      });

      // Refresh user list
      if (api.userData != null && !api.userData.canListAcls) {
        return false;
      }
      await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), api.refreshServiceAccounts()]);

      // Add the user to the selected roles
      const roleAddPromises: Promise<unknown>[] = [];
      for (const r of this.selectedRoles) {
        roleAddPromises.push(rolesApi.updateRoleMembership(r, [this.username], [], false));
      }
      await Promise.allSettled(roleAddPromises);

      this.step = 'CREATE_USER_CONFIRMATION';
    } catch (err) {
      toast({
        status: 'error',
        duration: null,
        isClosable: true,
        title: 'Failed to create user',
        description: String(err),
      });
    } finally {
      this.isCreating = false;
    }
    return true;
  }
}

export default UserCreatePage;

const CreateUserModal = observer(
  (p: { state: CreateUserModalState; onCreateUser: () => Promise<boolean>; onCancel: () => void }) => {
    const state = p.state;

    const isValidUsername = validateUsername(state.username);
    const users = api.serviceAccounts?.users ?? [];
    const userAlreadyExists = users.includes(state.username);
    const isValidPassword = validatePassword(state.password);

    const errorText = useMemo(() => {
      if (!isValidUsername) {
        return 'The username contains invalid characters. Use only letters, numbers, dots, underscores, at symbols, and hyphens.';
      }

      if (userAlreadyExists) {
        return 'User already exists';
      }
    }, [isValidUsername, userAlreadyExists]);

    return (
      <Box maxWidth="460px">
        <Flex direction="column" gap="2em">
          <FormField
            description="Must not contain any whitespace. Dots, hyphens and underscores may be used."
            errorText={errorText}
            isInvalid={(!isValidUsername || userAlreadyExists) && state.username.length > 0}
            label="Username"
            showRequiredIndicator
          >
            <Input
              autoComplete="off"
              autoFocus
              data-testid="create-user-name"
              onChange={(v) => (state.username = v.target.value)}
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
                  isInvalid={!isValidPassword}
                  name="test"
                  onChange={(e) => (state.password = e.target.value)}
                  value={state.password}
                />

                <Tooltip hasArrow label={'Generate new random password'} placement="top">
                  <IconButton
                    aria-label="Refresh"
                    display="inline-flex"
                    icon={<MdRefresh size={16} />}
                    onClick={() => (state.password = generatePassword(30, state.generateWithSpecialChars))}
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
                  state.generateWithSpecialChars = e.target.checked;
                  state.password = generatePassword(30, e.target.checked);
                }}
              >
                Generate with special characters
              </Checkbox>
            </Flex>
          </FormField>

          <FormField label="SASL mechanism" showRequiredIndicator>
            <SingleSelect<SaslMechanism>
              onChange={(e) => {
                state.mechanism = e;
              }}
              options={SASL_MECHANISMS.map((mechanism) => ({
                value: mechanism,
                label: mechanism,
              }))}
              value={state.mechanism}
            />
          </FormField>

          {Features.rolesApi && (
            <FormField
              description="Assign roles to this user. This is optional and can be changed later."
              isDisabled={!Features.rolesApi}
              label="Assign roles"
            >
              <RoleSelector state={state.selectedRoles} />
            </FormField>
          )}
        </Flex>

        <Flex gap={4} mt={8}>
          <Button
            colorScheme="brand"
            isDisabled={state.isCreating || !state.isValidUsername || !state.isValidPassword || userAlreadyExists}
            isLoading={state.isCreating}
            loadingText="Creating..."
            onClick={p.onCreateUser}
          >
            Create
          </Button>
          <Button isDisabled={state.isCreating} onClick={p.onCancel} variant="link">
            Cancel
          </Button>
        </Flex>
      </Box>
    );
  }
);

const CreateUserConfirmationModal = observer((p: { state: CreateUserModalState; closeModal: () => void }) => {
  return (
    <>
      <Heading as="h1" mb={8} mt={4}>
        <Flex alignItems="center">
          {/* <CheckCircleIcon color="green.500" mr={2} transform="translateY(-1px)" /> */}
          User created successfully
        </Flex>
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
              {p.state.username}
            </Text>

            <Tooltip hasArrow label={'Copy username'} placement="top">
              <CopyButton content={p.state.username} variant="ghost" />
            </Tooltip>
          </Flex>
        </Box>

        <Box data-testid="password" fontWeight="bold">
          Password
        </Box>
        <Box>
          <Flex alignItems="center" gap={2}>
            <PasswordInput isDisabled={true} isReadOnly={true} name="test" value={p.state.password} />

            <Tooltip hasArrow label={'Copy password'} placement="top">
              <CopyButton content={p.state.password} variant="ghost" />
            </Tooltip>
          </Flex>
        </Box>

        <Box data-testid="mechanism" fontWeight="bold">
          Mechanism
        </Box>
        <Box>
          <Text isTruncated={true} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {p.state.mechanism}
          </Text>
        </Box>
      </Grid>

      <Flex gap={4} mt={8}>
        <Button onClick={p.closeModal}>Done</Button>
        <Button
          as={ReactRouterLink}
          to={`/security/acls/create?principalType=User&principalName=${encodeURIComponent(p.state.username)}`}
          variant="link"
        >
          Create ACLs
        </Button>
      </Flex>
    </>
  );
});

export const RoleSelector = observer((p: { state: string[] }) => {
  // Make sure we have up to date role info
  useEffect(() => {
    rolesApi.refreshRoles();
    rolesApi.refreshRoleMembers();
  }, []);
  const [searchValue, setSearchValue] = useState('');

  const state = p.state;

  const availableRoles = (rolesApi.roles ?? []).filter((r) => !state.includes(r)).map((r) => ({ value: r }));

  return (
    <Flex direction="column" gap={4}>
      <Box w="280px">
        <Select<string>
          inputValue={searchValue}
          isMulti={false}
          noOptionsMessage={() => 'No roles found'}
          onChange={(val, meta) => {
            // biome-ignore lint/suspicious/noConsole: debug logging
            console.log('onChange', { metaAction: meta.action, val });
            if (val && isSingleValue(val) && val.value) {
              state.push(val.value);
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
          value={undefined}
        />
      </Box>

      <Flex gap={2}>
        {state.map((role) => (
          <Tag cursor="pointer" key={role}>
            <TagLabel>{role}</TagLabel>
            <TagCloseButton onClick={() => state.remove(role)} />
          </Tag>
        ))}
      </Flex>
    </Flex>
  );
});

// use instead of RoleSelector whn not using mobx
export const StateRoleSelector = ({ roles, setRoles }: { roles: string[]; setRoles: (roles: string[]) => void }) => {
  const [searchValue, setSearchValue] = useState('');
  const {
    data: { roles: allRoles },
  } = useListRolesQuery();
  const availableRoles = (allRoles ?? []).filter((r) => !roles.includes(r.name)).map((r) => ({ value: r.name }));

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
