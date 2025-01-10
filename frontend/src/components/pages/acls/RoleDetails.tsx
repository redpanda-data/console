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

import { Button, DataTable, Flex, Heading, SearchField, Text } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import { type RolePrincipal, api, rolesApi } from '../../../state/backendApi';
import { AclRequestDefault } from '../../../state/restInterfaces';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { PageComponent, type PageInitHelper } from '../Page';
import { principalGroupsView } from './Models';
import { AclPrincipalGroupPermissionsTable } from './UserDetails';

import { Box, Link as ChakraLink } from '@redpanda-data/ui';
import { Link as ReactRouterLink } from 'react-router-dom';
import { DeleteRoleConfirmModal } from './DeleteRoleConfirmModal';

@observer
class RoleDetailsPage extends PageComponent<{ roleName: string }> {
  @observable isDeleting = false;
  @observable principalSearch = '';
  @observable roleName = '';

  constructor(p: any) {
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

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  async refreshData(force: boolean) {
    if (api.userData != null && !api.userData.canListAcls) return;

    await Promise.allSettled([api.refreshAcls(AclRequestDefault, force), api.refreshServiceAccounts(true)]);

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
    appGlobal.history.push('/security/roles/');
  }

  render() {
    if (api.ACLs?.aclResources === undefined) return DefaultSkeleton;
    if (!api.serviceAccounts || !api.serviceAccounts.users) return DefaultSkeleton;

    const aclPrincipalGroup = principalGroupsView.principalGroups.find(
      ({ principalType, principalName }) => principalType === 'RedpandaRole' && principalName === this.roleName,
    );

    let members = rolesApi.roleMembers.get(this.roleName) ?? [];
    try {
      const quickSearchRegExp = new RegExp(this.principalSearch, 'i');
      members = members.filter(({ name }) => name.match(quickSearchRegExp));
    } catch (e) {
      console.warn('Invalid expression');
    }

    const numberOfPrincipals = rolesApi.roleMembers.get(this.roleName)?.length ?? 0;

    return (
      <>
        <PageContent>
          <Flex gap="4">
            <Button
              variant="outline"
              onClick={() => {
                appGlobal.history.push(`/security/roles/${this.props.roleName}/edit`);
              }}
            >
              Edit
            </Button>
            <DeleteRoleConfirmModal
              numberOfPrincipals={numberOfPrincipals}
              onConfirm={this.deleteRole}
              buttonEl={<Button variant="outline-delete">Delete</Button>}
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
                width="300px"
                searchText={this.principalSearch}
                setSearchText={(x) => (this.principalSearch = x)}
                placeholderText="Filter by name"
              />
            </Box>
            <DataTable<RolePrincipal>
              data={members ?? []}
              pagination
              sorting
              emptyText="No users found"
              columns={[
                {
                  id: 'name',
                  size: Number.POSITIVE_INFINITY,
                  header: 'User',
                  cell: (ctx) => {
                    const entry = ctx.row.original;
                    return (
                      <>
                        <ChakraLink
                          as={ReactRouterLink}
                          to={`/security/users/${entry.name}/details`}
                          textDecoration="none"
                        >
                          {entry.name}
                        </ChakraLink>
                      </>
                    );
                  },
                },
              ]}
            />
          </Flex>
        </PageContent>
      </>
    );
  }
}

export default RoleDetailsPage;
