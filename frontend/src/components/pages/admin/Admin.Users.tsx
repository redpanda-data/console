import { Component } from "react";
import React from "react";
import { UserDetails } from "../../../state/restInterfaces";
import { Table, Skeleton, Select, Input, Typography } from "antd";
import { observer } from "mobx-react";
import { api, } from "../../../state/backendApi";
import { sortField } from "../../misc/common";
import { motion } from "framer-motion";
import { animProps, MotionAlways } from "../../../utils/animationProps";
import '../../../utils/arrayExtensions';
import { RoleComponent } from "./Admin.Roles";

const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;

@observer
export class AdminUsers extends Component<{}> {

    render() {
        if (!api.AdminInfo) return this.skeleton;
        const users = api.AdminInfo.users;

        return <div>wip</div>
        // const table = <Table
        //     size={'middle'} style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }} bordered={false}
        //     showSorterTooltip={false}

        //     dataSource={users}
        //     rowKey={x => x.name}
        //     rowClassName={() => 'hoverLink'}
        //     columns={[
        //         { width: 1, title: 'Name', dataIndex: 'name', sorter: sortField('name') },
        //         { width: 1, title: 'Roles', dataIndex: 'roleNames', render: (t, r, i) => r.roleNames.join(', ') }, // can't sort
        //         { width: 1, title: 'Login', dataIndex: 'loginProvider', sorter: sortField('loginProvider') },
        //         { title: '', render: r => (<span></span>) },
        //     ]}
        //     // expandIconAsCell={false}
        //     // expandIconColumnIndex={0}
        //     expandRowByClick={true}
        //     expandedRowRender={(user: UserDetails) => {
        //         return user.roles.map(r => <RoleComponent role={r} />)
        //     }}
        // />

        // return <MotionAlways>
        //     {table}
        // </MotionAlways>
    }

    skeleton = <>
        <motion.div {...animProps} key={'loader'} style={{ margin: '2rem' }}>
            <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
        </motion.div>
    </>
}
