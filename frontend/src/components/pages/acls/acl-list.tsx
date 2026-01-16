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

import { create } from '@bufbuild/protobuf';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
  Link as ChakraLink,
  CloseButton,
  createStandaloneToast,
  DataTable,
  Flex,
  Icon,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  redpandaTheme,
  redpandaToastOptions,
  SearchField,
  Tabs,
  Text,
  Tooltip,
} from '@redpanda-data/ui';
import type { TabsItemProps } from '@redpanda-data/ui/dist/components/Tabs/Tabs';
import { Link, useNavigate } from '@tanstack/react-router';
import { EditIcon, MoreHorizontalIcon, TrashIcon } from 'components/icons';
import { isServerless } from 'config';
import { observer } from 'mobx-react';
import { parseAsString } from 'nuqs';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  type DeleteACLsRequest,
  DeleteACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { type FC, useEffect, useRef, useState } from 'react';

import { DeleteRoleConfirmModal } from './delete-role-confirm-modal';
import { DeleteUserConfirmModal } from './delete-user-confirm-modal';
import type { AclPrincipalGroup } from './models';
import {
  createEmptyClusterAcl,
  createEmptyConsumerGroupAcl,
  createEmptyTopicAcl,
  createEmptyTransactionalIdAcl,
  principalGroupsView,
} from './models';
import { AclPrincipalGroupEditor } from './principal-group-editor';
import { ChangePasswordModal, ChangeRolesModal } from './user-edit-modals';
import { UserRoleTags } from './user-permission-assignments';
import ErrorResult from '../../../components/misc/error-result';
import { useQueryStateWithCallback } from '../../../hooks/use-query-state-with-callback';
import { useDeleteAclMutation, useListACLAsPrincipalGroups } from '../../../react-query/api/acl';
import { useInvalidateUsersCache, useLegacyListUsersQuery } from '../../../react-query/api/user';
import { appGlobal } from '../../../state/app-global';
import { api, rolesApi } from '../../../state/backend-api';
import { AclRequestDefault } from '../../../state/rest-interfaces';
import { Features } from '../../../state/supported-features';
import { uiState } from '../../../state/ui-state';
import { Code as CodeEl, DefaultSkeleton } from '../../../utils/tsx-utils';
import { FeatureLicenseNotification } from '../../license/feature-license-notification';
import { NullFallbackBoundary } from '../../misc/null-fallback-boundary';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';

// TODO - once AclList is migrated to FC, we could should move this code to use useToast()
const { ToastContainer, toast } = createStandaloneToast({
  theme: redpandaTheme,
  defaultOptions: {
    ...redpandaToastOptions.defaultOptions,
    isClosable: false,
    duration: 2000,
  },
});

export type AclListTab = 'users' | 'roles' | 'acls' | 'permissions-list';

const getCreateUserButtonProps = () => {
  const hasRBAC = api.userData?.canManageUsers !== undefined;

  return {
    isDisabled:
      !(api.isAdminApiConfigured && Features.createUser) || (hasRBAC && api.userData?.canManageUsers === false),
    tooltip: [
      !api.isAdminApiConfigured && 'The Redpanda Admin API is not configured.',
      !Features.createUser && "Your cluster doesn't support this feature.",
      hasRBAC &&
        api.userData?.canManageUsers === false &&
        'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.',
    ]
      .filter(Boolean)
      .join(' '),
  };
};

