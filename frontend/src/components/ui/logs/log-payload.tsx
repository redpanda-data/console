/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Badge } from 'components/redpanda-ui/components/badge';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { cn } from 'components/redpanda-ui/lib/utils';
import { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import type { KafkaRecordPayload } from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { memo, useMemo } from 'react';
import { decodePayloadToString } from 'react-query/api/messages';

type LogPayloadProps = {
  payload: KafkaRecordPayload | undefined;
  label?: string;
  className?: string;
  maxLength?: number;
  showCopy?: boolean;
};

const ENCODING_LABELS: Partial<Record<PayloadEncoding, string>> = {
  [PayloadEncoding.JSON]: 'JSON',
  [PayloadEncoding.TEXT]: 'Text',
  [PayloadEncoding.BINARY]: 'Binary',
  [PayloadEncoding.AVRO]: 'Avro',
  [PayloadEncoding.PROTOBUF]: 'Protobuf',
  [PayloadEncoding.MESSAGE_PACK]: 'MsgPack',
  [PayloadEncoding.XML]: 'XML',
  [PayloadEncoding.UTF8]: 'UTF-8',
  [PayloadEncoding.SMILE]: 'Smile',
  [PayloadEncoding.UINT]: 'UInt',
  [PayloadEncoding.UNSPECIFIED]: 'Auto',
};

/**
 * Component to display a Kafka record payload with encoding info.
 */
export const LogPayload = memo(({ payload, label, className, maxLength = 500, showCopy = true }: LogPayloadProps) => {
  const displayValue = useMemo(() => {
    if (!payload) {
      return null;
    }

    if (payload.isPayloadTooLarge) {
      return `[Payload too large: ${payload.payloadSize} bytes]`;
    }

    const decoded = decodePayloadToString(payload.normalizedPayload);
    if (!decoded) {
      return '[Empty]';
    }

    // Try to pretty-print JSON
    try {
      const parsed = JSON.parse(decoded);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // Not JSON, return as-is
      return decoded;
    }
  }, [payload]);

  const truncatedValue = useMemo(() => {
    if (!displayValue) {
      return null;
    }
    if (displayValue.length <= maxLength) {
      return displayValue;
    }
    return `${displayValue.slice(0, maxLength)}...`;
  }, [displayValue, maxLength]);

  const encodingLabel = payload ? ENCODING_LABELS[payload.encoding] || 'Unknown' : null;

  if (!payload) {
    return (
      <div className={cn('text-muted-foreground text-sm', className)}>
        {label ? <span className="font-medium">{label}: </span> : null}
        <span className="italic">null</span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {(label || encodingLabel) && (
        <div className="flex items-center gap-2">
          {label && <span className="font-medium text-muted-foreground text-xs">{label}</span>}
          {encodingLabel && (
            <Badge size="sm" variant="simple">
              {encodingLabel}
            </Badge>
          )}
          {payload.schemaId !== undefined && (
            <Badge size="sm" variant="simple">
              Schema #{payload.schemaId}
            </Badge>
          )}
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 font-mono text-xs">
          <code>{truncatedValue}</code>
        </pre>
        {showCopy && displayValue && (
          <div className="absolute top-1 right-1">
            <CopyButton className="h-6 w-6" value={displayValue} />
          </div>
        )}
      </div>
    </div>
  );
});

LogPayload.displayName = 'LogPayload';
