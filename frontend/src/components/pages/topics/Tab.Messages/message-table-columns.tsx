/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { MoreHorizontalIcon } from 'components/icons';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import type { DataTableColumnDef } from 'components/redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import { MessageKeyPreview } from './message-display/message-key-preview';
import { MessagePreview } from './message-display/message-preview';
import type { PreviewDisplayMode } from './message-display/preview-tags-text';
import { PayloadEncoding } from '../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import type { Payload, TopicMessage } from '../../../../state/rest-interfaces';
import type { ColumnList, DataColumnKey, PreviewTagV2, TimestampDisplayFormat } from '../../../../state/ui';
import { navigatorClipboardErrorHandler, numberToThousandsString, TimestampDisplay } from '../../../../utils/tsx-utils';
import { prettyBytes } from '../../../../utils/utils';
import { PAYLOAD_ENCODING_LABELS } from '../messages/constants';

// Define the column order as a constant
const COLUMN_ORDER: DataColumnKey[] = ['timestamp', 'partitionID', 'offset', 'key', 'value', 'keySize', 'valueSize'];

// A copied payload drops its normalized form, and its raw bytes become a plain array for JSON.
function preparePayloadForCopy(payload: Payload) {
  payload.normalizedPayload = undefined;
  if (payload.rawBytes) {
    payload.rawBytes = Array.from(payload.rawBytes) as Uint8Array & number[];
  }
}

function getMessageAsString(value: string | TopicMessage): string {
  if (typeof value === 'string') {
    return value;
  }

  const obj = {
    ...value,
    keyBinHexPreview: undefined,
    valueBinHexPreview: undefined,
    keyJson: undefined,
    valueJson: undefined,
  } as Partial<TopicMessage>;
  if (obj.key) {
    preparePayloadForCopy(obj.key);
  }
  if (obj.value) {
    preparePayloadForCopy(obj.value);
  }

  return JSON.stringify(obj, null, 4);
}

function getPayloadAsString(value: string | Uint8Array | object): string {
  if (value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Uint8Array) {
    return JSON.stringify(Array.from(value), null, 4);
  }

  return JSON.stringify(value, null, 4);
}

export function onCopyValue(original: TopicMessage) {
  navigator.clipboard
    .writeText(getPayloadAsString((original.value.payload ?? original.value.rawBytes) as string | Uint8Array | object))
    .then(() => {
      toast.success('Value copied to clipboard');
    })
    .catch(navigatorClipboardErrorHandler);
}

export function onCopyKey(original: TopicMessage) {
  navigator.clipboard
    .writeText(getPayloadAsString((original.key.payload ?? original.key.rawBytes) as string | Uint8Array | object))
    .then(() => {
      toast.success('Key copied to clipboard');
    })
    .catch(navigatorClipboardErrorHandler);
}

function isDeserializerActive(deserializer: PayloadEncoding): boolean {
  return deserializer !== null && deserializer !== undefined && deserializer !== PayloadEncoding.UNSPECIFIED;
}

export type MessageColumnOptions = {
  continuousPaginationEnabled: boolean;
  tsFormat: TimestampDisplayFormat;
  keyDeserializer: PayloadEncoding;
  valueDeserializer: PayloadEncoding;
  hasKeyTags: boolean;
  previewDisplayMode: PreviewDisplayMode;
  activePreviewTags: PreviewTagV2[];
  isCompactTopic: boolean;
  previewColumnFields: ColumnList[];
  onShowDeserializers: () => void;
  onSaveMessage: (message: TopicMessage) => void;
};