const AclList: FC<{ tab?: AclListTab }> = observer(({ tab }: { tab?: AclListTab }) => {
  const { data: usersData, isLoading: isUsersLoading } = useLegacyListUsersQuery(undefined, {
    enabled: api.isAdminApiConfigured,
  });

  // Set up page title and breadcrumbs
  useEffect(() => {
    uiState.pageBreadcrumbs = [];
    uiState.pageTitle = 'Access Control';
    uiState.pageBreadcrumbs.push({ title: 'Access Control', linkTo: '/security' });

    // Set up refresh handler
    const refreshData = async () => {
      await Promise.allSettled([rolesApi.refreshRoles(), api.refreshUserData()]);
      await rolesApi.refreshRoleMembers();
    };

    appGlobal.onRefresh = async () => {
      await refreshData();
    };

    // Initial data load
    refreshData().catch(() => {
      // Fail silently for now
    });
  }, []);

  // Note: Redirect from /security/ to /security/users is now handled at route level
  // in src/routes/security/index.tsx using beforeLoad to prevent navigation loops
  // in embedded mode where shell and console routers can conflict.

  if (isUsersLoading && !usersData?.users?.length) {
    return DefaultSkeleton;
  }

  const warning =
    api.ACLs === null ? (
      <Alert status="warning" style={{ marginBottom: '1em' }}>
        <AlertIcon />
        You do not have the necessary permissions to view ACLs
      </Alert>
    ) : null;

  const noAclAuthorizer =
    api.ACLs?.isAuthorizerEnabled === false ? (
      <Alert status="warning" style={{ marginBottom: '1em' }}>
        <AlertIcon />
        There's no authorizer configured in your Kafka cluster
      </Alert>
    ) : null;

  const tabs = [
    {
      key: 'users' as AclListTab,
      name: 'Users',
      component: <UsersTab data-testid="users-tab" />,
      isDisabled:
        (!api.isAdminApiConfigured && 'The Redpanda Admin API is not configured.') ||
        (!Features.createUser && "Your cluster doesn't support this feature.") ||
        (api.userData?.canManageUsers !== undefined &&
          api.userData?.canManageUsers === false &&
          'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.'),
    },
    isServerless()
      ? null
      : {
          key: 'roles' as AclListTab,
          name: 'Roles',
          component: <RolesTab data-testid="roles-tab" />,
          isDisabled:
            (!Features.rolesApi && "Your cluster doesn't support this feature.") ||
            (api.userData?.canManageUsers === false && 'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.'),
        },
    {
      key: 'acls' as AclListTab,
      name: 'ACLs',
      component: <AclsTab data-testid="acls-tab" principalGroups={principalGroupsView.principalGroups} />,
      isDisabled: api.userData?.canListAcls ? false : 'You do not have the necessary permissions to view ACLs.',
    },
    {
      key: 'permissions-list' as AclListTab,
      name: 'Permissions List',
      component: <PermissionsListTab data-testid="permissions-list-tab" />,
      isDisabled: api.userData?.canViewPermissionsList
        ? false
        : 'You need (KafkaAclOperation.DESCRIBE and RedpandaCapability.MANAGE_REDPANDA_USERS permissions.',
    },
  ].filter((x) => x !== null) as TabsItemProps[];

  const activeTab = tabs.findIndex((x) => x.key === tab);

  return (
    <>
      <ToastContainer />

      {warning}
      {noAclAuthorizer}

      <PageContent>
        <Tabs
          index={activeTab >= 0 ? activeTab : 0}
          items={tabs}
          onChange={(_, key) => {
            appGlobal.historyPush(`/security/${key}`);
          }}
        />
      </PageContent>
    </>
  );
});

export default AclList;

