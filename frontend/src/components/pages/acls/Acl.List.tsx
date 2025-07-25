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
import { type FC, useEffect, useRef, useState } from 'react';
import { BsThreeDots } from 'react-icons/bs';
import { Link as ReactRouterLink } from 'react-router-dom';
import ErrorResult from '../../../components/misc/ErrorResult';
import { appGlobal } from '../../../state/appGlobal';
import { api, rolesApi } from '../../../state/backendApi';
import { AclRequestDefault } from '../../../state/restInterfaces';
import { Features } from '../../../state/supportedFeatures';
import { uiSettings } from '../../../state/ui';
import { clone } from '../../../utils/jsonUtils';
import { Code as CodeEl, DefaultSkeleton } from '../../../utils/tsxUtils';
import { FeatureLicenseNotification } from '../../license/FeatureLicenseNotification';
import { NullFallbackBoundary } from '../../misc/NullFallbackBoundary';
import PageContent from '../../misc/PageContent';
import Section from '../../misc/Section';
import { PageComponent, type PageInitHelper } from '../Page';
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
class AclList extends PageComponent<{ tab: AclListTab }> {
  @observable edittingPrincipalGroup?: AclPrincipalGroup;

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Access Control';
    p.addBreadcrumb('Access control', '/security');

    void this.refreshData();
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
  const users: UsersEntry[] = (api.serviceAccounts?.users ?? []).map((u) => ({ name: u, type: 'SERVICE_ACCOUNT' }));

  // In addition, find all principals that are referenced by roles, or acls, that are not service accounts
  for (const g of principalGroupsView.principalGroups)
    if (g.principalType === 'User' && !g.principalName.includes('*'))
      if (!users.any((u) => u.name === g.principalName))
        // is it a user that is being referenced?
        // is the user already listed as a service account?
        users.push({ name: g.principalName, type: 'PRINCIPAL' });

  for (const [_, roleMembers] of rolesApi.roleMembers)
    for (const roleMember of roleMembers)
      if (!users.any((u) => u.name === roleMember.name))
        // make sure that user isn't already in the list
        users.push({ name: roleMember.name, type: 'PRINCIPAL' });

  const usersFiltered = users.filter((u) => {
    const filter = uiSettings.aclList.permissionsTab.quickSearch;
    if (!filter) return true;

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
        width="300px"
        searchText={uiSettings.aclList.permissionsTab.quickSearch}
        setSearchText={(x) => (uiSettings.aclList.permissionsTab.quickSearch = x)}
        placeholderText="Filter by name"
      />

      <Section>
        <Box my={4}>
          <DataTable<UsersEntry>
            data={usersFiltered}
            pagination
            sorting
            emptyText="No principals yet"
            emptyAction={
              <Button
                variant="outline"
                {...getCreateUserButtonProps()}
                onClick={() => appGlobal.historyPush('/security/users/create')}
              >
                Create user
              </Button>
            }
            columns={[
              {
                id: 'name',
                size: Number.POSITIVE_INFINITY,
                header: 'Principal',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return (
                    <ChakraLink as={ReactRouterLink} to={`/security/users/${entry.name}/details`} textDecoration="none">
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
                  return <UserRoleTags userName={entry.name} showMaxItems={2} />;
                },
              },
            ]}
          />
        </Box>
      </Section>
    </Flex>
  );
});

