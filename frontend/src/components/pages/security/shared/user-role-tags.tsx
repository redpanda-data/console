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

import { useQuery } from '@connectrpc/connect-query';
import { useNavigate } from '@tanstack/react-router';
import { TagsValue } from 'components/redpanda-ui/components/tags';

import type { ListACLsRequest } from '../../../../protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from '../../../../protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { rolesApi } from '../../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
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
  const elements: JSX.Element[] = [];
  let numberOfVisibleElements = 0;
  let numberOfHiddenElements = 0;

  const featureRolesApi = useSupportedFeaturesStore((s) => s.rolesApi);
  const navigate = useNavigate();

  const { data: hasAcls } = useQuery(
    listACLs,
    {
      filter: {
        principal: `${principalType}:${userName}`,
      },
    } as ListACLsRequest,
    {
      enabled: !!userName,
      select: (response) => response.resources.length > 0,
    }
  );

  if (hasAcls) {
    elements.push(
      <TagsValue
        key={`acl-${userName}`}
        onClick={() => navigate({ to: `/security/acls/${userName}/details` })}
      >{`${principalType}:${userName}`}</TagsValue>
    );
  }

  if (featureRolesApi) {
    // Get all roles, and ACL sets that apply to this user
    const roles: string[] = [];
    for (const [roleName, members] of rolesApi.roleMembers) {
      if (!members.any((m) => m.name === userName && m.principalType === principalType)) {
        continue; // this role doesn't contain our principal
      }
      roles.push(roleName);
    }

    numberOfVisibleElements = Math.min(roles.length, showMaxItems);
    numberOfHiddenElements = showMaxItems === Number.POSITIVE_INFINITY ? 0 : Math.max(0, roles.length - showMaxItems);

    for (let i = 0; i < numberOfVisibleElements; i++) {
      const r = roles[i];
      elements.push(
        <div key={r}>
          <TagsValue onClick={() => navigate({ to: `/security/roles/${r}/details` })}>{`RedpandaRole:${r}`}</TagsValue>
        </div>
      );
    }

    if (elements.length === 0) {
      elements.push(<p key="no-roles">No roles</p>);
    }
    if (numberOfHiddenElements > 0) {
      elements.push(<p key="hidden-count">{`+${numberOfHiddenElements} more`}</p>);
    }
  }

  return <div className={verticalView ? 'flex' : ''}>{elements}</div>;
};
