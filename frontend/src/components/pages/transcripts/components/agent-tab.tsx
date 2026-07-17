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
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
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
          <div className="text-label uppercase tracking-wide">AGENT NAME</div>
          <ContentPanel>
            <div className="font-medium text-body text-muted-foreground">{agentData.agentName}</div>
          </ContentPanel>
        </div>
      )}

      {/* Agent Description */}
      {!!agentData.agentDescription && (
        <div className="space-y-1.5">
          <div className="text-label uppercase tracking-wide">DESCRIPTION</div>
          <ContentPanel>
            <div className="whitespace-pre-wrap break-words text-body text-muted-foreground leading-relaxed">
              {agentData.agentDescription}
            </div>
          </ContentPanel>
        </div>
      )}

      {/* Agent Input */}
      {!!agentData.agentInput && (
        <div className="space-y-1.5">
          <div className="text-label uppercase tracking-wide">INPUT</div>
          <ContentPanel>
            <div className="whitespace-pre-wrap break-words font-mono text-body text-muted-foreground leading-relaxed">
              {agentData.agentInput}
            </div>
          </ContentPanel>
        </div>
      )}

      {/* Agent Output */}
      {!!agentData.agentOutput && (
        <div className="space-y-1.5">
          <div className="text-label uppercase tracking-wide">OUTPUT</div>
          <ContentPanel>
            <div className="whitespace-pre-wrap break-words font-mono text-body text-muted-foreground leading-relaxed">
              {agentData.agentOutput}
            </div>
          </ContentPanel>
        </div>
      )}

      {/* Agent ID */}
      {!!agentData.agentId && (
        <div className="space-y-1.5">
          <div className="text-label uppercase tracking-wide">AGENT ID</div>
          <ContentPanel>
            <div className="whitespace-pre-wrap break-words font-mono text-body text-muted-foreground leading-relaxed">
              {agentData.agentId}
            </div>
          </ContentPanel>
        </div>
      )}

      {/* Model */}
      {!!agentData.model && (
        <div className="space-y-1.5">
          <div className="text-label uppercase tracking-wide">MODEL</div>
          <div>
            <Badge variant="neutral-inverted">
              <div className="text-body-sm">{agentData.model}</div>
            </Badge>
          </div>
        </div>
      )}

      {/* Token Usage Summary */}
      {agentData.inputTokens > 0 && (
        <div className="space-y-1.5">
          <div className="text-label uppercase tracking-wide">TOKEN USAGE</div>
          <ContentPanel className="bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="space-x-3">
                <div className="text-body text-muted-foreground">
                  Input:{' '}
                  <span className="font-medium font-mono text-foreground">
                    {agentData.inputTokens.toLocaleString()}
                  </span>
                </div>
                <div className="text-body text-muted-foreground">
                  Output:{' '}
                  <span className="font-medium font-mono text-foreground">
                    {agentData.outputTokens.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="font-medium text-body text-muted-foreground">{totalTokens.toLocaleString()} total</div>
            </div>
          </ContentPanel>
        </div>
      )}

      {/* Conversation ID */}
      {!!agentData.conversationId && (
        <div className="space-y-1.5">
          <div className="text-label uppercase tracking-wide">CONVERSATION ID</div>
          <ContentPanel className="flex items-center justify-between">
            <div className="whitespace-pre-wrap break-words font-mono text-body text-muted-foreground leading-relaxed">
              {agentData.conversationId}
            </div>
            <CopyButton content={agentData.conversationId} size="sm" variant="ghost" />
          </ContentPanel>
        </div>
      )}
    </div>
  );
};