const UsersTab = observer(() => {
  const users: UsersEntry[] = (api.serviceAccounts?.users ?? []).map((u) => ({ name: u, type: 'SERVICE_ACCOUNT' }));

  const usersFiltered = users.filter((u) => {
    const filter = uiSettings.aclList.usersTab.quickSearch;
    if (!filter) return true;

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
        width="300px"
        searchText={uiSettings.aclList.usersTab.quickSearch}
        setSearchText={(x) => (uiSettings.aclList.usersTab.quickSearch = x)}
        placeholderText="Filter by name"
      />

      <Section>
        <Tooltip
          isDisabled={Features.createUser}
          label="The cluster does not support this feature"
          placement="top"
          hasArrow
        >
          <Button
            variant="outline"
            data-testid="create-user-button"
            {...getCreateUserButtonProps()}
            onClick={() => appGlobal.historyPush('/security/users/create')}
          >
            Create user
          </Button>
        </Tooltip>

        <Box my={4}>
          <DataTable<UsersEntry>
            data={usersFiltered}
            pagination
            sorting
            emptyText="No users yet"
            emptyAction={
              <Button
                variant="outline"
                {...getCreateUserButtonProps()}
                onClick={() => appGlobal.historyPush('/security/users/create')}
              >
                Create user
              </Button>
            }
            columns={[
              {
                id: 'name',
                size: Number.POSITIVE_INFINITY,
                header: 'User',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return (
                    <ChakraLink as={ReactRouterLink} to={`/security/users/${entry.name}/details`} textDecoration="none">
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
                  return <UserRoleTags userName={entry.name} showMaxItems={2} />;
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
          userName={user.name}
          isOpen={isChangePasswordModalOpen}
          setIsOpen={setIsChangePasswordModalOpen}
        />
      )}
      {Features.rolesApi && (
        <ChangeRolesModal userName={user.name} isOpen={isChangeRolesModalOpen} setIsOpen={setIsChangeRolesModalOpen} />
      )}

      <Menu>
        <MenuButton as={Button} variant="ghost" className="deleteButton" style={{ height: 'auto' }}>
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
            onConfirm={onConfirmDelete}
            buttonEl={<MenuItem type="button">Delete</MenuItem>}
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
    if (!filter) return true;
    try {
      const quickSearchRegExp = new RegExp(filter, 'i');
      return u.match(quickSearchRegExp);
    } catch {
      return false;
    }
  });
  // @ts-ignore perhaps required for MobX?
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
        width="300px"
        searchText={uiSettings.aclList.rolesTab.quickSearch}
        setSearchText={(x) => (uiSettings.aclList.rolesTab.quickSearch = x)}
        placeholderText="Filter by name"
      />

      <Section>
        <Button
          data-testid="create-role-button"
          variant="outline"
          onClick={() => appGlobal.historyPush('/security/roles/create')}
          isDisabled={api.userData?.canCreateRoles === false || !Features.rolesApi}
          tooltip={[
            api.userData?.canCreateRoles === false &&
              'You need KafkaAclOperation.KAFKA_ACL_OPERATION_ALTER and RedpandaCapability.MANAGE_RBAC permissions.',
            !Features.rolesApi && 'This feature is not enabled.',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          Create role
        </Button>

        <Box my={4}>
          <DataTable
            data={rolesWithMembers}
            pagination
            sorting
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
                      to={`/security/roles/${encodeURIComponent(entry.name)}/details`}
                      textDecoration="none"
                    >
                      {entry.name}
                    </ChakraLink>
                  );
                },
              },
              {
                id: 'assignedPrincipals',
                header: 'Assigned principals',
                cell: (ctx) => {
                  return <>{ctx.row.original.members.length}</>;
                },
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
                        type="button"
                        onClick={() => {
                          appGlobal.historyPush(`/security/roles/${entry.name}/edit`);
                        }}
                      >
                        <Icon as={PencilIcon} />
                      </button>
                      <DeleteRoleConfirmModal
                        numberOfPrincipals={entry.members.length}
                        onConfirm={async () => {
                          await rolesApi.deleteRole(entry.name, true);
                          await rolesApi.refreshRoles();
                          await rolesApi.refreshRoleMembers();
                        }}
                        buttonEl={
                          <button type="button">
                            <Icon as={TrashIcon} />
                          </button>
                        }
                        roleName={entry.name}
                      />
                    </Flex>
                  );
                },
              },
            ]}
          />
        </Box>
      </Section>
    </Flex>
  );
});

