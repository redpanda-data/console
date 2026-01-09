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

import { toJson } from '@bufbuild/protobuf';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import { SpanSchema } from 'protogen/redpanda/otel/v1/trace_pb';
import type { FC } from 'react';
import { useMemo } from 'react';

import { ContentPanel } from './content-panel';

type Props = {
  span: Span;
};

export const RawJSONTab: FC<Props> = ({ span }) => {
  const jsonString = useMemo(() => {
    try {
      const jsonObj = toJson(SpanSchema, span);
      // Verify the JSON is valid before stringifying
      if (jsonObj === null || jsonObj === undefined) {
        return 'null';
      }
      return JSON.stringify(jsonObj, null, 2);
    } catch {
      return JSON.stringify({ error: 'Failed to serialize span data' }, null, 2);
    }
  }, [span]);

  return (
    <div className="space-y-4 p-3">
      <div className="flex justify-end">
        <CopyButton content={jsonString} size="sm" variant="outline">
          Copy JSON
        </CopyButton>
      </div>

      <ContentPanel className="w-full bg-muted/20" padding="md">
        <pre className="whitespace-pre-wrap break-words font-mono text-[10px]">
          <code>{jsonString}</code>
        </pre>
      </ContentPanel>
    </div>
  );
};
