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
  Box,
  Button,
  Flex,
  Heading,
  Input,
  createStandaloneToast,
  redpandaTheme,
  redpandaToastOptions,
} from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import type { UpdateRoleMembershipResponse } from '../../../protogen/redpanda/api/console/v1alpha1/security_pb';
import { appGlobal } from '../../../state/appGlobal';
import { api, rolesApi } from '../../../state/backendApi';
import { AclRequestDefault } from '../../../state/restInterfaces';
import { Features } from '../../../state/supportedFeatures';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { PageComponent, type PageInitHelper } from '../Page';
import { RoleSelector } from './UserCreate';

const { ToastContainer, toast } = createStandaloneToast({
  theme: redpandaTheme,
  defaultOptions: {
    ...redpandaToastOptions.defaultOptions,
    isClosable: false,
    duration: 2000,
  },
});

@observer
class UserEditPage extends PageComponent<{ userName: string }> {
  @observable originalRoles: Set<string> | undefined = undefined;
  @observable selectedRoles: string[] | undefined = undefined;
  @observable isSaving = false;

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.title = `Edit user ${this.props.userName}`;
    p.addBreadcrumb('Access control', '/security');
    p.addBreadcrumb('Users', '/security/users');
    p.addBreadcrumb(this.props.userName, `/security/users/${this.props.userName}/edit`);

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  async refreshData(force: boolean) {
    if (api.userData != null && !api.userData.canListAcls) return;

    await Promise.allSettled([
      api.refreshAcls(AclRequestDefault, force),
      api.refreshServiceAccounts(true),
      rolesApi.refreshRoles(),
    ]);

    await rolesApi.refreshRoleMembers();
  }

  render() {
    if (!api.serviceAccounts || !api.serviceAccounts.users) return DefaultSkeleton;

    const userName = this.props.userName;

    // Load roles the user is assigned to, for this we need all roles
    if (this.selectedRoles === undefined || this.originalRoles === undefined) {
      this.originalRoles = new Set<string>();
      for (const [name, members] of rolesApi.roleMembers) {
        if (members.any((x) => x.name === userName)) this.originalRoles.add(name);
      }

      this.selectedRoles = [...this.originalRoles.values()];
    }

    const onCancel = () => appGlobal.history.push(`/security/users/${userName}/details`);

    // Check if there are any roles removed, added, or replaced
    // only then will the save button be enabled
    // First check if they have the same number of roles
    const originalRoles = [...this.originalRoles.values()];

    const addedRoles = this.selectedRoles.except(originalRoles);
    const removedRoles = originalRoles.except(this.selectedRoles);

    const hasChanges = addedRoles.length > 0 || removedRoles.length > 0;

    const onSave = async () => {
      if (!Features.rolesApi) return;
      try {
        this.isSaving = true;

        const promises: Promise<UpdateRoleMembershipResponse>[] = [];

        // Remove user from "removedRoles"
        for (const r of removedRoles) promises.push(rolesApi.updateRoleMembership(r, [], [userName], false));
        // Add to newly selected roles
        for (const r of addedRoles) promises.push(rolesApi.updateRoleMembership(r, [userName], [], false));

        await Promise.allSettled(promises);

        // Update roles and memberships so that the change is reflected in the ui
        await rolesApi.refreshRoles();
        await rolesApi.refreshRoleMembers();

        this.isSaving = false;

        toast({
          status: 'success',
          title: `${addedRoles.length} roles added, ${removedRoles.length} removed from user ${userName}`,
        });
        appGlobal.history.push(`/security/users/${userName}/details`);
      } catch (err) {
        toast({
          status: 'error',
          duration: null,
          isClosable: true,
          title: `Failed to update user ${userName}`,
          description: String(err),
        });
      } finally {
        this.isSaving = false;
      }
    };

    return (
      <>
        <ToastContainer />

        <PageContent>
          <Box>
            <Heading as="h2">Edit user</Heading>
            <Box>
              This is a Redpanda SASL/SCRAM user. For other types of users and authentication, see our documentation.
            </Box>

            <Heading as="h3" mt="4">
              Username
            </Heading>
            <Input isReadOnly value={this.props.userName} readOnly width="300px" />

            {Features.rolesApi && (
              <>
                <Heading as="h3" mt="4">
                  Assignments
                </Heading>
                <RoleSelector state={this.selectedRoles} />
              </>
            )}

            <Flex gap={4} mt={8}>
              <Button
                colorScheme="brand"
                onClick={onSave}
                isDisabled={this.isSaving || !hasChanges}
                isLoading={this.isSaving}
                loadingText="Saving..."
              >
                Save
              </Button>
              <Button variant="link" isDisabled={this.isSaving} onClick={onCancel}>
                Cancel
              </Button>
            </Flex>
          </Box>
        </PageContent>
      </>
    );
  }
}

export default UserEditPage;
