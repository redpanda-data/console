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

import React from 'react';
import { observer } from 'mobx-react';
import { toJson } from '../../../../utils/jsonUtils';

import type { AclRule, AclStrOperation, AclStrPermission, AclStrResourcePatternType, AclStrResourceType, GetAclOverviewResponse } from '../../../../state/restInterfaces';
import { Alert, AlertIcon, DataTable } from '@redpanda-data/ui';

type Acls = GetAclOverviewResponse | null | undefined;

interface AclListProps {
    acl: Acls;
}

function flatResourceList(store: Acls) {
    const acls = store;
    if (acls?.aclResources == null) return [];
    const flatResources = acls.aclResources
        .map((res) => res.acls.map((rule) => ({ ...res, ...rule })))
        .flat()
        .map((x) => ({ ...x, eqKey: toJson(x) }));
    return flatResources;
}

export default observer(function ({ acl }: AclListProps) {
    const resources = flatResourceList(acl);

    return (
        <>
            {acl == null ? <Alert status="warning" style={{ marginBottom: '1em' }}>
                <AlertIcon />
                You do not have the necessary permissions to view ACLs
            </Alert> : null}
            {!acl?.isAuthorizerEnabled ? <Alert status="warning" style={{ marginBottom: '1em' }}>
                <AlertIcon />
                There's no authorizer configured in your Kafka cluster
            </Alert> : null}
            <DataTable<{
                eqKey: string,
                principal: string,
                host: string,
                operation: AclStrOperation,
                permissionType: AclStrPermission,
                resourceType: AclStrResourceType,
                resourceName: string,
                resourcePatternType: AclStrResourcePatternType,
                acls: AclRule[]
            }>
                size="sm"
                data={resources}
                columns={[
                    {
                        size: 120,
                        header: 'Resource',
                        accessorKey: 'resourceType'
                    },
                    {
                        size: 120,
                        header: 'Permission',
                        accessorKey: 'permissionType'
                    },
                    {
                        header: 'Principal',
                        accessorKey: 'principal'
                    },
                    {
                        size: 160,
                        header: 'Operation',
                        accessorKey: 'operation'
                    },
                    {
                        header: 'PatternType',
                        accessorKey: 'resourcePatternType'
                    },
                    {
                        header: 'Name',
                        accessorKey: 'resourceName'
                    },
                    {
                        size: 120,
                        header: 'Host',
                        accessorKey: 'host'
                    },
                ]}
            />
        </>
    );
});
