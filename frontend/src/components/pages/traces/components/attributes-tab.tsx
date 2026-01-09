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

import { Input } from 'components/redpanda-ui/components/input';
import JSONBigIntFactory from 'json-bigint';
import { Search } from 'lucide-react';
import type { AnyValue } from 'protogen/redpanda/otel/v1/common_pb';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import type { FC } from 'react';
import { useMemo, useState } from 'react';

import { ContentPanel } from './content-panel';

const JSONBigInt = JSONBigIntFactory({ storeAsString: true });

type Props = {
  span: Span;
};

type AttributeEntry = {
  key: string;
  value: string;
};

/**
 * Recursively extracts JavaScript values from OpenTelemetry AnyValue protobuf structures.
 * OpenTelemetry uses a discriminated union (oneof) pattern where values are wrapped
 * in { case: 'typeValue', value: actualValue } objects. This function unwraps them
 * into plain JavaScript values for easier handling in the UI.
 */
const extractProtoValue = (value: AnyValue | undefined): unknown => {
  if (!value?.value) {
    return;
  }

  switch (value.value.case) {
    case 'stringValue':
    case 'boolValue':
    case 'doubleValue':
      return value.value.value;
    case 'intValue':
      // int64 values are represented as bigint in protobuf-es
      return value.value.value;
    case 'bytesValue':
      // Attempt to decode bytes as UTF-8 string, fallback to placeholder
      try {
        return new TextDecoder().decode(value.value.value);
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: useful for debugging edge cases
        console.warn('Failed to decode bytes value:', error);
        return '[binary data]';
      }
    case 'arrayValue':
      // Recursively extract array elements
      return value.value.value.values.map((item) => extractProtoValue(item));
    case 'kvlistValue':
      // Convert key-value list to plain JavaScript object
      return Object.fromEntries(value.value.value.values.map((kv) => [kv.key, extractProtoValue(kv.value)]));
    case undefined:
      return;
    default:
      // This case should never be reached due to exhaustive type checking
      return;
  }
};

const getAttributeValue = (value: AnyValue | undefined): string => {
  if (!value) {
    return '';
  }

  // Extract the actual value from protobuf structure
  const extractedValue = extractProtoValue(value);

  // Convert to string representation
  if (extractedValue === null || extractedValue === undefined) {
    return '';
  }

  if (typeof extractedValue === 'string') {
    return extractedValue;
  }

  if (typeof extractedValue === 'number' || typeof extractedValue === 'boolean') {
    return String(extractedValue);
  }

  if (typeof extractedValue === 'bigint') {
    return String(extractedValue);
  }

  // For arrays and objects, pretty-print as JSON using JSONBigInt to preserve large integers
  try {
    return JSONBigInt.stringify(extractedValue, null, 2);
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: useful for debugging edge cases
    console.warn('Failed to stringify attribute value:', error);
    return String(extractedValue);
  }
};

export const AttributesTab: FC<Props> = ({ span }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const attributes = useMemo(() => {
    const entries: AttributeEntry[] = [];

    const spanAttrs = span.attributes || [];
    for (const attr of spanAttrs) {
      if (attr.key) {
        entries.push({
          key: attr.key,
          value: getAttributeValue(attr.value),
        });
      }
    }

    return entries;
  }, [span]);

  const filteredAttributes = useMemo(() => {
    if (!searchQuery) {
      return attributes;
    }

    const query = searchQuery.trim().toLowerCase();
    return attributes.filter(
      (attr) => attr.key.toLowerCase().includes(query) || attr.value.toLowerCase().includes(query)
    );
  }, [attributes, searchQuery]);

  if (attributes.length === 0) {
    return (
      <div className="rounded bg-muted/10 p-8 text-center text-muted-foreground">No attributes found in this span</div>
    );
  }

  return (
    <div className="space-y-4 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-7 pl-7 text-xs"
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search attributes..."
          value={searchQuery}
        />
      </div>

      <div className="space-y-1.5">
        {filteredAttributes.map((attr) => (
          <ContentPanel key={attr.key}>
            <div className="space-y-0.5">
              <div className="break-all font-mono text-[10px] text-muted-foreground">{attr.key}</div>
              <div className="break-all font-mono text-[10px]">{attr.value}</div>
            </div>
          </ContentPanel>
        ))}

        {filteredAttributes.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-xs">No attributes match your search</div>
        )}
      </div>
    </div>
  );
};
