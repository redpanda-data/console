import React from "react";
import { Table, Empty, Skeleton } from "antd";
import { observer } from "mobx-react";

import { api } from "../../state/backendApi";
import { uiState as ui } from "../../state/ui";
import { PageComponent, PageInitHelper } from "./Page";
import { CompareFn } from "antd/lib/table";
import { PaginationConfig } from "antd/lib/pagination";
import { GroupMemberDescription } from "../../models/ServiceModels";
import { appGlobal } from "../..";
import { motion } from "framer-motion";
import { animProps } from "../../utils/animationProps";



@observer
class GroupList extends PageComponent {

	initPage(p: PageInitHelper): void {
		p.title = 'Consumer Groups';
		p.addBreadcrumb('Consumer Groups', '/groups');

		api.refreshConsumerGroups();
	}

	render() {
		if (!api.ConsumerGroups) return this.skeleton;
		if (api.ConsumerGroups.length == 0) return <Empty />

		const groups = api.ConsumerGroups;

		return (
			<motion.div {...animProps}>
				<Table
					style={{ margin: '0', padding: '0' }} bordered={true} size={'middle'}
					onRow={(record, rowIndex) =>
						({
							onClick: event => appGlobal.history.push('/groups/' + record.groupId),
						})}
					rowClassName={() => 'hoverLink'}
					dataSource={groups}
					rowKey={x => x.groupId}
					columns={[
						{ title: 'ID', dataIndex: 'groupId', },
						{ title: 'State', dataIndex: 'state', width: 1 },
						{ title: 'Members', dataIndex: 'members', width: 1, render: (t: GroupMemberDescription[], r, i) => t.length },
					]} />
			</motion.div>
		);
	}

	skeleton = <>
		<motion.div {...animProps} key={'loader'}>
			<Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
		</motion.div>
	</>
}

export default GroupList;
