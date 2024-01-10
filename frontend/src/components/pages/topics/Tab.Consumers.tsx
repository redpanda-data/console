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

import React, { Component } from 'react';
import { Topic, TopicConsumer } from '../../../state/restInterfaces';
import { observer } from 'mobx-react';

import '../../../utils/arrayExtensions';

import { api } from '../../../state/backendApi';
import { appGlobal } from '../../../state/appGlobal';
import { DataTable } from '@redpanda-data/ui';
import { DefaultSkeleton } from '../../../utils/tsxUtils';

@observer
export class TopicConsumers extends Component<{ topic: Topic }> {
    render() {
        let consumers = api.topicConsumers.get(this.props.topic.topicName);
        const isLoading = consumers === null;

        if(isLoading) {
            return DefaultSkeleton
        }

        if (!consumers) {
            consumers = [];
        }

        return <DataTable<TopicConsumer>
            data={consumers}
            size="sm"
            showPagination
            columns={[
                {size: 1, header: 'Group', accessorKey: 'groupId'},
                {header: 'Lag', accessorKey: 'summedLag'},
            ]}
            onRow={row => {
                appGlobal.history.push(`/groups/${encodeURIComponent(row.original.groupId)}`)
            }}
        />
    }
}
