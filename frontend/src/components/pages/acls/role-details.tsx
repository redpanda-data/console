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

import { Box, Button, Link as ChakraLink, DataTable, Flex, Heading, SearchField, Text } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { Link as ReactRouterLink } from 'react-router-dom';

import { DeleteRoleConfirmModal } from './delete-role-confirm-modal';
import { principalGroupsView } from './models';
import { AclPrincipalGroupPermissionsTable } from './user-details';
import { appGlobal } from '../../../state/app-global';
import { api, type RolePrincipal, rolesApi } from '../../../state/backend-api';
import { AclRequestDefault } from '../../../state/rest-interfaces';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../page';

@observer
class RoleDetailsPage extends PageComponent<{ roleName: string }> {
  @observable isDeleting = false;
  @observable principalSearch = '';
  @observable roleName = '';

  constructor(p: { roleName: string }) {
    super(p);
    makeObservable(this);
    this.roleName = decodeURIComponent(this.props.roleName);
    this.deleteRole = this.deleteRole.bind(this);
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Role details';
    p.addBreadcrumb('Access control', '/security');
    p.addBreadcrumb('Roles', '/security/roles');
    p.addBreadcrumb(decodeURIComponent(this.props.roleName), `/security/roles/${this.props.roleName}`);

    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    this.refreshData(true).catch(console.error);
    // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
    appGlobal.onRefresh = () => this.refreshData(true).catch(console.error);
  }

  async refreshData(force: boolean) {
    if (api.userData != null && !api.userData.canListAcls) {
      return;
    }

    await Promise.allSettled([api.refreshAcls(AclRequestDefault, force), api.refreshServiceAccounts()]);

    await rolesApi.refreshRoles();
    await rolesApi.refreshRoleMembers();
  }

  async deleteRole() {
    this.isDeleting = true;
    try {
      await rolesApi.deleteRole(this.roleName, true);
      await rolesApi.refreshRoles();
      await rolesApi.refreshRoleMembers(); // need to refresh assignments as well, otherwise users will still be marked as having that role, even though it doesn't exist anymore
    } finally {
      this.isDeleting = false;
    }
    appGlobal.historyPush('/security/roles/');
  }

  render() {
    if (api.ACLs?.aclResources === undefined) {
      return DefaultSkeleton;
    }
    if (!api.serviceAccounts?.users) {
      return DefaultSkeleton;
    }

    const aclPrincipalGroup = principalGroupsView.principalGroups.find(
      ({ principalType, principalName }) => principalType === 'RedpandaRole' && principalName === this.roleName
    );

    let members = rolesApi.roleMembers.get(this.roleName) ?? [];
    try {
      const quickSearchRegExp = new RegExp(this.principalSearch, 'i');
      members = members.filter(({ name }) => name.match(quickSearchRegExp));
    } catch (_e) {
      // biome-ignore lint/suspicious/noConsole: warning for invalid user input
      console.warn('Invalid expression');
    }

    const numberOfPrincipals = rolesApi.roleMembers.get(this.roleName)?.length ?? 0;

    return (
      <PageContent>
        <Flex gap="4">
          <Button
            onClick={() => {
              appGlobal.historyPush(`/security/roles/${this.props.roleName}/edit`);
            }}
            variant="outline"
          >
            Edit
          </Button>
          <DeleteRoleConfirmModal
            buttonEl={<Button variant="outline-delete">Delete</Button>}
            numberOfPrincipals={numberOfPrincipals}
            onConfirm={this.deleteRole}
            roleName={this.roleName}
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
              searchText={this.principalSearch}
              setSearchText={(x) => (this.principalSearch = x)}
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
                    <ChakraLink as={ReactRouterLink} textDecoration="none" to={`/security/users/${entry.name}/details`}>
                      {entry.name}
                    </ChakraLink>
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
  }
}

export default RoleDetailsPage;
