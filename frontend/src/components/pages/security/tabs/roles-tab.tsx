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
import { DataTable, SearchField } from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import { EditIcon, TrashIcon } from 'components/icons';
import { DeleteRoleRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import type { FC } from 'react';
import { useState } from 'react';

import ErrorResult from '../../../../components/misc/error-result';
import { useDeleteRoleMutation, useListRolesQuery } from '../../../../react-query/api/security';
import { appGlobal } from '../../../../state/app-global';
import { rolesApi, useApiStoreHook } from '../../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { FeatureLicenseNotification } from '../../../license/feature-license-notification';
import { NullFallbackBoundary } from '../../../misc/null-fallback-boundary';
import Section from '../../../misc/section';
import { Button } from '../../../redpanda-ui/components/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../redpanda-ui/components/tooltip';
import { useSecurityBreadcrumbs } from '../hooks/use-security-breadcrumbs';
import { DeleteRoleConfirmModal } from '../shared/delete-role-confirm-modal';
import { filterByName } from '../shared/filter-by-name';

export const RolesTab: FC = () => {
  useSecurityBreadcrumbs([]);
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const userData = useApiStoreHook((s) => s.userData);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: rolesData, isError: rolesIsError, error: rolesError } = useListRolesQuery();
  const { mutateAsync: deleteRoleMutation } = useDeleteRoleMutation();

  const roles = filterByName(rolesData?.roles ?? [], searchQuery, (r) => r.name);

  const rolesWithMembers = roles.map((r) => {
    const members = rolesApi.roleMembers.get(r.name) ?? [];
    return { name: r.name, members };
  });

  if (rolesIsError) {
    return <ErrorResult error={rolesError} />;
  }

  const createRoleDisabled = userData?.canCreateRoles === false || !featureRolesApi;
  const createRoleTooltip = [
    userData?.canCreateRoles === false &&
      'You need KafkaAclOperation.KAFKA_ACL_OPERATION_ALTER and RedpandaCapability.MANAGE_RBAC permissions.',
    !featureRolesApi && 'This feature is not enabled.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-4">
      <div>
        This tab displays all roles. Roles are groups of access control lists (ACLs) that can be assigned to principals.
        A principal represents any entity that can be authenticated, such as a user, service, or system (for example, a
        SASL-SCRAM user, OIDC identity, or mTLS client).
      </div>
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
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="create-role-button"
                disabled={createRoleDisabled}
                onClick={() => appGlobal.historyPush('/security/roles/create')}
                variant="outline"
              >
                Create role
              </Button>
            </TooltipTrigger>
            {createRoleTooltip && <TooltipContent>{createRoleTooltip}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>

        <div className="my-4">
          <DataTable
            columns={[
              {
                id: 'name',
                size: Number.POSITIVE_INFINITY,
                header: 'Role name',
                cell: (ctx) => {
                  const entry = ctx.row.original;
                  return (
                    <Link
                      className="text-inherit no-underline hover:no-underline"
                      data-testid={`role-list-item-${entry.name}`}
                      params={{ roleName: encodeURIComponent(entry.name) }}
                      search={{} as never}
                      to="/security/roles/$roleName/details"
                    >
                      {entry.name}
                    </Link>
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
                    <div className="flex flex-row gap-4">
                      <Button
                        aria-label={`Edit role ${entry.name}`}
                        data-testid={`edit-role-button-${entry.name}`}
                        onClick={() => {
                          appGlobal.historyPush(`/security/roles/${encodeURIComponent(entry.name)}/update`);
                        }}
                        size="icon-sm"
                        variant="secondary-ghost"
                      >
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <DeleteRoleConfirmModal
                        buttonEl={
                          <Button
                            aria-label={`Delete role ${entry.name}`}
                            data-testid={`delete-role-button-${entry.name}`}
                            size="icon-sm"
                            variant="destructive-ghost"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        }
                        numberOfPrincipals={entry.members.length}
                        onConfirm={async () => {
                          await deleteRoleMutation(
                            create(DeleteRoleRequestSchema, { roleName: entry.name, deleteAcls: true })
                          );
                        }}
                        roleName={entry.name}
                      />
                    </div>
                  );
                },
              },
            ]}
            data={rolesWithMembers}
            pagination
            sorting
          />
        </div>
      </Section>
    </div>
  );
};
