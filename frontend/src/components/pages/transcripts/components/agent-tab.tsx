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
    <div className="space-y-4 p-4">
      {/* Agent Name */}
      {!!agentData.agentName && (
        <div className="space-y-1.5">
          <Text as="div" className="uppercase tracking-wide" variant="label">
            AGENT NAME
          </Text>
          <ContentPanel>
            <Text className="font-medium" variant="small">
              {agentData.agentName}
            </Text>
          </ContentPanel>
        </div>
      )}

      {/* Agent Description */}
      {!!agentData.agentDescription && (
        <div className="space-y-1.5">
          <Text as="div" className="uppercase tracking-wide" variant="label">
            DESCRIPTION
          </Text>
          <ContentPanel>
            <Text className="whitespace-pre-wrap break-words leading-relaxed" variant="muted">
              {agentData.agentDescription}
            </Text>
          </ContentPanel>
        </div>
      )}

      {/* Agent Input */}
      {!!agentData.agentInput && (
        <div className="space-y-1.5">
          <Text as="div" className="uppercase tracking-wide" variant="label">
            INPUT
          </Text>
          <ContentPanel>
            <Text className="whitespace-pre-wrap break-words leading-relaxed" variant="muted">
              {agentData.agentInput}
            </Text>
          </ContentPanel>
        </div>
      )}

      {/* Agent Output */}
      {!!agentData.agentOutput && (
        <div className="space-y-1.5">
          <Text as="div" className="uppercase tracking-wide" variant="label">
            OUTPUT
          </Text>
          <ContentPanel>
            <Text className="whitespace-pre-wrap break-words leading-relaxed" variant="muted">
              {agentData.agentOutput}
            </Text>
          </ContentPanel>
        </div>
      )}

      {/* Agent ID */}
      {!!agentData.agentId && (
        <div className="space-y-1.5">
          <Text as="div" className="uppercase tracking-wide" variant="label">
            AGENT ID
          </Text>
          <ContentPanel>
            <Text className="font-mono" variant="muted">
              {agentData.agentId}
            </Text>
          </ContentPanel>
        </div>
      )}

      {/* Model */}
      {!!agentData.model && (
        <div className="space-y-1.5">
          <Text as="div" className="uppercase tracking-wide" variant="label">
            MODEL
          </Text>
          <div>
            <Badge variant="secondary">
              <Text variant="small">{agentData.model}</Text>
            </Badge>
          </div>
        </div>
      )}

      {/* Token Usage Summary */}
      {agentData.inputTokens > 0 && (
        <div className="space-y-1.5">
          <Text as="div" className="uppercase tracking-wide" variant="label">
            TOKEN USAGE
          </Text>
          <ContentPanel className="bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="space-x-3">
                <Text variant="muted">
                  Input:{' '}
                  <span className="font-medium font-mono text-foreground">
                    {agentData.inputTokens.toLocaleString()}
                  </span>
                </Text>
                <Text variant="muted">
                  Output:{' '}
                  <span className="font-medium font-mono text-foreground">
                    {agentData.outputTokens.toLocaleString()}
                  </span>
                </Text>
              </div>
              <Text className="font-medium" variant="muted">
                {totalTokens.toLocaleString()} total
              </Text>
            </div>
          </ContentPanel>
        </div>
      )}

      {/* Conversation ID */}
      {!!agentData.conversationId && (
        <div className="space-y-1.5">
          <Text as="div" className="uppercase tracking-wide" variant="label">
            CONVERSATION ID
          </Text>
          <ContentPanel>
            <Text className="font-mono" variant="muted">
              {agentData.conversationId}
            </Text>
          </ContentPanel>
        </div>
      )}
    </div>
  );
};