function buildDataColumns(options: MessageColumnOptions): Record<DataColumnKey, DataTableColumnDef<TopicMessage>> {
  const { continuousPaginationEnabled, tsFormat, keyDeserializer, valueDeserializer, onShowDeserializers } = options;
  return {
    offset: {
      header: 'Offset',
      accessorKey: 'offset',
      cell: ({
        row: {
          original: { offset },
        },
      }) => (offset < 0 ? <span className="text-muted-foreground">Loading...</span> : numberToThousandsString(offset)),
    },
    partitionID: {
      header: 'Partition',
      accessorKey: 'partitionID',
    },
    timestamp: {
      header: 'Timestamp',
      accessorKey: 'timestamp',
      enableSorting: !continuousPaginationEnabled, // Disable sorting in continuous pagination mode
      cell: ({
        row: {
          original: { timestamp },
        },
      }) => <TimestampDisplay format={tsFormat} unixEpochMillisecond={timestamp} />,
    },
    key: {
      header: () =>
        isDeserializerActive(keyDeserializer) ? (
          <div className="inline-flex items-center gap-2">
            Key{' '}
            <button
              onClick={(e) => {
                onShowDeserializers();
                e.stopPropagation(); // don't sort
              }}
              type="button"
            >
              <Badge>Deserializer: {PAYLOAD_ENCODING_LABELS[keyDeserializer]}</Badge>
            </button>
          </div>
        ) : (
          'Key'
        ),
      size: options.hasKeyTags ? 300 : 1,
      accessorKey: 'key',
      enableSorting: !continuousPaginationEnabled, // Disable sorting in continuous pagination mode
      cell: ({ row: { original } }) => (
        <MessageKeyPreview
          msg={original}
          previewDisplayMode={options.previewDisplayMode}
          previewFields={() => options.activePreviewTags}
        />
      ),
    },
    value: {
      header: () =>
        isDeserializerActive(valueDeserializer) ? (
          <div className="inline-flex items-center gap-2">
            Value{' '}
            <button
              onClick={(e) => {
                onShowDeserializers();
                e.stopPropagation(); // don't sort
              }}
              type="button"
            >
              <Badge>Deserializer: {PAYLOAD_ENCODING_LABELS[valueDeserializer]}</Badge>
            </button>
          </div>
        ) : (
          'Value'
        ),
      accessorKey: 'value',
      enableSorting: !continuousPaginationEnabled, // Disable sorting in continuous pagination mode
      cell: ({ row: { original } }) => (
        <MessagePreview
          isCompactTopic={options.isCompactTopic}
          msg={original}
          previewDisplayMode={options.previewDisplayMode}
          previewFields={() => options.activePreviewTags}
        />
      ),
    },
    keySize: {
      header: 'Key Size',
      accessorKey: 'key.size',
      cell: ({
        row: {
          original: {
            key: { size },
          },
        },
      }) => <span>{prettyBytes(size)}</span>,
    },
    valueSize: {
      header: 'Value Size',
      accessorKey: 'value.size',
      cell: ({
        row: {
          original: {
            value: { size },
          },
        },
      }) => <span>{prettyBytes(size)}</span>,
    },
  };
}

// The columns the user picked, in the fixed column order; without a pick, the default ones.
function selectColumnKeys(previewColumnFields: ColumnList[]): DataColumnKey[] {
  if (previewColumnFields.length === 0) {
    return ['timestamp', 'key', 'value'];
  }
  // let's be defensive and remove any duplicates before showing in the table
  const selectedColumns = new Set(previewColumnFields.map((field) => field.dataIndex));
  return COLUMN_ORDER.filter((column) => selectedColumns.has(column));
}

function buildActionColumn(onSaveMessage: (message: TopicMessage) => void): DataTableColumnDef<TopicMessage> {
  return {
    id: 'action',
    size: 0,
    cell: ({ row: { original } }) => (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button className="iconButton" size="icon" variant="ghost">
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem
            onClick={() => {
              navigator.clipboard
                .writeText(getMessageAsString(original))
                .then(() => {
                  toast.success('Message copied to clipboard');
                })
                .catch(navigatorClipboardErrorHandler);
            }}
          >
            Copy Message
          </DropdownMenuItem>
          <DropdownMenuItem disabled={original.key.isPayloadNull} onClick={() => onCopyKey(original)}>
            Copy Key
          </DropdownMenuItem>
          <DropdownMenuItem disabled={original.value.isPayloadNull} onClick={() => onCopyValue(original)}>
            Copy Value
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              navigator.clipboard
                .writeText(original.timestamp.toString())
                .then(() => {
                  toast.success('Epoch Timestamp copied to clipboard');
                })
                .catch(navigatorClipboardErrorHandler);
            }}
          >
            Copy Epoch Timestamp
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              onSaveMessage(original);
            }}
          >
            Save to File
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  };
}

/** The message table's columns: the visible data columns, the last one taking the free width, then actions. */
export function buildMessageColumns(options: MessageColumnOptions): DataTableColumnDef<TopicMessage>[] {
  const dataTableColumns = buildDataColumns(options);
  const newColumns = selectColumnKeys(options.previewColumnFields).map((key) => dataTableColumns[key]);

  const lastColumn = newColumns.at(-1);
  if (lastColumn) {
    lastColumn.size = Number.POSITIVE_INFINITY;
  }

  return [...newColumns, buildActionColumn(options.onSaveMessage)];
}

export const expanderColumn: DataTableColumnDef<TopicMessage> = {
  id: 'expander',
  size: 40,
  enableSorting: false,
  cell: ({ row }) =>
    row.getCanExpand() ? (
      <Button
        aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
        onClick={row.getToggleExpandedHandler()}
        size="icon-xs"
        variant="ghost"
      >
        {row.getIsExpanded() ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </Button>
    ) : null,
};