type UsersEntry = { name: string; type: 'SERVICE_ACCOUNT' | 'PRINCIPAL' };
const PermissionsListTab = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const {
    data: usersData,
    isError: isUsersError,
    error: usersError,
  } = useLegacyListUsersQuery(undefined, {
    enabled: api.isAdminApiConfigured,
  });

  const { data: principalGroupsData, isError: isAclsError, error: aclsError } = useListACLAsPrincipalGroups();

  // Check for errors from both queries
  if (isUsersError && usersError) {
    return (
      <Alert status="error">
        <AlertIcon />
        <AlertTitle>Failed to load users</AlertTitle>
        <AlertDescription>{usersError.message}</AlertDescription>
      </Alert>
    );
  }

  if (isAclsError && aclsError) {
    return <ErrorResult error={aclsError} />;
  }

  const users: UsersEntry[] = (usersData?.users ?? []).map((u) => ({
    name: u.name,
    type: 'SERVICE_ACCOUNT',
  }));

  // In addition, find all principals that are referenced by roles, or acls, that are not service accounts
  for (const g of principalGroupsData ?? []) {
    if (g.principalType === 'User' && !g.principalName.includes('*') && !users.any((u) => u.name === g.principalName)) {
      // is it a user that is being referenced?
      // is the user already listed as a service account?
      users.push({ name: g.principalName, type: 'PRINCIPAL' });
    }
  }

  for (const [_, roleMembers] of rolesApi.roleMembers ?? []) {
    for (const roleMember of roleMembers) {
      if (!users.any((u) => u.name === roleMember.name)) {
        // make sure that user isn't already in the list
        users.push({ name: roleMember.name, type: 'PRINCIPAL' });
      }
    }
  }

  const usersFiltered = users.filter((u) => {
    const filter = searchQuery;
    if (!filter) {
      return true;
    }

    try {
      const quickSearchRegExp = new RegExp(filter, 'i');
      return u.name.match(quickSearchRegExp);
    } catch {
      return false;
    }
  });

  return (
    <Flex flexDirection="column" gap="4">
      <Box>
        This page provides a detailed overview of all effective permissions for each principal, including those derived
        from assigned roles. While the ACLs tab shows permissions directly granted to principals, this tab also
        incorporates roles that may assign additional permissions to a principal. This gives you a complete picture of
        what each principal can do within your cluster.
      </Box>

      <SearchField
        placeholderText="Filter by name"
        searchText={searchQuery}
        setSearchText={setSearchQuery}
        width="300px"
      />

      <Section>
        <Box my={4}>
          <DataTable<UsersEntry>
            columns={[
              {
                id: 'name',
                size: Number.POSITIVE_INFINITY,
                header: 'Principal',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return (
                    <ChakraLink as={Link} textDecoration="none" to={`/security/users/${entry.name}/details`}>
                      {entry.name}
                    </ChakraLink>
                  );
                },
              },
              {
                id: 'assignedRoles',
                header: 'Permissions',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return <UserRoleTags showMaxItems={2} userName={entry.name} />;
                },
              },
            ]}
            data={usersFiltered}
            emptyAction={
              <Button
                variant="outline"
                {...getCreateUserButtonProps()}
                onClick={() => appGlobal.historyPush('/security/users/create')}
              >
                Create user
              </Button>
            }
            emptyText="No principals yet"
            pagination
            sorting
          />
        </Box>
      </Section>
    </Flex>
  );
};

