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

import React, { Component } from 'react';
import { RoleBinding, Subject } from '../../../state/restInterfaces';
import '../../../utils/arrayExtensions';
import { QuickTable, ObjToKv } from '../../../utils/tsxUtils';
import { Accordion } from '@redpanda-data/ui';

export class RoleBindingComponent extends Component<{ binding: RoleBinding }>{
    render() {
        const binding = this.props.binding;

        const rows: [any, any][] = [
            [<span className="resourceLabel">Binding</span>, <span className="roleBindingId">{binding.ephemeralId}</span>],
            [<span className="resourceLabelSub">Metadata</span>, QuickTable(ObjToKv(binding.metadata), { tableStyle: { width: 'auto', fontFamily: 'monospace', fontSize: '80%' }, gapWidth: '6px' })],
            [<span className="resourceLabelSub">Subjects</span>, <Accordion items={[
                {heading: 'click to expand', description: <div>
                        {binding.subjects.map(s => <SubjectComponent key={s.name + s.providerName} subject={s} />)}
                    </div>}
            ]}/>]
        ];

        const t = QuickTable(rows, {
            tableClassName: 'permissionTable',
            tableStyle: { width: 'auto' },
            gapWidth: '8px',
            gapHeight: '4px',
            keyStyle: { fontSize: '80%', whiteSpace: 'nowrap', width: '1%', verticalAlign: 'top', padding: '1px 0px' },
            keyAlign: 'right',
        });

        return t;
    }
}

export class SubjectComponent extends Component<{ subject: Subject }>{
    render() {
        const s = this.props.subject;
        // todo: this is a placeholder, to be completely replaced...

        return <>
            <div>
                <span>{s.providerName}</span>
                {'-'}
                <span style={{ textTransform: 'capitalize' }}>{s.subjectKindName}</span>
                {': '}
                <span>{s.name}</span>
                <span>{s.organization && ` (Org: ${s.organization})`}</span>
            </div>
        </>
    }
}