const AclsTab = observer((p: { principalGroups: AclPrincipalGroup[] }) => {
  useEffect(() => {
    void api.refreshAcls(AclRequestDefault, true);
  }, []);

  const [aclFailed, setAclFailed] = useState<{ err: unknown } | null>(null);
  const [editorType, setEditorType] = useState<'create' | 'edit'>('create');
  const [edittingPrincipalGroup, setEdittingPrincipalGroup] = useState<AclPrincipalGroup | null>(null);

  let groups = p.principalGroups.filter((g) => g.principalType === 'User');
  try {
    const quickSearchRegExp = new RegExp(uiSettings.aclList.configTable.quickSearch, 'i');
    groups = groups.filter((aclGroup) => aclGroup.principalName.match(quickSearchRegExp));
  } catch (_e) {
    console.warn('Invalid expression');
  }

  if (api.ACLs?.aclResources === undefined) return DefaultSkeleton;

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
        width="300px"
        searchText={uiSettings.aclList.configTable.quickSearch}
        setSearchText={(x) => (uiSettings.aclList.configTable.quickSearch = x)}
        placeholderText="Filter by name"
      />

      <Section>
        {edittingPrincipalGroup && (
          <AclPrincipalGroupEditor
            // @ts-ignore
            principalGroup={edittingPrincipalGroup}
            type={editorType}
            onClose={() => {
              setEdittingPrincipalGroup(null);
              api.refreshAcls(AclRequestDefault, true);
              api.refreshServiceAccounts();
            }}
          />
        )}

        <AlertDeleteFailed aclFailed={aclFailed} onClose={() => setAclFailed(null)} />

        <Button
          data-testid="create-acls"
          variant="outline"
          onClick={() => {
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
              }) as AclPrincipalGroup,
            );
          }}
        >
          Create ACLs
        </Button>

        <Box py={4}>
          <DataTable<AclPrincipalGroup>
            data={groups}
            pagination
            sorting
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
                      type="button"
                      className="hoverLink"
                      onClick={() => {
                        setEditorType('edit');
                        setEdittingPrincipalGroup(observable(clone(record)));
                      }}
                    >
                      <Flex>
                        {/* <Badge variant="subtle" mr="2">{principalType}</Badge> */}
                        <Text as="span" wordBreak="break-word" whiteSpace="break-spaces">
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
                  const hasAcls = record.sourceEntries.length > 0;

                  const onDelete = async (user: boolean, acls: boolean) => {
                    if (acls) {
                      try {
                        await api.deleteACLs({
                          resourceType: 'Any',
                          resourceName: undefined,
                          resourcePatternType: 'Any',
                          principal: `${record.principalType}:${record.principalName}`,
                          host: record.host,
                          operation: 'Any',
                          permissionType: 'Any',
                        });
                        toast({
                          status: 'success',
                          description: (
                            <Text as="span">
                              Deleted ACLs for <CodeEl>{record.principalName}</CodeEl>
                            </Text>
                          ),
                        });
                      } catch (err: unknown) {
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
                        console.error('failed to delete acls', { error: err });
                        setAclFailed({ err });
                      }
                    }

                    await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), api.refreshServiceAccounts()]);
                  };

                  return (
                    <Menu>
                      <MenuButton as={Button} variant="ghost" className="deleteButton" style={{ height: 'auto' }}>
                        <Icon as={TrashIcon} />
                      </MenuButton>
                      <MenuList>
                        <MenuItem
                          isDisabled={!userExists || !Features.deleteUser || !hasAcls}
                          onClick={(e) => {
                            void onDelete(true, true);
                            e.stopPropagation();
                          }}
                        >
                          Delete (User and ACLs)
                        </MenuItem>
                        <MenuItem
                          isDisabled={!userExists || !Features.deleteUser}
                          onClick={(e) => {
                            void onDelete(true, false);
                            e.stopPropagation();
                          }}
                        >
                          Delete (User only)
                        </MenuItem>
                        <MenuItem
                          isDisabled={!hasAcls}
                          onClick={(e) => {
                            void onDelete(false, true);
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
          />
        </Box>
      </Section>
    </Flex>
  );
});

const AlertDeleteFailed: FC<{ aclFailed: { err: unknown } | null; onClose: () => void }> = ({ aclFailed, onClose }) => {
  const ref = useRef(null);

  if (!aclFailed) return null;

  return (
    <Alert status="error" mb={4} ref={ref}>
      <AlertIcon />
      <AlertTitle>Failed to delete</AlertTitle>
      <AlertDescription>
        <Text>
          {aclFailed.err instanceof Error
            ? aclFailed.err.message
            : typeof aclFailed.err === 'string'
              ? aclFailed.err
              : 'Unknown error'}
        </Text>
      </AlertDescription>
      <CloseButton position="absolute" right="8px" top="8px" onClick={onClose} />
    </Alert>
  );
};