const UsersTab = () => {
  const [searchQuery, setSearchQuery] = useQueryStateWithCallback<string>(
    {
      onUpdate: () => {
        // Query state is managed by the URL
      },
      getDefaultValue: () => '',
    },
    'q',
    parseAsString.withDefault('')
  );
  const { data: usersData, isError, error } = useLegacyListUsersQuery();

  const users: UsersEntry[] = (usersData?.users ?? []).map((u) => ({
    name: u.name,
    type: 'SERVICE_ACCOUNT',
  }));

  const usersFiltered = users.filter((u) => {
    const filter = searchQuery;
    if (!filter) {
      return true;
    }

    try {
      const quickSearchRegExp = new RegExp(filter, 'i');
      return u.name.match(quickSearchRegExp);
    } catch {
      return false;
    }
  });

  if (isError && error) {
    return (
      <Alert status="error">
        <AlertIcon />
        <AlertTitle>Failed to load users</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  return (
    <Flex flexDirection="column" gap="4">
      <Box>
        These users are SASL-SCRAM users managed by your cluster. View permissions for other authentication identities
        (for example, OIDC, mTLS) on the Permissions List page.
      </Box>

      <SearchField
        data-testid="search-field-input"
        placeholderText="Filter by name"
        searchText={searchQuery ?? ''}
        setSearchText={(x) => setSearchQuery(x)}
        width="300px"
      />

      <Section>
        <Tooltip
          hasArrow
          isDisabled={Features.createUser}
          label="The cluster does not support this feature"
          placement="top"
        >
          <Button
            data-testid="create-user-button"
            variant="outline"
            {...getCreateUserButtonProps()}
            onClick={() => appGlobal.historyPush('/security/users/create')}
          >
            Create user
          </Button>
        </Tooltip>

        <Box my={4}>
          <DataTable<UsersEntry>
            columns={[
              {
                id: 'name',
                size: Number.POSITIVE_INFINITY,
                header: 'User',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return (
                    <ChakraLink as={Link} textDecoration="none" to={`/security/users/${entry.name}/details`}>
                      {entry.name}
                    </ChakraLink>
                  );
                },
              },
              {
                id: 'assignedRoles',
                header: 'Permissions',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return <UserRoleTags showMaxItems={2} userName={entry.name} />;
                },
              },
              {
                size: 60,
                id: 'menu',
                header: '',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return <UserActions user={entry} />;
                },
              },
            ]}
            data={usersFiltered}
            emptyAction={
              <Button
                variant="outline"
                {...getCreateUserButtonProps()}
                onClick={() => appGlobal.historyPush('/security/users/create')}
              >
                Create user
              </Button>
            }
            emptyText="No users yet"
            pagination
            sorting
          />
        </Box>
      </Section>
    </Flex>
  );
};

const UserActions = ({ user }: { user: UsersEntry }) => {
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isChangeRolesModalOpen, setIsChangeRolesModalOpen] = useState(false);
  const invalidateUsersCache = useInvalidateUsersCache();

  const onConfirmDelete = async () => {
    await api.deleteServiceAccount(user.name);

    // Remove user from all its roles
    const promises: Promise<unknown>[] = [];
    for (const [roleName, members] of rolesApi.roleMembers) {
      if (members.any((m) => m.name === user.name)) {
        // is this user part of this role?
        // then remove it
        promises.push(rolesApi.updateRoleMembership(roleName, [], [user.name]));
      }
    }

    await Promise.allSettled(promises);
    await rolesApi.refreshRoleMembers();
    await invalidateUsersCache();
  };

  return (
    <>
      {Boolean(api.isAdminApiConfigured) && (
        <ChangePasswordModal
          isOpen={isChangePasswordModalOpen}
          setIsOpen={setIsChangePasswordModalOpen}
          userName={user.name}
        />
      )}
      {Boolean(Features.rolesApi) && (
        <ChangeRolesModal isOpen={isChangeRolesModalOpen} setIsOpen={setIsChangeRolesModalOpen} userName={user.name} />
      )}

      <Menu>
        <MenuButton as={Button} className="deleteButton" style={{ height: 'auto' }} variant="ghost">
          <Icon as={MoreHorizontalIcon} />
        </MenuButton>
        <MenuList>
          {Boolean(api.isAdminApiConfigured) && (
            <MenuItem
              onClick={(e) => {
                e.stopPropagation();
                setIsChangePasswordModalOpen(true);
              }}
            >
              Change password
            </MenuItem>
          )}
          {Boolean(Features.rolesApi) && (
            <MenuItem
              onClick={(e) => {
                e.stopPropagation();
                setIsChangeRolesModalOpen(true);
              }}
            >
              Change roles
            </MenuItem>
          )}
          <DeleteUserConfirmModal
            buttonEl={<MenuItem type="button">Delete</MenuItem>}
            onConfirm={onConfirmDelete}
            userName={user.name}
          />
        </MenuList>
      </Menu>
    </>
  );
};

