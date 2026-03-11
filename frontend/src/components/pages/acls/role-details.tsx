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

'use no memo';

import { Box, Button, DataTable, Flex, Heading, SearchField, Text } from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { DeleteRoleConfirmModal } from './delete-role-confirm-modal';
import { principalGroupsView } from './models';
import { AclPrincipalGroupPermissionsTable } from './user-details';
import { appGlobal } from '../../../state/app-global';
import { api, type RolePrincipal, rolesApi } from '../../../state/backend-api';
import { AclRequestDefault } from '../../../state/rest-interfaces';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../page';

async function refreshRoleData(force: boolean) {
  if (api.userData !== null && api.userData !== undefined && !api.userData.canListAcls) {
    return;
  }
  await Promise.allSettled([
    api.refreshAcls(AclRequestDefault, force),
    api.refreshServiceAccounts(),
    rolesApi.refreshRoles(),
    rolesApi.refreshRoleMembers(),
  ]);
}

class RoleDetailsPage extends PageComponent<{ roleName: string }> {
  initPage(p: PageInitHelper): void {
    const roleName = decodeURIComponent(this.props.roleName);
    p.title = 'Role details';
    p.addBreadcrumb('Access Control', '/security');
    p.addBreadcrumb('Roles', '/security/roles');
    p.addBreadcrumb(roleName, `/security/roles/${this.props.roleName}`);

    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    refreshRoleData(true).catch(console.error);
    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    appGlobal.onRefresh = () => refreshRoleData(true).catch(console.error);
  }

  render() {
    return <RoleDetailsPageContent roleName={this.props.roleName} />;
  }
}

const RoleDetailsPageContent = ({ roleName: encodedRoleName }: { roleName: string }) => {
  const roleName = decodeURIComponent(encodedRoleName);
  const [isDeleting, setIsDeleting] = useState(false);
  const [principalSearch, setPrincipalSearch] = useState('');

  if (api.ACLs?.aclResources === undefined) {
    return DefaultSkeleton;
  }
  if (!api.serviceAccounts?.users) {
    return DefaultSkeleton;
  }

  const deleteRole = async () => {
    setIsDeleting(true);
    try {
      await rolesApi.deleteRole(roleName, true);
      await Promise.all([rolesApi.refreshRoles(), rolesApi.refreshRoleMembers()]);
      setIsDeleting(false);
      appGlobal.historyPush('/security/roles/');
    } catch (e) {
      setIsDeleting(false);
      throw e;
    }
  };

  const aclPrincipalGroup = principalGroupsView.principalGroups.find(
    ({ principalType, principalName }) => principalType === 'RedpandaRole' && principalName === roleName
  );

  let members = rolesApi.roleMembers.get(roleName) ?? [];
  try {
    const quickSearchRegExp = new RegExp(principalSearch, 'i');
    members = members.filter(({ name }) => name.match(quickSearchRegExp));
  } catch (_e) {
    // biome-ignore lint/suspicious/noConsole: warning for invalid user input
    console.warn('Invalid expression');
  }

  const numberOfPrincipals = rolesApi.roleMembers.get(roleName)?.length ?? 0;

  return (
    <PageContent>
      <Flex gap="4">
        <Button
          onClick={() => {
            appGlobal.historyPush(`/security/roles/${encodedRoleName}/edit`);
          }}
          variant="outline"
        >
          Edit
        </Button>
        <DeleteRoleConfirmModal
          buttonEl={
            <Button isLoading={isDeleting} variant="outline-delete">
              Delete
            </Button>
          }
          numberOfPrincipals={numberOfPrincipals}
          onConfirm={deleteRole}
          roleName={roleName}
        />
      </Flex>
      <Flex flexDirection="column">
        <Heading as="h3" my="4">
          Permissions
        </Heading>
        {aclPrincipalGroup ? (
          <AclPrincipalGroupPermissionsTable group={aclPrincipalGroup} />
        ) : (
          'This role has no permissions assigned.'
        )}
      </Flex>

      <Flex flexDirection="column">
        <Heading as="h3" my="4">
          Principals
        </Heading>
        <Text>
          This role is assigned to {numberOfPrincipals} {numberOfPrincipals === 1 ? 'principal' : 'principals'}
        </Text>
        <Box my={2}>
          <SearchField
            placeholderText="Filter by name"
            searchText={principalSearch}
            setSearchText={setPrincipalSearch}
            width="300px"
          />
        </Box>
        <DataTable<RolePrincipal>
          columns={[
            {
              id: 'name',
              size: Number.POSITIVE_INFINITY,
              header: 'User',
              cell: (ctx) => {
                const entry = ctx.row.original;
                return (
                  <Link
                    className="no-underline"
                    params={{ userName: entry.name }}
                    to="/security/users/$userName/details"
                  >
                    {entry.name}
                  </Link>
                );
              },
            },
          ]}
          data={members ?? []}
          emptyText="No users found"
          pagination
          sorting
        />
      </Flex>
    </PageContent>
  );
};

export default RoleDetailsPage;
