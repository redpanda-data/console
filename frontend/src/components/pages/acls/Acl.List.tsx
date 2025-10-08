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
import { PencilIcon, TrashIcon } from '@heroicons/react/outline';
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
import { isServerless } from 'config';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  type DeleteACLsRequest,
  DeleteACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { type FC, useRef, useState } from 'react';
import { BsThreeDots } from 'react-icons/bs';
import { Link as ReactRouterLink, useNavigate } from 'react-router-dom';

import { DeleteRoleConfirmModal } from './DeleteRoleConfirmModal';
import { DeleteUserConfirmModal } from './DeleteUserConfirmModal';
import type { AclPrincipalGroup } from './Models';
import {
  createEmptyClusterAcl,
  createEmptyConsumerGroupAcl,
  createEmptyTopicAcl,
  createEmptyTransactionalIdAcl,
  principalGroupsView,
} from './Models';
import { AclPrincipalGroupEditor } from './PrincipalGroupEditor';
import { ChangePasswordModal, ChangeRolesModal } from './UserEditModals';
import { UserRoleTags } from './UserPermissionAssignments';
import ErrorResult from '../../../components/misc/ErrorResult';
import { useDeleteAclMutation, useListACLAsPrincipalGroups } from '../../../react-query/api/acl';
import { appGlobal } from '../../../state/appGlobal';
import { api, rolesApi } from '../../../state/backendApi';
import { AclRequestDefault } from '../../../state/restInterfaces';
import { Features } from '../../../state/supportedFeatures';
import { uiSettings } from '../../../state/ui';
import { Code as CodeEl, DefaultSkeleton } from '../../../utils/tsxUtils';
import { FeatureLicenseNotification } from '../../license/FeatureLicenseNotification';
import { NullFallbackBoundary } from '../../misc/NullFallbackBoundary';
import PageContent from '../../misc/PageContent';
import Section from '../../misc/Section';
import { PageComponent, type PageInitHelper } from '../Page';

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

const getCreateUserButtonProps = () => ({
  isDisabled: !Features.createUser || api.userData?.canManageUsers === false,
  tooltip: [
    !Features.createUser && "Your cluster doesn't support this feature.",
    api.userData?.canManageUsers === false && 'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.',
  ]
    .filter(Boolean)
    .join(' '),
});

@observer
class AclList extends PageComponent<{ tab?: AclListTab }> {
  @observable edittingPrincipalGroup?: AclPrincipalGroup;

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Access Control';
    p.addBreadcrumb('Access control', '/security');

    this.refreshData().catch(() => {
      // Error handling managed by API layer
    });
    appGlobal.onRefresh = () => this.refreshData();
  }

  async refreshData() {
    await Promise.allSettled([api.refreshServiceAccounts(), rolesApi.refreshRoles(), api.refreshUserData()]);
    await rolesApi.refreshRoleMembers(); // must be after refreshRoles is completed, otherwise the function couldn't know the names of the roles to refresh
  }

  render() {
    if (api.serviceAccountsLoading && !api.serviceAccounts) {
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
          (!Features.createUser && "Your cluster doesn't support this feature.") ||
          (api.userData?.canManageUsers === false && 'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.'),
      },
      isServerless()
        ? null
        : {
            key: 'roles' as AclListTab,
            name: 'Roles',
            component: <RolesTab data-testid="roles-tab" />,
            isDisabled:
              (!Features.rolesApi && "Your cluster doesn't support this feature.") ||
              (api.userData?.canManageUsers === false &&
                'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.'),
          },
      {
        key: 'acls' as AclListTab,
        name: 'ACLs',
        component: <AclsTab data-testid="acls-tab" principalGroups={principalGroupsView.principalGroups} />,
        isDisabled: api.userData?.canListAcls ? false : 'You do not have the necessary permissions to view ACLs.',
      },
      {
        key: 'permissions-list' as AclListTab,
        name: 'Permissions list',
        component: <PermissionsListTab data-testid="permissions-list-tab" />,
        isDisabled: api.userData?.canViewPermissionsList
          ? false
          : 'You need (KafkaAclOperation.DESCRIBE and RedpandaCapability.MANAGE_REDPANDA_USERS permissions.',
      },
    ].filter((x) => x !== null) as TabsItemProps[];

    // todo: maybe there is a better way to sync the tab control to the path
    const activeTab = tabs.findIndex((x) => x.key === this.props.tab);
    if (activeTab === -1) {
      // No tab selected, default to users
      appGlobal.historyPush('/security/users');
    }

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
  }
}

