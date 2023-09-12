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

import { Component } from 'react';
import { UserDetails } from '../../../state/restInterfaces';
import { Table } from 'antd';
import { observer } from 'mobx-react';
import { api, } from '../../../state/backendApi';
import { sortField } from '../../misc/common';
import { MotionDiv } from '../../../utils/animationProps';
import '../../../utils/arrayExtensions';
import { RoleComponent } from './Admin.Roles';
import { UserOutlined } from '@ant-design/icons';
import { makeObservable, observable } from 'mobx';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import {Accordion, SearchField, Tooltip} from '@redpanda-data/ui';

@observer
export class AdminUsers extends Component<{}> {
    @observable quickSearch = '';

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        if (!api.adminInfo) return DefaultSkeleton;
        const users = this.quickSearch.length > 0 ? api.adminInfo.users.filter(u => u.internalIdentifier.includes(this.quickSearch) || u.oauthUserId.includes(this.quickSearch)) : api.adminInfo.users;

        const table = (
            <Table
                size={'middle'}
                style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }}
                bordered={false}
                showSorterTooltip={false}
                dataSource={users}
                rowKey={x => x.internalIdentifier + x.oauthUserId + x.loginProvider}
                rowClassName={user => 'hoverLink' + (user.internalIdentifier == api.userData?.user.internalIdentifier ? ' tableRowHighlightSpecial' : null)}
                columns={[
                    {
                        width: 1,
                        title: 'Identifier',
                        dataIndex: 'internalIdentifier',
                        sorter: sortField('internalIdentifier'),
                        render: (t, r) => {
                            if (r.internalIdentifier == api.userData?.user.internalIdentifier)
                                return (
                                    <span>
                                        <Tooltip label="You are currently logged in as this user" placement="top" hasArrow>
                                            <UserOutlined style={{ fontSize: '16px', padding: '2px', color: '#ff9e3a' }} />
                                        </Tooltip>{' '}
                                        {t}
                                    </span>
                                );
                            return t;
                        }
                    },
                    { width: 1, title: 'OAuthUserID', dataIndex: 'oauthUserId', sorter: sortField('oauthUserId') },
                    { width: 1, title: 'Roles', dataIndex: 'roles', render: (_text, user) => user.grantedRoles.map(r => r.role.name).join(', ') }, // can't sort
                    { width: 1, title: 'Login', dataIndex: 'loginProvider', sorter: sortField('loginProvider') },
                    { title: '', render: _r => <span></span> }
                ]}
                // expandIconAsCell={false}
                // expandIconColumnIndex={0}
                expandRowByClick={true}
                expandedRowRender={(user: UserDetails) => (
                    <div>
                        <Accordion
                            defaultIndex={0}
                            items={
                                user.grantedRoles.map(r => ({
                                    heading: r.role.name,
                                    description: <RoleComponent role={r.role} grantedBy={r.grantedBy}/>
                                }))
                            }
                        />
                    </div>
                )}
            />
        );

        return <MotionDiv>
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
                <SearchField width="300px"
                    searchText={this.quickSearch}
                    setSearchText={x => this.quickSearch = x}
                />
            </div>

            {table}
        </MotionDiv>
    }
}
