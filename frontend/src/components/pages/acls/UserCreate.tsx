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
  Flex,
  FormField,
  Grid,
  Heading,
  IconButton,
  Input,
  PasswordInput,
  Result,
  Select,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  Tooltip,
  createStandaloneToast,
  isSingleValue,
  redpandaTheme,
  redpandaToastOptions,
} from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { useEffect, useMemo, useState } from 'react';
import { MdRefresh } from 'react-icons/md';
import { Link as ReactRouterLink } from 'react-router-dom';
import { appGlobal } from '../../../state/appGlobal';
import { api, rolesApi } from '../../../state/backendApi';
import { AclRequestDefault, type CreateUserRequest } from '../../../state/restInterfaces';
import { Features } from '../../../state/supportedFeatures';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import Section from '../../misc/Section';
import { SingleSelect } from '../../misc/Select';
import { PageComponent, type PageInitHelper } from '../Page';

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
class UserCreatePage extends PageComponent<{}> {
  @observable username = '';
  @observable password: string = generatePassword(30, false);
  @observable mechanism: 'SCRAM-SHA-256' | 'SCRAM-SHA-512' = 'SCRAM-SHA-256';

  @observable isValidUsername = false;
  @observable isValidPassword = false;

  @observable generateWithSpecialChars = false;
  @observable step: 'CREATE_USER' | 'CREATE_USER_CONFIRMATION' = 'CREATE_USER';
  @observable isCreating = false;

  @observable selectedRoles: string[] = [];