const RolesTab = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const roles = (rolesApi.roles ?? []).filter((u) => {
    const filter = searchQuery;
    if (!filter) {
      return true;
    }
    try {
      const quickSearchRegExp = new RegExp(filter, 'i');
      return u.match(quickSearchRegExp);
    } catch {
      return false;
    }
  });

  const rolesWithMembers = roles.map((r) => {
    const members = rolesApi.roleMembers.get(r) ?? [];
    return { name: r, members };
  });

  if (rolesApi.rolesError) {
    return <ErrorResult error={rolesApi.rolesError} />;
  }

  return (
    <Flex flexDirection="column" gap="4">
      <Box>
        This tab displays all roles. Roles are groups of access control lists (ACLs) that can be assigned to principals.
        A principal represents any entity that can be authenticated, such as a user, service, or system (for example, a
        SASL-SCRAM user, OIDC identity, or mTLS client).
      </Box>
      <NullFallbackBoundary>
        <FeatureLicenseNotification featureName="rbac" />
      </NullFallbackBoundary>
      <SearchField
        placeholderText="Filter by name"
        searchText={searchQuery}
        setSearchText={setSearchQuery}
        width="300px"
      />
      <Section>
        <Button
          data-testid="create-role-button"
          isDisabled={api.userData?.canCreateRoles === false || !Features.rolesApi}
          onClick={() => appGlobal.historyPush('/security/roles/create')}
          tooltip={[
            api.userData?.canCreateRoles === false &&
              'You need KafkaAclOperation.KAFKA_ACL_OPERATION_ALTER and RedpandaCapability.MANAGE_RBAC permissions.',
            !Features.rolesApi && 'This feature is not enabled.',
          ]
            .filter(Boolean)
            .join(' ')}
          variant="outline"
        >
          Create role
        </Button>

        <Box my={4}>
          <DataTable
            columns={[
              {
                id: 'name',
                size: Number.POSITIVE_INFINITY,
                header: 'Role name',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return (
                    <ChakraLink
                      as={Link}
                      data-testid={`role-list-item-${entry.name}`}
                      textDecoration="none"
                      to={`/security/roles/${encodeURIComponent(entry.name)}/details`}
                    >
                      {entry.name}
                    </ChakraLink>
                  );
                },
              },
              {
                id: 'assignedPrincipals',
                header: 'Assigned principals',
                cell: (ctx) => <>{ctx.row.original.members.length}</>,
              },
              {
                size: 60,
                id: 'menu',
                header: '',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return (
                    <Flex flexDirection="row" gap={4}>
                      <button
                        onClick={() => {
                          appGlobal.historyPush(`/security/roles/${entry.name}/edit`);
                        }}
                        type="button"
                      >
                        <Icon as={EditIcon} />
                      </button>
                      <DeleteRoleConfirmModal
                        buttonEl={
                          <button type="button">
                            <Icon as={TrashIcon} />
                          </button>
                        }
                        numberOfPrincipals={entry.members.length}
                        onConfirm={async () => {
                          await rolesApi.deleteRole(entry.name, true);
                          await rolesApi.refreshRoles();
                          await rolesApi.refreshRoleMembers();
                        }}
                        roleName={entry.name}
                      />
                    </Flex>
                  );
                },
              },
            ]}
            data={rolesWithMembers}
            pagination
            sorting
          />
        </Box>
      </Section>
    </Flex>
  );
};

