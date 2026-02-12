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

import { rolesApi } from '../../../state/backend-api';
import { Features } from '../../../state/supported-features';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex conditional rendering for role tags
export const UserRoleTags = ({
  userName,
  hasAcls = false,
  showMaxItems = Number.POSITIVE_INFINITY,
  verticalView = true,
}: {
  userName: string;
  hasAcls?: boolean;
  showMaxItems?: number;
  verticalView?: boolean;
}) => {
  const elements: JSX.Element[] = [];
  let numberOfVisibleElements = 0;
  let numberOfHiddenElements = 0;

  const navigate = useNavigate();

  if (hasAcls) {
    elements.push(
      <TagsValue
        key="user-acls"
        onClick={() => navigate({ to: '/security/acls/$aclName/details', params: { aclName: userName } })}
      >{`User:${userName}`}</TagsValue>
    );
  }

  if (Features.rolesApi) {
    // Get all roles that apply to this user
    const roles: string[] = [];
    for (const [roleName, members] of rolesApi.roleMembers) {
      if (!members.any((m) => m.name === userName)) {
        continue;
      }
      roles.push(roleName);
    }

    numberOfVisibleElements = Math.min(roles.length, showMaxItems);
    numberOfHiddenElements = showMaxItems === Number.POSITIVE_INFINITY ? 0 : Math.max(0, roles.length - showMaxItems);

    for (let i = 0; i < numberOfVisibleElements; i++) {
      const r = roles[i];
      elements.push(
        <div key={r}>
          <TagsValue
            onClick={() => navigate({ to: '/security/roles/$roleName/details', params: { roleName: r } })}
          >{`RedpandaRole:${r}`}</TagsValue>
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
