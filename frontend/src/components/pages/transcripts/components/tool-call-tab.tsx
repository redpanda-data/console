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

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { Text } from 'components/redpanda-ui/components/typography';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import type { FC } from 'react';
import { useMemo } from 'react';
import { tryParseJson } from 'utils/json-utils';

import { ContentPanel } from './content-panel';
import { ToolEventCard } from './tool-event-card';
import { formatJsonContent, truncateContent } from '../utils/transcript-formatters';

type Props = {
  span: Span;
};

const getAttributeValue = (span: Span, key: string): string => {
  const attr = span.attributes?.find((a) => a.key === key);
  if (!attr?.value?.value) {
    return '';
  }

  const valueWrapper = attr.value.value;
  if (!valueWrapper.case || valueWrapper.value === undefined) {
    return '';
  }

  switch (valueWrapper.case) {
    case 'stringValue':
      return typeof valueWrapper.value === 'string' ? valueWrapper.value : '';
    case 'intValue': {
      const numValue = Number(valueWrapper.value);
      return Number.isNaN(numValue) ? '' : String(numValue);
    }
    case 'doubleValue': {
      const numValue = Number(valueWrapper.value);
      return Number.isNaN(numValue) ? '' : String(numValue);
    }
    case 'boolValue':
      return valueWrapper.value ? 'true' : 'false';
    default:
      return '';
  }
};

export const ToolCallTab: FC<Props> = ({ span }) => {
  const toolData = useMemo(() => {
    const name = getAttributeValue(span, 'gen_ai.tool.name');
    const callId = getAttributeValue(span, 'gen_ai.tool.call.id');
    const description = getAttributeValue(span, 'gen_ai.tool.description');
    const argumentsStr = getAttributeValue(span, 'gen_ai.tool.call.arguments');
    const resultStr = getAttributeValue(span, 'gen_ai.tool.call.result');

    return {
      name,
      callId,
      description,
      arguments: argumentsStr,
      result: resultStr,
      hasArguments: !!argumentsStr,
      hasResult: !!resultStr,
      isArgumentsJson: tryParseJson(argumentsStr).success,
      isResultJson: tryParseJson(resultStr).success,
    };
  }, [span]);

  const hasToolData = toolData.name || toolData.callId || toolData.hasArguments || toolData.hasResult;

  if (!hasToolData) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No tool call data</EmptyTitle>
          <EmptyDescription>No tool call data found in this span</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Tool Description */}
      {!!toolData.description && (
        <ContentPanel className="bg-muted/20">
          <Text className="text-sm leading-relaxed" variant="muted">
            {toolData.description}
          </Text>
        </ContentPanel>
      )}

      {/* Arguments */}
      {!!toolData.hasArguments && (
        <ToolEventCard
          callId={toolData.callId}
          content={
            toolData.isArgumentsJson ? formatJsonContent(toolData.arguments, true) : truncateContent(toolData.arguments)
          }
          testId="tool-call-arguments"
          toolName={toolData.name || 'unknown'}
          type="call"
        />
      )}

      {/* Result */}
      {!!toolData.hasResult && (
        <ToolEventCard
          callId={toolData.callId}
          content={toolData.isResultJson ? formatJsonContent(toolData.result, true) : truncateContent(toolData.result)}
          testId="tool-call-result"
          toolName={toolData.name || 'unknown'}
          type="response"
        />
      )}
    </div>
  );
};
