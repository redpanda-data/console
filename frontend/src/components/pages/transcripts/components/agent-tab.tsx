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

import { Badge } from 'components/redpanda-ui/components/badge';
import { Text } from 'components/redpanda-ui/components/typography';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import type { FC } from 'react';
import { useMemo } from 'react';

import { ContentPanel } from './content-panel';
import { getAttributeFromSpan } from '../utils/attribute-helpers';

type Props = {
  span: Span;
};

export const AgentTab: FC<Props> = ({ span }) => {
  const agentData = useMemo(() => {
    const agentName = String(getAttributeFromSpan(span, 'gen_ai.agent.name') || '');
    const agentId = String(getAttributeFromSpan(span, 'gen_ai.agent.id') || '');
    const agentDescription = String(getAttributeFromSpan(span, 'gen_ai.agent.description') || '');
    const agentInput = String(
      getAttributeFromSpan(span, 'gen_ai.prompt') || getAttributeFromSpan(span, 'gen_ai.input.messages') || ''
    );
    const agentOutput = String(
      getAttributeFromSpan(span, 'gen_ai.completion') || getAttributeFromSpan(span, 'gen_ai.output.messages') || ''
    );
    const model = String(getAttributeFromSpan(span, 'gen_ai.request.model') || '');
    const inputTokens = Number(getAttributeFromSpan(span, 'gen_ai.usage.input_tokens') || 0);
    const outputTokens = Number(getAttributeFromSpan(span, 'gen_ai.usage.output_tokens') || 0);
    const conversationId = String(getAttributeFromSpan(span, 'gen_ai.conversation.id') || '');

    return {
      agentName,
      agentId,
      agentDescription,
      agentInput,
      agentOutput,
      model,
      inputTokens,
      outputTokens,
      conversationId,
    };
  }, [span]);

  const hasAgentData =
    agentData.agentName ||
    agentData.agentId ||
    agentData.agentDescription ||
    agentData.agentInput ||
    agentData.agentOutput ||
    agentData.model ||
    agentData.inputTokens > 0 ||
    agentData.conversationId;

  if (!hasAgentData) {
    return (
      <div className="rounded bg-muted/10 p-8 text-center text-muted-foreground">No agent data found in this span</div>
    );
  }

  const totalTokens = agentData.inputTokens + agentData.outputTokens;

  return (
    <div className="space-y-4 p-3">
      {/* Agent Name */}
      {!!agentData.agentName && (
        <div className="space-y-1.5">
          <Text as="span" variant="label">
            AGENT NAME
          </Text>
          <ContentPanel>
            <p className="font-medium text-sm">{agentData.agentName}</p>
          </ContentPanel>
        </div>
      )}

      {/* Agent Description */}
      {!!agentData.agentDescription && (
        <div className="space-y-1.5">
          <Text as="span" variant="label">
            DESCRIPTION
          </Text>
          <ContentPanel>
            <p className="whitespace-pre-wrap break-words text-[10px] text-muted-foreground leading-relaxed">
              {agentData.agentDescription}
            </p>
          </ContentPanel>
        </div>
      )}

      {/* Agent Input */}
      {!!agentData.agentInput && (
        <div className="space-y-1.5">
          <Text as="span" variant="label">
            INPUT
          </Text>
          <ContentPanel>
            <p className="whitespace-pre-wrap break-words text-[10px] text-muted-foreground leading-relaxed">
              {agentData.agentInput}
            </p>
          </ContentPanel>
        </div>
      )}

      {/* Agent Output */}
      {!!agentData.agentOutput && (
        <div className="space-y-1.5">
          <Text as="span" variant="label">
            OUTPUT
          </Text>
          <ContentPanel>
            <p className="whitespace-pre-wrap break-words text-[10px] text-muted-foreground leading-relaxed">
              {agentData.agentOutput}
            </p>
          </ContentPanel>
        </div>
      )}

      {/* Agent ID */}
      {!!agentData.agentId && (
        <div className="space-y-1.5">
          <Text as="span" variant="label">
            AGENT ID
          </Text>
          <ContentPanel>
            <p className="font-mono text-[10px] text-muted-foreground">{agentData.agentId}</p>
          </ContentPanel>
        </div>
      )}

      {/* Model */}
      {!!agentData.model && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Model:</span>
          <Badge className="text-xs" variant="secondary">
            {agentData.model}
          </Badge>
        </div>
      )}

      {/* Token Usage Summary */}
      {agentData.inputTokens > 0 && (
        <div className="space-y-1.5">
          <Text as="span" variant="label">
            TOKEN USAGE
          </Text>
          <ContentPanel className="bg-muted/20">
            <div className="flex items-center justify-between text-xs">
              <div className="space-x-3">
                <span className="text-muted-foreground">
                  Input:{' '}
                  <span className="font-medium font-mono text-foreground">
                    {agentData.inputTokens.toLocaleString()}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Output:{' '}
                  <span className="font-medium font-mono text-foreground">
                    {agentData.outputTokens.toLocaleString()}
                  </span>
                </span>
              </div>
              <span className="font-medium text-muted-foreground">{totalTokens.toLocaleString()} total</span>
            </div>
          </ContentPanel>
        </div>
      )}

      {/* Conversation ID */}
      {!!agentData.conversationId && (
        <div className="space-y-1.5">
          <Text as="span" variant="label">
            CONVERSATION ID
          </Text>
          <ContentPanel>
            <p className="font-mono text-[10px] text-muted-foreground">{agentData.conversationId}</p>
          </ContentPanel>
        </div>
      )}
    </div>
  );
};
