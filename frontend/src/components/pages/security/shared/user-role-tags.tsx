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

import { useNavigate } from '@tanstack/react-router';
import { TagsValue } from 'components/redpanda-ui/components/tags';

import { rolesApi } from '../../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { usePrincipalHasAcls } from '../hooks/use-principal-has-acls';

const getPrincipalRoleNames = (userName: string, principalType: 'User' | 'Group') =>
  [...rolesApi.roleMembers]
    .filter(([, members]) => members.any((m) => m.name === userName && m.principalType === principalType))
    .map(([roleName]) => roleName);

export const UserRoleTags = ({
  userName,
  principalType = 'User',
  showMaxItems = Number.POSITIVE_INFINITY,
  verticalView = true,
}: {
  userName: string;
  principalType?: 'User' | 'Group';
  showMaxItems?: number;
  verticalView?: boolean;
}) => {
  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const navigate = useNavigate();
  const hasAcls = usePrincipalHasAcls(`${principalType}:${userName}`, !!userName);
  // Roles only show when the cluster supports them; an empty list then reads "No roles".
  const roles = featureRolesApi ? getPrincipalRoleNames(userName, principalType) : [];
  const visibleRoles = roles.slice(0, Math.min(roles.length, showMaxItems));
  const hiddenCount = showMaxItems === Number.POSITIVE_INFINITY ? 0 : Math.max(0, roles.length - showMaxItems);

  return (
    <div className={verticalView ? 'flex' : ''}>
      {hasAcls && (
        <TagsValue
          key={`acl-${userName}`}
          onClick={() => navigate({ to: `/security/acls/${userName}/details` })}
        >{`${principalType}:${userName}`}</TagsValue>
      )}
      {visibleRoles.map((r) => (
        <div key={r}>
          <TagsValue onClick={() => navigate({ to: `/security/roles/${r}/details` })}>{`RedpandaRole:${r}`}</TagsValue>
        </div>
      ))}
      {Boolean(featureRolesApi) && !hasAcls && visibleRoles.length === 0 && <p key="no-roles">No roles</p>}
      {hiddenCount > 0 && <p key="hidden-count">{`+${hiddenCount} more`}</p>}
    </div>
  );
};
