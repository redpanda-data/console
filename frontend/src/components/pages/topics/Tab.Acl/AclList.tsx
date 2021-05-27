import React from 'react';
import { observer } from 'mobx-react';
import { makePaginationConfig, sortField } from '../../../misc/common';
import Table, { ColumnProps, TablePaginationConfig } from 'antd/lib/table';
import { toJson } from '../../../../utils/jsonUtils';
import { Alert } from 'antd';
import { uiState } from '../../../../state/uiState';

import type { AclResponse } from '../../../../state/restInterfaces';

type Acls = AclResponse | null | undefined;

interface AclListProps {
    acl: Acls;
    onChange?: (config: TablePaginationConfig) => void
    paginationConfig?: TablePaginationConfig
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

export default observer(function ({ acl, onChange, paginationConfig }: AclListProps) {
    const resources = flatResourceList(acl);
    const columns: ColumnProps<typeof resources[0]>[] = [
        { width: '120px', title: 'Resource', dataIndex: 'resourceType', sorter: sortField('resourceType'), defaultSortOrder: 'ascend' },
        { width: '120px', title: 'Permission', dataIndex: 'permissionType', sorter: sortField('permissionType') },
        { width: 'auto', title: 'Principal', dataIndex: 'principal', sorter: sortField('principal') },
        { width: '160px', title: 'Operation', dataIndex: 'operation', sorter: sortField('operation') },
        { width: 'auto', title: 'PatternType', dataIndex: 'resourcePatternType', sorter: sortField('resourcePatternType') },
        { width: 'auto', title: 'Name', dataIndex: 'resourceName', sorter: sortField('resourceName') },
        { width: '120px', title: 'Host', dataIndex: 'host', sorter: sortField('host') },
    ];

    return (
        <>
            {acl == null ? <Alert type="warning" message="You do not have the necessary permissions to view ACLs" showIcon style={{ marginBottom: '1em' }} /> : null}
            {!acl?.isAuthorizerEnabled ? <Alert type="warning" message="There's no authorizer configured in your Kafka cluster" showIcon style={{ marginBottom: '1em' }} /> : null}
            <Table
                style={{ margin: '0', padding: '0' }}
                size={'middle'}
                pagination={paginationConfig}
                onChange={onChange}
                dataSource={resources}
                rowKey={(x) => x.eqKey}
                rowClassName={() => 'pureDisplayRow'}
                columns={columns}
            />
        </>
    );
});