export default AclList;

type UsersEntry = { name: string; type: 'SERVICE_ACCOUNT' | 'PRINCIPAL' };
const PermissionsListTab = observer(() => {
  const users: UsersEntry[] = (api.serviceAccounts?.users ?? []).map((u) => ({
    name: u,
    type: 'SERVICE_ACCOUNT',
  }));

  // In addition, find all principals that are referenced by roles, or acls, that are not service accounts
  for (const g of principalGroupsView.principalGroups) {
    if (g.principalType === 'User' && !g.principalName.includes('*') && !users.any((u) => u.name === g.principalName)) {
      // is it a user that is being referenced?
      // is the user already listed as a service account?
      users.push({ name: g.principalName, type: 'PRINCIPAL' });
    }
  }

  for (const [_, roleMembers] of rolesApi.roleMembers) {
    for (const roleMember of roleMembers) {
      if (!users.any((u) => u.name === roleMember.name)) {
        // make sure that user isn't already in the list
        users.push({ name: roleMember.name, type: 'PRINCIPAL' });
      }
    }
  }

  const usersFiltered = users.filter((u) => {
    const filter = uiSettings.aclList.permissionsTab.quickSearch;
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
        searchText={uiSettings.aclList.permissionsTab.quickSearch}
        setSearchText={(x) => (uiSettings.aclList.permissionsTab.quickSearch = x)}
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
                    <ChakraLink as={ReactRouterLink} textDecoration="none" to={`/security/users/${entry.name}/details`}>
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
});

const UsersTab = observer(() => {
  const users: UsersEntry[] = (api.serviceAccounts?.users ?? []).map((u) => ({
    name: u,
    type: 'SERVICE_ACCOUNT',
  }));

  const usersFiltered = users.filter((u) => {
    const filter = uiSettings.aclList.usersTab.quickSearch;
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

  if (api.serviceAccountsError) {
    return <ErrorResult error={api.serviceAccountsError} />;
  }
  return (
    <Flex flexDirection="column" gap="4">
      <Box>
        These users are SASL-SCRAM users managed by your cluster. View permissions for other authentication identities
        (OIDC, Kerberos, mTLS) on the Permissions list page.
      </Box>

      <SearchField
        placeholderText="Filter by name"
        searchText={uiSettings.aclList.usersTab.quickSearch}
        setSearchText={(x) => (uiSettings.aclList.usersTab.quickSearch = x)}
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
                    <ChakraLink as={ReactRouterLink} textDecoration="none" to={`/security/users/${entry.name}/details`}>
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
});

const UserActions = ({ user }: { user: UsersEntry }) => {
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isChangeRolesModalOpen, setIsChangeRolesModalOpen] = useState(false);

  const onConfirmDelete = async () => {
    await api.deleteServiceAccount(user.name);

    // Remove user from all its roles
    const promises = [];
    for (const [roleName, members] of rolesApi.roleMembers) {
      if (members.any((m) => m.name === user.name)) {
        // is this user part of this role?
        // then remove it
        promises.push(rolesApi.updateRoleMembership(roleName, [], [user.name]));
      }
    }

    await Promise.allSettled(promises);
    await rolesApi.refreshRoleMembers();
    await api.refreshServiceAccounts();
  };

  return (
    <>
      {api.isAdminApiConfigured && (
        <ChangePasswordModal
          isOpen={isChangePasswordModalOpen}
          setIsOpen={setIsChangePasswordModalOpen}
          userName={user.name}
        />
      )}
      {Features.rolesApi && (
        <ChangeRolesModal isOpen={isChangeRolesModalOpen} setIsOpen={setIsChangeRolesModalOpen} userName={user.name} />
      )}

      <Menu>
        <MenuButton as={Button} className="deleteButton" style={{ height: 'auto' }} variant="ghost">
          <Icon as={BsThreeDots} />
        </MenuButton>
        <MenuList>
          {api.isAdminApiConfigured && (
            <MenuItem
              onClick={(e) => {
                e.stopPropagation();
                setIsChangePasswordModalOpen(true);
              }}
            >
              Change password
            </MenuItem>
          )}
          {Features.rolesApi && (
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

const RolesTab = observer(() => {
  const roles = (rolesApi.roles ?? []).filter((u) => {
    const filter = uiSettings.aclList.rolesTab.quickSearch;
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
  // @ts-expect-error perhaps required for MobX?
  const _isLoading = rolesApi.roles == null;

  const rolesWithMembers = roles.map((r) => {
    const members = rolesApi.roleMembers.get(r) ?? [];
    return { name: r, members };
  });

  if (rolesApi.rolesError) {
    return <ErrorResult error={rolesApi.rolesError} />;
  }

  return (
    <Flex flexDirection="column" gap="4">
      <Box>Roles are groups of ACLs abstracted under a single name. Roles can be assigned to principals.</Box>

      <NullFallbackBoundary>
        <FeatureLicenseNotification featureName="rbac" />
      </NullFallbackBoundary>

      <SearchField
        placeholderText="Filter by name"
        searchText={uiSettings.aclList.rolesTab.quickSearch}
        setSearchText={(x) => (uiSettings.aclList.rolesTab.quickSearch = x)}
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
                      as={ReactRouterLink}
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
                        <Icon as={PencilIcon} />
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
});

const AclsTab = observer((_: { principalGroups: AclPrincipalGroup[] }) => {
  const { data: principalGroups, isLoading } = useListACLAsPrincipalGroups();
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();

  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const [editorType, setEditorType] = useState<'create' | 'edit'>('create');
  const [edittingPrincipalGroup, setEdittingPrincipalGroup] = useState<AclPrincipalGroup | null>(null);

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
    const quickSearchRegExp = new RegExp(uiSettings.aclList.configTable.quickSearch, 'i');
    groups = groups?.filter((aclGroup) => aclGroup.principalName.match(quickSearchRegExp));
  } catch (_e) {
    // biome-ignore lint/suspicious/noConsole: user feedback for invalid regex
    console.warn('Invalid expression');
  }

  if (isLoading || !principalGroups) {
    return DefaultSkeleton;
  }

  return (
    <Flex flexDirection="column" gap="4">
      <Box>
        This tab displays all Kafka Access Control Lists (ACLs), grouped by each principal. A principal represents any
        entity that can be authenticated, such as a user, service, or system (e.g., a SASL-SCRAM user, OIDC identity,
        Kerberos principal, or mTLS client). The ACLs tab shows only the permissions directly granted to each principal,
        without considering any permissions that may be derived from assigned roles. For a complete view of all
        effective permissions, including those granted through roles, refer to the Permissions List tab.
      </Box>
      {Features.rolesApi && (
        <Alert status="info">
          <AlertIcon />
          Roles are a more flexible and efficient way to manage user permissions, especially with complex organizational
          hierarchies or large numbers of users.
        </Alert>
      )}
      <SearchField
        placeholderText="Filter by name"
        searchText={uiSettings.aclList.configTable.quickSearch}
        setSearchText={(x) => (uiSettings.aclList.configTable.quickSearch = x)}
        width="300px"
      />
      <Section>
        {edittingPrincipalGroup && (
          <AclPrincipalGroupEditor
            onClose={() => {
              setEdittingPrincipalGroup(null);
              api.refreshAcls(AclRequestDefault, true);
              api.refreshServiceAccounts();
            }}
            principalGroup={edittingPrincipalGroup}
            type={editorType}
          />
        )}

        <AlertDeleteFailed aclFailed={aclFailed} onClose={() => setAclFailed(null)} />

        <Button
          data-testid="create-acls"
          onClick={() => {
            navigate('create');
            setEditorType('create');
            setEdittingPrincipalGroup(
              observable({
                host: '',
                principalType: 'User',
                principalName: '',
                topicAcls: [createEmptyTopicAcl()],
                consumerGroupAcls: [createEmptyConsumerGroupAcl()],
                transactionalIdAcls: [createEmptyTransactionalIdAcl()],
                clusterAcls: createEmptyClusterAcl(),
                sourceEntries: [],
              }) as AclPrincipalGroup
            );
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
                        navigate(`/security/acls/${record.principalName}/details`);
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

                    await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), api.refreshServiceAccounts()]);
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
});

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
