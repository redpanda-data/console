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

import { FC } from 'react';
import React from 'react';
import { Partition, Topic, } from '../../../state/restInterfaces';
import { observer } from 'mobx-react';
import { api, } from '../../../state/backendApi';
import '../../../utils/arrayExtensions';
import { numberToThousandsString, DefaultSkeleton, InfoText, ZeroSizeWrapper } from '../../../utils/tsxUtils';
import { BrokerList } from '../../misc/BrokerList';
import { WarningTwoTone } from '@ant-design/icons';
import { Alert, AlertIcon, DataTable, Popover } from '@redpanda-data/ui';
import usePaginationParams from '../../../hooks/usePaginationParams';
import { onPaginationChange } from '../../../utils/pagination';
import { editQuery } from '../../../utils/queryHelper';
import { uiState } from '../../../state/uiState';

type TopicPartitionsProps = {
    topic: Topic;
};

export const TopicPartitions: FC<TopicPartitionsProps> = observer(({topic}) => {
    let partitions = api.topicPartitions.get(topic.topicName);
    if (partitions === undefined) return DefaultSkeleton;
    if (partitions === null) partitions = []; // todo: show the error (if one was reported);
    let warning: JSX.Element = <></>;
    if (topic.cleanupPolicy.toLowerCase() === 'compact')
        warning = (
            <Alert status="warning" marginBottom="1em">
                <AlertIcon/>
                Topic cleanupPolicy is 'compact'. Message Count is an estimate!
            </Alert>
        );

    const paginationParams = usePaginationParams(uiState.topicSettings.partitionPageSize, partitions.length);

    return (
        <>
            {warning}
            <DataTable<Partition>
                pagination={paginationParams}
                onPaginationChange={onPaginationChange(paginationParams, ({pageSize, pageIndex}) => {
                    uiState.topicSettings.partitionPageSize = pageSize;
                    editQuery(query => {
                        query['page'] = String(pageIndex);
                        query['pageSize'] = String(pageSize);
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
                        cell: ({row: {original: partition}}) =>
                            partition.hasErrors ? (
                                <span
                                    style={{display: 'inline-flex', width: '100%'}}
                                >
                  <span>{partition.id}</span>
                  <span
                      style={{
                          marginLeft: 'auto',
                          marginRight: '2px',
                          display: 'inline-block',
                      }}
                  >
                    {renderPartitionError(partition)}
                  </span>
                </span>
                            ) : (
                                partition.id
                            ),
                    },
                    {
                        id: 'waterMarkLow',
                        header: () => (
                            <InfoText tooltip="Low Water Mark" tooltipOverText>
                                Low
                            </InfoText>
                        ),
                        accessorKey: 'waterMarkLow',
                        cell: ({row: {original: partition}}) =>
                            !partition.hasErrors && numberToThousandsString(partition.waterMarkLow),
                    },
                    {
                        id: 'waterMarkHigh',
                        header: () => (
                            <InfoText tooltip="High Water Mark" tooltipOverText>
                                High
                            </InfoText>
                        ),
                        accessorKey: 'waterMarkHigh',
                        cell: ({row: {original: partition}}) =>
                            !partition.hasErrors && numberToThousandsString(partition.waterMarkHigh),
                    },
                    {
                        header: 'Messages',
                        cell: ({row: {original: partition}}) =>
                            !partition.hasErrors &&
                            numberToThousandsString(partition.waterMarkHigh - partition.waterMarkLow),
                    },
                    {
                        header: 'Brokers',
                        cell: ({row: {original: partition}}) => (
                            <BrokerList partition={partition}/>
                        ),
                    },
                ]}
            />
        </>
    );
});

function renderPartitionError(partition: Partition) {
    const txt = [partition.partitionError, partition.waterMarksError].join('\n\n');

    return <Popover
        title="Partition Error"
        placement="right-start"
        size="auto"
        hideCloseButton
        content={<div style={{maxWidth: '500px', whiteSpace: 'pre-wrap'}}>
            {txt}
        </div>
        }
    >
        <span>
            <ZeroSizeWrapper justifyContent="center" alignItems="center" width="20px" height="18px">
                <span style={{fontSize: '19px'}}>
                    <WarningTwoTone twoToneColor="orange"/>
                </span>
            </ZeroSizeWrapper>
        </span>
    </Popover>;

}