const AclsTab = (_: { principalGroups: AclPrincipalGroup[] }) => {
  const { data: principalGroups, isLoading, isError, error } = useListACLAsPrincipalGroups();
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();
  const invalidateUsersCache = useInvalidateUsersCache();

  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const [editorType, setEditorType] = useState<'create' | 'edit'>('create');
  const [edittingPrincipalGroup, setEdittingPrincipalGroup] = useState<AclPrincipalGroup | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const navigate = useNavigate();

  const deleteACLsForPrincipal = async (principal: string, host: string) => {
    const deleteRequest: DeleteACLsRequest = create(DeleteACLsRequestSchema, {
      filter: {
        principal,
        resourceType: ACL_ResourceType.ANY,
        resourceName: undefined,
        host,
        operation: ACL_Operation.ANY,
        permissionType: ACL_PermissionType.ANY,
        resourcePatternType: ACL_ResourcePatternType.ANY,
      },
    });
    await deleteACLMutation(deleteRequest);
    toast({
      status: 'success',
      description: (
        <Text as="span">
          Deleted ACLs for <CodeEl>{principal}</CodeEl>
        </Text>
      ),
    });
  };

  let groups = principalGroups?.filter((g) => g.principalType === 'User') || [];

  try {
    const quickSearchRegExp = new RegExp(searchQuery, 'i');
    groups = groups?.filter((aclGroup) => aclGroup.principalName.match(quickSearchRegExp));
  } catch (_e) {
    // Invalid regex, skip filtering
  }

  if (isError && error) {
    return <ErrorResult error={error} />;
  }

  if (isLoading || !principalGroups) {
    return DefaultSkeleton;
  }

  return (
    <Flex flexDirection="column" gap="4">
      <Box>
        This tab displays all access control lists (ACLs), grouped by principal and host. A principal represents any
        entity that can be authenticated, such as a user, service, or system (for example, a SASL-SCRAM user, OIDC
        identity, or mTLS client). The ACLs tab shows only the permissions directly granted to each principal. For a
        complete view of all permissions, including permissions granted through roles, see the Permissions List tab.
      </Box>
      {Boolean(Features.rolesApi) && (
        <Alert status="info">
          <AlertIcon />
          Roles are a more flexible and efficient way to manage user permissions, especially with complex organizational
          hierarchies or large numbers of users.
        </Alert>
      )}
      <SearchField
        placeholderText="Filter by name"
        searchText={searchQuery}
        setSearchText={setSearchQuery}
        width="300px"
      />
      <Section>
        {edittingPrincipalGroup ? (
          <AclPrincipalGroupEditor
            onClose={() => {
              setEdittingPrincipalGroup(null);
              api.refreshAcls(AclRequestDefault, true);
              api.refreshServiceAccounts();
            }}
            principalGroup={edittingPrincipalGroup}
            type={editorType}
          />
        ) : null}

        <AlertDeleteFailed aclFailed={aclFailed} onClose={() => setAclFailed(null)} />

        <Button
          data-testid="create-acls"
          onClick={() => {
            navigate({
              to: '/security/acls/create',
              search: { principalType: undefined, principalName: undefined },
            });
            setEditorType('create');
            setEdittingPrincipalGroup({
              host: '',
              principalType: 'User',
              principalName: '',
              topicAcls: [createEmptyTopicAcl()],
              consumerGroupAcls: [createEmptyConsumerGroupAcl()],
              transactionalIdAcls: [createEmptyTransactionalIdAcl()],
              clusterAcls: createEmptyClusterAcl(),
              sourceEntries: [],
            });
          }}
          variant="outline"
        >
          Create ACLs
        </Button>

        <Box py={4}>
          <DataTable<{
            principal: string;
            host: string;
            principalType: string;
            principalName: string;
          }>
            columns={[
              {
                size: Number.POSITIVE_INFINITY,
                header: 'Principal',
                accessorKey: 'principal',
                cell: ({ row: { original: record } }) => {
                  //   const principalType = record.principalType=='User' && record.principalName.endsWith('*')
                  //     ? 'User Group'
                  //     :record.principalType;
                  return (
                    <button
                      className="hoverLink"
                      onClick={() => {
                        navigate({
                          to: `/security/acls/${record.principalName}/details`,
                          search: (prev) => ({ ...prev, host: record.host }),
                        });
                      }}
                      type="button"
                    >
                      <Flex>
                        {/* <Badge variant="subtle" mr="2">{principalType}</Badge> */}
                        <Text
                          as="span"
                          data-testid={`acl-list-item-${record.principalName}-${record.host}`}
                          whiteSpace="break-spaces"
                          wordBreak="break-word"
                        >
                          {record.principalName}
                        </Text>
                      </Flex>
                    </button>
                  );
                },
              },
              {
                header: 'Host',
                accessorKey: 'host',
                cell: ({
                  row: {
                    original: { host },
                  },
                }) => (!host || host === '*' ? <Badge variant="subtle">Any</Badge> : host),
              },
              {
                size: 60,
                id: 'menu',
                header: '',
                cell: ({ row: { original: record } }) => {
                  const userExists = api.serviceAccounts?.users.includes(record.principalName);

                  const onDelete = async (user: boolean, acls: boolean) => {
                    if (acls) {
                      try {
                        await deleteACLsForPrincipal(record.principal, record.host);
                      } catch (err: unknown) {
                        // biome-ignore lint/suspicious/noConsole: error logging
                        console.error('failed to delete acls', { error: err });
                        setAclFailed({ err });
                      }
                    }

                    if (user) {
                      try {
                        await api.deleteServiceAccount(record.principalName);
                        toast({
                          status: 'success',
                          description: (
                            <Text as="span">
                              Deleted user <CodeEl>{record.principalName}</CodeEl>
                            </Text>
                          ),
                        });
                      } catch (err: unknown) {
                        // biome-ignore lint/suspicious/noConsole: error logging
                        console.error('failed to delete acls', { error: err });
                        setAclFailed({ err });
                      }
                    }

                    await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), invalidateUsersCache()]);
                  };

                  return (
                    <Menu>
                      <MenuButton as={Button} className="deleteButton" style={{ height: 'auto' }} variant="ghost">
                        <Icon as={TrashIcon} />
                      </MenuButton>
                      <MenuList>
                        <MenuItem
                          isDisabled={!(userExists && Features.deleteUser)}
                          onClick={(e) => {
                            onDelete(true, true).catch(() => {
                              // Error handling managed by API layer
                            });
                            e.stopPropagation();
                          }}
                        >
                          Delete (User and ACLs)
                        </MenuItem>
                        <MenuItem
                          isDisabled={!(userExists && Features.deleteUser)}
                          onClick={(e) => {
                            onDelete(true, false).catch(() => {
                              // Error handling managed by API layer
                            });
                            e.stopPropagation();
                          }}
                        >
                          Delete (User only)
                        </MenuItem>
                        <MenuItem
                          onClick={(e) => {
                            onDelete(false, true).catch(() => {
                              // Error handling managed by API layer
                            });
                            e.stopPropagation();
                          }}
                        >
                          Delete (ACLs only)
                        </MenuItem>
                      </MenuList>
                    </Menu>
                  );
                },
              },
            ]}
            data={groups || []}
            pagination
            sorting
          />
        </Box>
      </Section>
    </Flex>
  );
};

const AlertDeleteFailed: FC<{
  aclFailed: { err: unknown } | null;
  onClose: () => void;
}> = ({ aclFailed, onClose }) => {
  const ref = useRef(null);

  if (!aclFailed) {
    return null;
  }

  return (
    <Alert mb={4} ref={ref} status="error">
      <AlertIcon />
      <AlertTitle>Failed to delete</AlertTitle>
      <AlertDescription>
        <Text>
          {(() => {
            if (aclFailed.err instanceof Error) {
              return aclFailed.err.message;
            }
            if (typeof aclFailed.err === 'string') {
              return aclFailed.err;
            }
            return 'Unknown error';
          })()}
        </Text>
      </AlertDescription>
      <CloseButton onClick={onClose} position="absolute" right="8px" top="8px" />
    </Alert>
  );
};
