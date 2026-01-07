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

import { toJson } from '@bufbuild/protobuf';
import { Button } from 'components/redpanda-ui/components/button';
import { Check, Copy } from 'lucide-react';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import { SpanSchema } from 'protogen/redpanda/otel/v1/trace_pb';
import type { FC } from 'react';
import { useState } from 'react';

interface Props {
  span: Span;
}

export const RawJSONTab: FC<Props> = ({ span }) => {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(toJson(SpanSchema, span), null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex justify-end">
        <Button className="gap-2" onClick={handleCopy} size="sm" variant="outline">
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy JSON
            </>
          )}
        </Button>
      </div>

      <div className="w-full overflow-auto rounded border bg-muted/20">
        <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs">
          <code>{jsonString}</code>
        </pre>
      </div>
    </div>
  );
};
