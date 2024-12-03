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

import { observer } from 'mobx-react';
import type { FC } from 'react';
import type { Topic, TopicConsumer } from '../../../state/restInterfaces';

import '../../../utils/arrayExtensions';

import { DataTable } from '@redpanda-data/ui';
import usePaginationParams from '../../../hooks/usePaginationParams';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { uiState } from '../../../state/uiState';
import { onPaginationChange } from '../../../utils/pagination';
import { editQuery } from '../../../utils/queryHelper';
import { DefaultSkeleton } from '../../../utils/tsxUtils';

type TopicConsumersProps = { topic: Topic };

export const TopicConsumers: FC<TopicConsumersProps> = observer(({ topic }) => {
  let consumers = api.topicConsumers.get(topic.topicName);
  const isLoading = consumers === null;
  if (isLoading) {
    return DefaultSkeleton;
  }
  if (!consumers) {
    consumers = [];
  }

  const paginationParams = usePaginationParams(uiState.topicSettings.consumerPageSize, consumers.length);

  return (
    <DataTable<TopicConsumer>
      data={consumers}
      pagination={paginationParams}
      onPaginationChange={onPaginationChange(paginationParams, ({ pageSize, pageIndex }) => {
        uiState.topicSettings.consumerPageSize = pageSize;
        editQuery((query) => {
          query.page = String(pageIndex);
          query.pageSize = String(pageSize);
        });
      })}
      sorting
      columns={[
        { size: 1, header: 'Group', accessorKey: 'groupId' },
        { header: 'Lag', accessorKey: 'summedLag' },
      ]}
      onRow={(row) => {
        appGlobal.history.push(`/groups/${encodeURIComponent(row.original.groupId)}`);
      }}
    />
  );
});
