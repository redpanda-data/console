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
import { ScrollArea } from 'components/redpanda-ui/components/scroll-area';
import { cn } from 'components/redpanda-ui/lib/utils';
import type { Trace } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { FC } from 'react';
import { useMemo } from 'react';

import { extractConversationHistory } from '../utils/llm-extractors';

interface Props {
  trace: Trace;
}

export const ConversationTab: FC<Props> = ({ trace }) => {
  const messages = useMemo(() => extractConversationHistory(trace), [trace]);

  if (messages.length === 0) {
    return (
      <div className="rounded bg-muted/10 p-8 text-center text-muted-foreground">
        No conversation history found in this trace
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-4 pr-4">
        {messages.map((message, idx) => {
          const isUser = message.role === 'user';
          const isAssistant = message.role === 'assistant';
          const isSystem = message.role === 'system';

          let badgeVariant: 'default' | 'secondary' | 'outline' = 'outline';
          if (isUser) {
            badgeVariant = 'default';
          } else if (isAssistant) {
            badgeVariant = 'secondary';
          }

          return (
            <div
              className={cn(
                'flex gap-3 rounded border p-4',
                isUser && 'bg-primary/5',
                isAssistant && 'bg-secondary/20',
                isSystem && 'bg-muted/30'
              )}
              key={idx}
            >
              <div className="flex-shrink-0">
                <Badge className="text-xs" variant={badgeVariant}>
                  {message.role}
                </Badge>
              </div>
              <div className="min-w-0 flex-1">
                <pre className="whitespace-pre-wrap break-words font-sans text-sm">{message.content}</pre>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
};