  constructor(p: any) {
    super(p);
    makeObservable(this);
    this.onCreateUser = this.onCreateUser.bind(this);
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Create user';
    p.addBreadcrumb('Access control', '/security');
    p.addBreadcrumb('Create user', '/security/users/create');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  async refreshData(force: boolean) {
    if (api.userData != null && !api.userData.canListAcls) return;

    await Promise.allSettled([api.refreshAcls(AclRequestDefault, force), api.refreshServiceAccounts(true)]);
  }

  render() {
    if (api.userData != null && !api.userData.canListAcls) return PermissionDenied;
    if (api.ACLs?.aclResources === undefined) return DefaultSkeleton;
    if (!api.serviceAccounts || !api.serviceAccounts.users) return DefaultSkeleton;

    this.isValidUsername = /^[a-zA-Z0-9._@-]+$/.test(this.username);
    this.isValidPassword = Boolean(this.password) && this.password.length >= 4 && this.password.length <= 64;

    const onCancel = () => appGlobal.history.push('/security/users');

    return (
      <>
        <ToastContainer />

        <PageContent>
          <Box>
            {this.step === 'CREATE_USER' ? (
              <CreateUserModal state={this} onCancel={onCancel} onCreateUser={this.onCreateUser} />
            ) : (
              <CreateUserConfirmationModal state={this} closeModal={onCancel} />
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
      if (api.userData != null && !api.userData.canListAcls) return false;
      await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), api.refreshServiceAccounts(true)]);

      // Add the user to the selected roles
      const roleAddPromises = [];
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
  (p: {
    state: CreateUserModalState;
    onCreateUser: () => Promise<boolean>;
    onCancel: () => void;
  }) => {
    const state = p.state;

    const isValidUsername = /^[a-zA-Z0-9._@-]+$/.test(state.username);
    const users = api.serviceAccounts?.users ?? [];
    const userAlreadyExists = users.includes(state.username);
    const isValidPassword = state.password && state.password.length >= 4 && state.password.length <= 64;

    const errorText = useMemo(() => {
      if (!isValidUsername) {
        return 'The username contains invalid characters. Use only letters, numbers, dots, underscores, at symbols, and hyphens.';
      }

      if (userAlreadyExists) {
        return 'User already exist';
      }
    }, [isValidUsername, userAlreadyExists]);

    return (
      <Box maxWidth="460px">
        <Flex gap="2em" direction="column">
          <FormField
            description="Must not contain any whitespace. Dots, hyphens and underscores may be used."
            label="Username"
            showRequiredIndicator
            isInvalid={(!isValidUsername || userAlreadyExists) && state.username.length > 0}
            errorText={errorText}
          >
            <Input
              data-testid="create-user-name"
              value={state.username}
              onChange={(v) => (state.username = v.target.value)}
              width="100%"
              autoFocus
              spellCheck={false}
              placeholder="Username"
              autoComplete="off"
            />
          </FormField>

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
                  value={state.password}
                  onChange={(e) => (state.password = e.target.value)}
                  isInvalid={!isValidPassword}
                />

                <Tooltip label={'Generate new random password'} placement="top" hasArrow>
                  <IconButton
                    onClick={() => (state.password = generatePassword(30, state.generateWithSpecialChars))}
                    variant="ghost"
                    aria-label="Refresh"
                    icon={<MdRefresh size={16} />}
                    display="inline-flex"
                  />
                </Tooltip>
                <Tooltip label={'Copy password'} placement="top" hasArrow>
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

          <FormField label="SASL Mechanism" showRequiredIndicator>
            <SingleSelect<'SCRAM-SHA-256' | 'SCRAM-SHA-512'>
              options={[
                {
                  value: 'SCRAM-SHA-256',
                  label: 'SCRAM-SHA-256',
                },
                {
                  value: 'SCRAM-SHA-512',
                  label: 'SCRAM-SHA-512',
                },
              ]}
              value={state.mechanism}
              onChange={(e) => {
                state.mechanism = e;
              }}
            />
          </FormField>

          {Features.rolesApi && (
            <FormField
              isDisabled={!Features.rolesApi}
              label="Assign roles"
              description="Assign roles to this user. This is optional and can be changed later."
            >
              <RoleSelector state={state.selectedRoles} />
            </FormField>
          )}
        </Flex>

        <Flex gap={4} mt={8}>
          <Button
            colorScheme="brand"
            onClick={p.onCreateUser}
            isDisabled={state.isCreating || !state.isValidUsername || !state.isValidPassword || userAlreadyExists}
            isLoading={state.isCreating}
            loadingText="Creating..."
          >
            Create
          </Button>
          <Button variant="link" isDisabled={state.isCreating} onClick={p.onCancel}>
            Cancel
          </Button>
        </Flex>
      </Box>
    );
  },
);

const CreateUserConfirmationModal = observer((p: { state: CreateUserModalState; closeModal: () => void }) => {
  return (
    <>
      <Heading as="h1" mt={4} mb={8}>
        <Flex alignItems="center">
          {/* <CheckCircleIcon color="green.500" mr={2} transform="translateY(-1px)" /> */}
          User created successfully
        </Flex>
      </Heading>

      <Alert status="info" mt={4} mb={4}>
        <AlertIcon />
        You will not be able to view this password again. Make sure that it is copied and saved.
      </Alert>

      <Grid templateColumns="max-content 1fr" gridRowGap={2} gridColumnGap={6} alignItems="center" maxWidth="460px">
        <Box fontWeight="bold" data-testid="username">
          Username
        </Box>
        <Box>
          <Flex alignItems="center" gap={2}>
            <Text wordBreak="break-all" overflow="hidden">
              {p.state.username}
            </Text>

            <Tooltip label={'Copy username'} placement="top" hasArrow>
              <CopyButton content={p.state.username} variant="ghost" />
            </Tooltip>
          </Flex>
        </Box>

        <Box fontWeight="bold" data-testid="password">
          Password
        </Box>
        <Box>
          <Flex alignItems="center" gap={2}>
            <PasswordInput name="test" value={p.state.password} isDisabled={true} isReadOnly={true} />

            <Tooltip label={'Copy password'} placement="top" hasArrow>
              <CopyButton content={p.state.password} variant="ghost" />
            </Tooltip>
          </Flex>
        </Box>

        <Box fontWeight="bold" data-testid="mechanism">
          Mechanism
        </Box>
        <Box>
          <Text textOverflow="ellipsis" whiteSpace="nowrap" overflow="hidden" isTruncated={true}>
            {p.state.mechanism}
          </Text>
        </Box>
      </Grid>

      <Flex gap={4} mt={8}>
        <Button onClick={p.closeModal}>Done</Button>
        <Button variant="link" as={ReactRouterLink} to="/security/acls">
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
          isMulti={false}
          options={availableRoles}
          inputValue={searchValue}
          onInputChange={setSearchValue}
          placeholder="Select roles..."
          noOptionsMessage={() => 'No roles found'}
          // TODO: Selecting an entry triggers onChange properly.
          //       But there is no way to prevent the component from showing no value as intended
          //       Seems to be a bug with the component.
          //       On 'undefined' it should handle selection on its own (this works properly)
          //       On 'null' the component should NOT show any selection after a selection has been made (does not work!)
          //       The override doesn't work either (isOptionSelected={()=>false})
          value={undefined}
          onChange={(val, meta) => {
            console.log('onChange', { metaAction: meta.action, val });
            if (val && isSingleValue(val) && val.value) {
              state.push(val.value);
              setSearchValue('');
            }
          }}
        />
      </Box>

      <Flex gap={2}>
        {state.map((role) => (
          <Tag key={role} cursor="pointer">
            <TagLabel>{role}</TagLabel>
            <TagCloseButton onClick={() => state.remove(role)} />
          </Tag>
        ))}
      </Flex>
    </Flex>
  );
});

const PermissionDenied = (
  <>
    <PageContent key="aclNoPerms">
      <Section>
        <Result
          title="Permission Denied"
          status={403}
          userMessage={
            <Text>
              You are not allowed to view this page.
              <br />
              Contact the administrator if you think this is an error.
            </Text>
          }
          extra={
            <a target="_blank" rel="noopener noreferrer" href="https://docs.redpanda.com/docs/manage/console/">
              <Button>Redpanda Console documentation</Button>
            </a>
          }
        />
      </Section>
    </PageContent>
  </>
);

export function generatePassword(length: number, allowSpecialChars: boolean): string {
  if (length <= 0) return '';

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
