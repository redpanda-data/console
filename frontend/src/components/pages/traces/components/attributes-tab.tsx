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
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import type { FC } from 'react';
import { useMemo, useState } from 'react';

const JSONBigInt = JSONBigIntFactory({ storeAsString: true });

type Props = {
  span: Span;
};

type AttributeEntry = {
  key: string;
  value: string;
};

// Recursively extract the actual value from protobuf-es structure
const extractProtoValue = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle protobuf-es structure with oneof value field
  const protoValue = value as {
    value?: {
      case?: string;
      value?: unknown;
    };
  };

  if (protoValue.value?.case && protoValue.value?.value !== undefined) {
    switch (protoValue.value.case) {
      case 'stringValue':
      case 'intValue':
      case 'doubleValue':
      case 'boolValue':
        return protoValue.value.value;
      case 'bytesValue':
        // For bytes, try to decode as string
        try {
          if (protoValue.value.value instanceof Uint8Array) {
            return new TextDecoder().decode(protoValue.value.value);
          }
          return protoValue.value.value;
        } catch {
          return '[binary data]';
        }
      case 'arrayValue': {
        // Recursively extract array values
        const arrayData = protoValue.value.value as { values?: unknown[] };
        if (arrayData?.values && Array.isArray(arrayData.values)) {
          return arrayData.values.map((item) => extractProtoValue(item));
        }
        return protoValue.value.value;
      }
      case 'kvlistValue': {
        // Recursively extract key-value list
        const kvData = protoValue.value.value as { values?: Array<{ key?: string; value?: unknown }> };
        if (kvData?.values && Array.isArray(kvData.values)) {
          const obj: Record<string, unknown> = {};
          for (const kv of kvData.values) {
            if (kv.key) {
              obj[kv.key] = extractProtoValue(kv.value);
            }
          }
          return obj;
        }
        return protoValue.value.value;
      }
      default:
        return protoValue.value.value;
    }
  }

  return value;
};

const getAttributeValue = (value: unknown): string => {
  if (value === null || value === undefined) {
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
  } catch {
    return String(extractedValue);
  }
};

export const AttributesTab: FC<Props> = ({ span }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const attributes = useMemo(() => {
    const entries: AttributeEntry[] = [];

    const spanAttrs = span.attributes || [];
    for (const attr of spanAttrs) {
      const keyValue = attr as { key: string; value?: unknown };
      if (keyValue.key) {
        entries.push({
          key: keyValue.key,
          value: getAttributeValue(keyValue.value),
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
    <div className="space-y-3 p-3">
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
          <div className="rounded border bg-muted/30 p-2" key={attr.key}>
            <div className="space-y-0.5">
              <div className="break-all font-mono text-[10px] text-muted-foreground">{attr.key}</div>
              <div className="break-all font-mono text-[11px]">{attr.value}</div>
            </div>
          </div>
        ))}

        {filteredAttributes.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-xs">No attributes match your search</div>
        )}
      </div>
    </div>
  );
};
