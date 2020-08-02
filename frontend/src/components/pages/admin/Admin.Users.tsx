import { Component } from "react";
import React from "react";
import { UserDetails } from "../../../state/restInterfaces";
import { Table, Skeleton, Select, Input, Typography, Collapse, Tooltip } from "antd";
import { observer } from "mobx-react";
import { api, } from "../../../state/backendApi";
import { sortField } from "../../misc/common";
import { motion } from "framer-motion";
import { animProps, MotionAlways } from "../../../utils/animationProps";
import '../../../utils/arrayExtensions';
import { RoleComponent } from "./Admin.Roles";
import { UserOutlined } from "@ant-design/icons";

const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;

@observer
export class AdminUsers extends Component<{}> {

    render() {
        if (!api.AdminInfo) return this.skeleton;
        const users = api.AdminInfo.users;

        const table = <Table
            size={'middle'} style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }} bordered={false}
            showSorterTooltip={false}

            dataSource={users}
            rowKey={x => x.internalIdentifier + x.oauthUserId + x.loginProvider}
            rowClassName={user => 'hoverLink' + (user.internalIdentifier == api.UserData?.user.internalIdentifier ? ' tableRowHighlightSpecial' : null)}
            columns={[
                {
                    width: 1, title: 'Identifier', dataIndex: 'internalIdentifier', sorter: sortField('internalIdentifier'), render: (t, r) => {
                        if (r.internalIdentifier == api.UserData?.user.internalIdentifier)
                            return <span><Tooltip title="You are currently logged in as this user"><UserOutlined style={{ fontSize: '16px', padding: '2px', color: '#ff9e3a' }} /></Tooltip>{' '}{t}</span>
                        return t;
                    }
                },
                { width: 1, title: 'OAuthUserID', dataIndex: 'oauthUserId', sorter: sortField('oauthUserId') },
                { width: 1, title: 'Roles', dataIndex: 'roles', render: (text, user) => user.grantedRoles.map(r => r.role.name).join(', ') }, // can't sort
                { width: 1, title: 'Login', dataIndex: 'loginProvider', sorter: sortField('loginProvider') },
                { title: '', render: r => (<span></span>) },
            ]}
            // expandIconAsCell={false}
            // expandIconColumnIndex={0}
            expandRowByClick={true}
            expandedRowRender={(user: UserDetails) =>
                <Collapse defaultActiveKey={user.grantedRoles.length > 0 ? user.grantedRoles[0].role.name : undefined}>
                    {user.grantedRoles.map(r =>
                        <Collapse.Panel key={r.role.name} header={r.role.name}>
                            <RoleComponent role={r.role} grantedBy={r.grantedBy} />
                        </Collapse.Panel>
                    )}
                </Collapse>
            }
        />

        return <MotionAlways>
            {table}
        </MotionAlways>
    }

    skeleton = <>
        <motion.div {...animProps} key={'loader'} style={{ margin: '2rem' }}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}
