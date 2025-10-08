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

import { Alert, AlertIcon, DataTable } from '@redpanda-data/ui';
import { observer } from 'mobx-react';

import type {
  AclRule,
  AclStrOperation,
  AclStrPermission,
  AclStrResourcePatternType,
  AclStrResourceType,
  GetAclOverviewResponse,
} from '../../../../state/rest-interfaces';
import { toJson } from '../../../../utils/json-utils';

type Acls = GetAclOverviewResponse | null | undefined;

type AclListProps = {
  acl: Acls;
};

function flatResourceList(store: Acls) {
  const acls = store;
  if (acls?.aclResources == null) {
    return [];
  }
  const flatResources = acls.aclResources
    .flatMap((res) => res.acls.map((rule) => ({ ...res, ...rule })))
    .map((x) => ({ ...x, eqKey: toJson(x) }));
  return flatResources;
}

export default observer(({ acl }: AclListProps) => {
  const resources = flatResourceList(acl);

  return (
    <>
      {acl == null ? (
        <Alert status="warning" style={{ marginBottom: '1em' }}>
          <AlertIcon />
          You do not have the necessary permissions to view ACLs
        </Alert>
      ) : null}
      {acl?.isAuthorizerEnabled ? null : (
        <Alert status="warning" style={{ marginBottom: '1em' }}>
          <AlertIcon />
          There's no authorizer configured in your Kafka cluster
        </Alert>
      )}
      <DataTable<{
        eqKey: string;
        principal: string;
        host: string;
        operation: AclStrOperation;
        permissionType: AclStrPermission;
        resourceType: AclStrResourceType;
        resourceName: string;
        resourcePatternType: AclStrResourcePatternType;
        acls: AclRule[];
      }>
        columns={[
          {
            size: 120,
            header: 'Resource',
            accessorKey: 'resourceType',
          },
          {
            size: 120,
            header: 'Permission',
            accessorKey: 'permissionType',
          },
          {
            header: 'Principal',
            accessorKey: 'principal',
          },
          {
            size: 160,
            header: 'Operation',
            accessorKey: 'operation',
          },
          {
            header: 'PatternType',
            accessorKey: 'resourcePatternType',
          },
          {
            header: 'Name',
            accessorKey: 'resourceName',
          },
          {
            size: 120,
            header: 'Host',
            accessorKey: 'host',
          },
        ]}
        data={resources}
        pagination
        sorting
      />
    </>
  );
});
