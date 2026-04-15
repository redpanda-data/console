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
import { QueryResult } from 'components/misc/query-result';
import { TableSkeleton } from 'components/pages/security/shared/table-skeleton';
import { parseAsString, useQueryState } from 'nuqs';
import { DeleteRoleRequestSchema } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import type { FC } from 'react';

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
  const [searchQuery, setSearchQuery] = useQueryState('q', parseAsString.withDefault(''));
  const { data: rolesData, isLoading: rolesIsLoading, isError: rolesIsError, error: rolesError } = useListRolesQuery();
  const { mutateAsync: deleteRoleMutation } = useDeleteRoleMutation();

  const roles = filterByName(rolesData?.roles ?? [], searchQuery, (r) => r.name);

  const rolesWithMembers = roles.map((r) => {
    const members = rolesApi.roleMembers.get(r.name) ?? [];
    return { name: r.name, members };
  });

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
      <p>
        This tab displays all roles. Roles are groups of access control lists (ACLs) that can be assigned to principals.
        A principal represents any entity that can be authenticated, such as a user, service, or system (for example, a
        SASL-SCRAM user, OIDC identity, or mTLS client).
      </p>
      <NullFallbackBoundary>
        <FeatureLicenseNotification featureName="rbac" />
      </NullFallbackBoundary>
      <div className="flex items-center justify-between gap-4">
        <SearchField
          placeholderText="Filter by name or regex..."
          searchText={searchQuery ?? ''}
          setSearchText={(x) => setSearchQuery(x)}
          width="300px"
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Create role"
                data-testid="create-role-button"
                disabled={createRoleDisabled}
                onClick={() => appGlobal.historyPush('/security/roles/create')}
              >
                Create role
              </Button>
            </TooltipTrigger>
            {Boolean(createRoleTooltip) && <TooltipContent>{createRoleTooltip}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
      </div>
      <QueryResult
        error={rolesError}
        errorTitle="Failed to load roles"
        isError={rolesIsError}
        isLoading={rolesIsLoading}
        skeleton={<TableSkeleton />}
      >
        <Section>
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
              emptyText={searchQuery ? 'No roles match your search' : 'No roles yet'}
              pagination
              sorting
            />
          </div>
        </Section>
      </QueryResult>
    </div>
  );
};
