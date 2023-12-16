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

/* eslint-disable react/jsx-key */

import React, { Component, ReactNode } from 'react';
import { Permission, Role, RoleBinding } from '../../../state/restInterfaces';
import { observer } from 'mobx-react';
import { api, } from '../../../state/backendApi';
import '../../../utils/arrayExtensions';
import { DefaultSkeleton, QuickTable } from '../../../utils/tsxUtils';
import { RoleBindingComponent } from './Admin.RoleBindings';
import { DataTable } from '@redpanda-data/ui';


@observer
export class AdminRoles extends Component<{}> {

    render() {
        if (!api.adminInfo) return DefaultSkeleton;
        const roles = api.adminInfo.roles;

        return <DataTable<Role>
            enableSorting
            data={roles}
            size="md"
            expandRowByClick
            subComponent={({row: {original: role}}) => <RoleComponent role={role}/>}
            columns={[
                {
                    accessorKey: 'name',
                    header: 'Role Name',
                    size: Infinity,
                },
            ]}
        />
    }
}

export class RoleComponent extends Component<{ role: Role, grantedBy?: RoleBinding[] }>{
    render() {
        const { role, grantedBy } = this.props;

        return <div style={{ display: 'grid', gridTemplateColumns: '50% 1px 50%', gridColumnGap: '4px' }}>

            <div>
                <div className="roleTitle">Role Permissions</div>
                <div style={{ paddingLeft: '.5rem', display: 'grid', gridAutoFlow: 'row', gridGap: '20px' }}>
                    {role.permissions.map((p, index) => <PermissionComponent key={index} permission={p} />)}
                </div>
            </div>

            {grantedBy && <>
                <div style={{ background: '#dcdcdc' }} /> {/* seperator */}
                <div style={{ paddingLeft: '1em' }}>
                    <div className="roleTitle">Granted By</div>
                    <div style={{ paddingLeft: '.5rem', display: 'grid', gridAutoFlow: 'row', gridGap: '20px' }}>
                        {this.props.grantedBy?.map(x => <RoleBindingComponent key={x.ephemeralId} binding={x} />)}
                    </div>
                </div>
            </>}
        </div>
    }
}

const joinerOr = <span className="joinerOr">or</span>;

export class PermissionComponent extends Component<{ permission: Permission }>{
    render() {
        const p = this.props.permission;
        const rows: [ReactNode, ReactNode][] = [
            [<span className="resourceLabel">Resource</span>, <span className="codeBox resourceName">{p.resourceName}</span>],
        ];
        if (p.allowedActions.length > 0)
            rows.push([<span className="resourceLabelSub">Actions</span>, stringsToBoxes(p.allowedActions, null, 'permissionsList')]);
        if (p.includes.length > 0 && !(p.includes[0] == '*') && !(p.includes[0] == '^*$') && !(p.includes[0] == '^.*$'))
            rows.push([<span className="resourceLabelSub">Includes</span>, stringsToBoxes(p.includes, joinerOr, 'permissionRegex')]);
        if (p.excludes.length > 0)
            rows.push([<span className="resourceLabelSub">Excludes</span>, stringsToBoxes(p.excludes, joinerOr, 'permissionRegex')]);

        const t = QuickTable(rows, {
            tableClassName: 'permissionTable',
            tableStyle: { width: 'auto' },
            gapWidth: '8px',
            keyStyle: { fontSize: '80%', whiteSpace: 'nowrap', width: '1%' },
            keyAlign: 'right',
        });

        return t;
    }
}


function stringsToBoxes(ar: string[], joiner?: ReactNode, wrapperClass?: string): ReactNode {
    let r = ar.map<ReactNode>((str, index) => <span key={index} className="codeBox">{str}</span>);
    if (joiner) r = r.genericJoin(() => joiner);

    return <div className={wrapperClass}>{r}</div>;
}
