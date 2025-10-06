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
import { TagsValue } from 'components/redpanda-ui/components/tags';
import { observer } from 'mobx-react';
import { useNavigate } from 'react-router-dom';

import type { ListACLsRequest } from '../../../protogen/redpanda/api/dataplane/v1/acl_pb';
import { listACLs } from '../../../protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { rolesApi } from '../../../state/backendApi';
import { Features } from '../../../state/supportedFeatures';

export const UserRoleTags = observer(
  ({
    userName,
    showMaxItems = Number.POSITIVE_INFINITY,
    verticalView = true,
  }: {
    userName: string;
    showMaxItems?: number;
    verticalView?: boolean;
  }) => {
    const elements: JSX.Element[] = [];
    let numberOfVisibleElements = 0;
    let numberOfHiddenElements = 0;

    const navigate = useNavigate();

    const { data: hasAcls } = useQuery(
      listACLs,
      {
        filter: {
          principal: `User:${userName}`,
        },
      } as ListACLsRequest,
      {
        enabled: !!userName,
        select: (response) => {
          return response.resources.length > 0;
        },
      },
    );

    if (hasAcls) {
      elements.push(
        <TagsValue onClick={() => navigate(`/security/acls/${userName}/details`)}>{`User:${userName}`}</TagsValue>,
      );
    }

    if (Features.rolesApi) {
      // Get all roles, and ACL sets that apply to this user
      const roles = [];
      for (const [roleName, members] of rolesApi.roleMembers) {
        if (!members.any((m) => m.name === userName)) {
          continue; // this role doesn't contain our user
        }
        roles.push(roleName);
      }

      numberOfVisibleElements = Math.min(roles.length, showMaxItems);
      numberOfHiddenElements = showMaxItems === Number.POSITIVE_INFINITY ? 0 : Math.max(0, roles.length - showMaxItems);

      for (let i = 0; i < numberOfVisibleElements; i++) {
        const r = roles[i];
        elements.push(
          <div>
            <TagsValue
              key={r}
              onClick={() => navigate(`/security/roles/${r}/details`)}
            >{`RedpandaRole:${r}`}</TagsValue>
          </div>,
        );
      }

      if (elements.length === 0) elements.push(<p>No roles</p>);
      if (numberOfHiddenElements > 0) elements.push(<p>{`+${numberOfHiddenElements} more`}</p>);
    }

    return <div className={!verticalView ? '' : 'flex'}>{elements}</div>;
  },
);
