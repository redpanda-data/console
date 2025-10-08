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

import type { Topic, TopicConsumer } from '../../../state/rest-interfaces';

import '../../../utils/array-extensions';

import { DataTable } from '@redpanda-data/ui';

import usePaginationParams from '../../../hooks/use-pagination-params';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { uiState } from '../../../state/ui-state';
import { onPaginationChange } from '../../../utils/pagination';
import { editQuery } from '../../../utils/query-helper';
import { DefaultSkeleton } from '../../../utils/tsx-utils';

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

  // biome-ignore lint/correctness/useHookAtTopLevel: part of TopicConsumers implementation
  const paginationParams = usePaginationParams(consumers.length, uiState.topicSettings.consumerPageSize);

  return (
    <DataTable<TopicConsumer>
      columns={[
        { size: 1, header: 'Group', accessorKey: 'groupId' },
        { header: 'Lag', accessorKey: 'summedLag' },
      ]}
      data={consumers}
      onPaginationChange={onPaginationChange(paginationParams, ({ pageSize, pageIndex }) => {
        uiState.topicSettings.consumerPageSize = pageSize;
        editQuery((query) => {
          query.page = String(pageIndex);
          query.pageSize = String(pageSize);
        });
      })}
      onRow={(row) => {
        appGlobal.historyPush(`/groups/${encodeURIComponent(row.original.groupId)}`);
      }}
      pagination={paginationParams}
      sorting
    />
  );
});
