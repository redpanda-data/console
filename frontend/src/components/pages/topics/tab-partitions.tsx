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

import { api } from '../../../state/backend-api';
import type { Partition, Topic } from '../../../state/rest-interfaces';
import '../../../utils/array-extensions';
import { Alert, AlertIcon, Box, DataTable, Flex, Popover, Text } from '@redpanda-data/ui';
import { WarningIcon } from 'components/icons';
import { Badge } from 'components/redpanda-ui/components/badge';

import usePaginationParams from '../../../hooks/use-pagination-params';
import { uiState } from '../../../state/ui-state';
import { onPaginationChange } from '../../../utils/pagination';
import { editQuery } from '../../../utils/query-helper';
import { DefaultSkeleton, InfoText, numberToThousandsString } from '../../../utils/tsx-utils';
import { BrokerList } from '../../misc/broker-list';

type TopicPartitionsProps = {
  topic: Topic;
};

export const TopicPartitions: FC<TopicPartitionsProps> = observer(({ topic }) => {
  const partitions = api.topicPartitions.get(topic.topicName);
  const paginationParams = usePaginationParams(partitions?.length ?? 0, uiState.topicSettings.partitionPageSize);

  if (partitions === undefined) {
    return DefaultSkeleton;
  }
  if (partitions === null) {
    return <div />; // todo: show the error (if one was reported);
  }

  const leaderLessPartitions = (api.clusterHealth?.leaderlessPartitions ?? []).find(
    ({ topicName }) => topicName === topic.topicName
  )?.partitionIds;
  const underReplicatedPartitions = (api.clusterHealth?.underReplicatedPartitions ?? []).find(
    ({ topicName }) => topicName === topic.topicName
  )?.partitionIds;

  let warning: JSX.Element = <></>;
  if (topic.cleanupPolicy.toLowerCase() === 'compact') {
    warning = (
      <Alert marginBottom="1em" status="warning">
        <AlertIcon />
        Topic cleanupPolicy is 'compact'. Message Count is an estimate!
      </Alert>
    );
  }

  return (
    <>
      {warning}
      <DataTable<Partition>
        columns={[
          {
            header: 'Partition ID',
            accessorKey: 'id',
            cell: ({ row: { original: partition } }) => {
              const header = partition.hasErrors ? (
                <Flex justifyContent="space-between">
                  <Text>{partition.id}</Text>
                  <Box>
                    <PartitionError partition={partition} />
                  </Box>
                </Flex>
              ) : (
                partition.id
              );

              return (
                <Flex alignItems="center" gap={2}>
                  {header}
                  {leaderLessPartitions?.includes(partition.id) && (
                    <Badge variant="destructive-inverted">Leaderless</Badge>
                  )}
                  {underReplicatedPartitions?.includes(partition.id) && (
                    <Badge variant="warning-inverted">Under-replicated</Badge>
                  )}
                </Flex>
              );
            },
          },
          {
            id: 'waterMarkLow',
            header: () => (
              <InfoText tooltip="Low Water Mark" tooltipOverText>
                Low
              </InfoText>
            ),
            accessorKey: 'waterMarkLow',
            cell: ({ row: { original: partition } }) => numberToThousandsString(partition.waterMarkLow),
          },
          {
            id: 'waterMarkHigh',
            header: () => (
              <InfoText tooltip="High Water Mark" tooltipOverText>
                High
              </InfoText>
            ),
            accessorKey: 'waterMarkHigh',
            cell: ({ row: { original: partition } }) => numberToThousandsString(partition.waterMarkHigh),
          },
          {
            header: 'Messages',
            cell: ({ row: { original: partition } }) =>
              !partition.hasErrors && numberToThousandsString(partition.waterMarkHigh - partition.waterMarkLow),
          },
          {
            header: 'Brokers',
            cell: ({ row: { original: partition } }) => <BrokerList partition={partition} />,
          },
        ]}
        data={partitions}
        // @ts-expect-error - we need to get rid of this enum in DataTable
        defaultPageSize={uiState.topicSettings.partitionPageSize}
        onPaginationChange={onPaginationChange(paginationParams, ({ pageSize, pageIndex }) => {
          uiState.topicSettings.partitionPageSize = pageSize;
          editQuery((query) => {
            query.page = String(pageIndex);
            query.pageSize = String(pageSize);
          });
        })}
        pagination={paginationParams}
        sorting
      />
    </>
  );
});

const PartitionError: FC<{ partition: Partition }> = ({ partition }) => {
  if (!(partition.partitionError || partition.waterMarksError)) {
    return null;
  }

  return (
    <Popover
      content={
        <Flex flexDirection="column" gap={2} maxWidth={500} whiteSpace="pre-wrap">
          {Boolean(partition.partitionError) && <Text>{partition.partitionError}</Text>}
          {Boolean(partition.waterMarksError) && <Text>{partition.waterMarksError}</Text>}
        </Flex>
      }
      hideCloseButton
      placement="right-start"
      size="auto"
      title="Partition Error"
    >
      <Box>
        <WarningIcon color="orange" size={20} />
      </Box>
    </Popover>
  );
};
