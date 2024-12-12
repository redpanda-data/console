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
import { api } from '../../../state/backendApi';
import type { Partition, Topic } from '../../../state/restInterfaces';
import '../../../utils/arrayExtensions';
import { Alert, AlertIcon, Badge, Box, DataTable, Flex, Popover, Text } from '@redpanda-data/ui';
import { MdOutlineWarningAmber } from 'react-icons/md';
import usePaginationParams from '../../../hooks/usePaginationParams';
import { uiState } from '../../../state/uiState';
import { onPaginationChange } from '../../../utils/pagination';
import { editQuery } from '../../../utils/queryHelper';
import { DefaultSkeleton, InfoText, numberToThousandsString } from '../../../utils/tsxUtils';
import { BrokerList } from '../../misc/BrokerList';

type TopicPartitionsProps = {
  topic: Topic;
};

export const TopicPartitions: FC<TopicPartitionsProps> = observer(({ topic }) => {
  const partitions = api.topicPartitions.get(topic.topicName);
  const paginationParams = usePaginationParams(uiState.topicSettings.partitionPageSize, partitions?.length ?? 0);

  if (partitions === undefined) return DefaultSkeleton;
  if (partitions === null) {
    return <div />; // todo: show the error (if one was reported);
  }

  const leaderLessPartitions = (api.clusterHealth?.leaderlessPartitions ?? []).find(
    ({ topicName }) => topicName === topic.topicName,
  )?.partitionIds;
  const underReplicatedPartitions = (api.clusterHealth?.underReplicatedPartitions ?? []).find(
    ({ topicName }) => topicName === topic.topicName,
  )?.partitionIds;

  let warning: JSX.Element = <></>;
  if (topic.cleanupPolicy.toLowerCase() === 'compact')
    warning = (
      <Alert status="warning" marginBottom="1em">
        <AlertIcon />
        Topic cleanupPolicy is 'compact'. Message Count is an estimate!
      </Alert>
    );

  return (
    <>
      {warning}
      <DataTable<Partition>
        pagination={paginationParams}
        onPaginationChange={onPaginationChange(paginationParams, ({ pageSize, pageIndex }) => {
          uiState.topicSettings.partitionPageSize = pageSize;
          editQuery((query) => {
            query.page = String(pageIndex);
            query.pageSize = String(pageSize);
          });
        })}
        sorting
        // @ts-ignore - we need to get rid of this enum in DataTable
        defaultPageSize={uiState.topicSettings.partitionPageSize}
        data={partitions}
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
                  {leaderLessPartitions?.includes(partition.id) && <Badge variant="error">Leaderless</Badge>}
                  {underReplicatedPartitions?.includes(partition.id) && (
                    <Badge variant="warning">Under-replicated</Badge>
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
      />
    </>
  );
});

const PartitionError: FC<{ partition: Partition }> = ({ partition }) => {
  if (!partition.partitionError && !partition.waterMarksError) {
    return null;
  }

  return (
    <Popover
      title="Partition Error"
      placement="right-start"
      size="auto"
      hideCloseButton
      content={
        <Flex maxWidth={500} whiteSpace="pre-wrap" flexDirection="column" gap={2}>
          {partition.partitionError && <Text>{partition.partitionError}</Text>}
          {partition.waterMarksError && <Text>{partition.waterMarksError}</Text>}
        </Flex>
      }
    >
      <Box>
        <MdOutlineWarningAmber color="orange" size={20} />
      </Box>
    </Popover>
  );
};
