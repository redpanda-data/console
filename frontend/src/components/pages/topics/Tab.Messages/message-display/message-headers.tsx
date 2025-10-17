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

import { Box, DataTable } from '@redpanda-data/ui';
import { observer } from 'mobx-react';

import type { Payload, TopicMessage } from '../../../../../state/rest-interfaces';
import { Ellipsis, toSafeString } from '../../../../../utils/tsx-utils';
import { KowlJsonView } from '../../../../misc/kowl-json-view';
import { renderEmptyIcon } from '../common/empty-icon';

export const MessageHeaders = observer((props: { msg: TopicMessage }) => {
  return (
    <div className="messageHeaders">
      <div>
        <DataTable<{ key: string; value: Payload }>
          columns={[
            {
              size: 200,
              header: 'Key',
              accessorKey: 'key',
              cell: ({
                row: {
                  original: { key: headerKey },
                },
              }) => (
                <span className="cellDiv" style={{ width: 'auto' }}>
                  {headerKey ? <Ellipsis>{toSafeString(headerKey)}</Ellipsis> : renderEmptyIcon('Empty Key')}
                </span>
              ),
            },
            {
              size: Number.POSITIVE_INFINITY,
              header: 'Value',
              accessorKey: 'value',
              cell: ({
                row: {
                  original: { value: headerValue },
                },
              }) => {
                if (typeof headerValue.payload === 'undefined') {
                  return renderEmptyIcon('"undefined"');
                }
                if (headerValue.payload === null) {
                  return renderEmptyIcon('"null"');
                }
                if (typeof headerValue.payload === 'number') {
                  return <span>{String(headerValue.payload)}</span>;
                }

                if (typeof headerValue.payload === 'string') {
                  return <span className="cellDiv">{headerValue.payload}</span>;
                }

                // object
                return <span className="cellDiv">{toSafeString(headerValue.payload)}</span>;
              },
            },
            {
              size: 120,
              header: 'Encoding',
              accessorKey: 'value',
              cell: ({
                row: {
                  original: { value: payload },
                },
              }) => <span className="nowrap">{payload.encoding}</span>,
            },
          ]}
          data={props.msg.headers}
          pagination
          sorting
          subComponent={({ row: { original: header } }) => (
            <Box px={10} py={6}>
              {typeof header.value?.payload !== 'object' ? (
                <div className="codeBox" style={{ margin: '0', width: '100%' }}>
                  {toSafeString(header.value.payload)}
                </div>
              ) : (
                <KowlJsonView srcObj={header.value.payload as object} style={{ margin: '2em 0' }} />
              )}
            </Box>
          )}
        />
      </div>
    </div>
  );
});
