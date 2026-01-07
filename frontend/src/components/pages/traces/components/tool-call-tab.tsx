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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Wrench } from 'lucide-react';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import type { FC } from 'react';
import { useMemo } from 'react';

interface Props {
  span: Span;
}

const getAttributeValue = (span: Span, key: string): string => {
  const attr = span.attributes?.find((a) => a.key === key);
  if (!attr?.value?.value) {
    return '';
  }

  switch (attr.value.value.case) {
    case 'stringValue':
      return attr.value.value.value;
    case 'intValue':
      return String(Number(attr.value.value.value));
    case 'doubleValue':
      return String(attr.value.value.value);
    case 'boolValue':
      return attr.value.value.value ? 'true' : 'false';
    default:
      return '';
  }
};

const MAX_PAYLOAD_SIZE = 20 * 1024; // 20KB

const truncateContent = (content: string): string => {
  if (content.length <= MAX_PAYLOAD_SIZE) {
    return content;
  }
  return `${content.slice(0, MAX_PAYLOAD_SIZE)}\n\n[... truncated ${content.length - MAX_PAYLOAD_SIZE} characters]`;
};

const isJsonContent = (content: string): boolean => {
  if (!content) {
    return false;
  }
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
};

const formatJsonContent = (content: string): string => {
  const truncated = truncateContent(content);
  try {
    const parsed = JSON.parse(truncated);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return truncated;
  }
};

const getToolType = (type: string): string => {
  switch (type.toLowerCase()) {
    case 'function':
      return 'Function';
    case 'extension':
      return 'Extension';
    case 'datastore':
      return 'Datastore';
    default:
      return type || 'Unknown';
  }
};

const getToolTypeTooltip = (type: string, rawType: string): string => {
  switch (type.toLowerCase()) {
    case 'function':
      return 'Function: A tool executed on the client-side where the agent generates parameters for a predefined function.';
    case 'extension':
      return 'Extension: A tool executed on the agent-side to directly call external APIs, bridging the gap between the agent and real-world systems.';
    case 'datastore':
      return 'Datastore: A tool used to access and query structured or unstructured external data for retrieval-augmented tasks or knowledge updates.';
    default:
      if (!rawType) {
        return 'Unknown: The gen_ai.tool.type attribute is not set on this span. This attribute indicates the execution context of the tool (function, extension, or datastore).';
      }
      return `Unknown: The gen_ai.tool.type attribute has an unrecognized value: "${rawType}". Expected values are: function, extension, or datastore.`;
  }
};

export const ToolCallTab: FC<Props> = ({ span }) => {
  const toolData = useMemo(() => {
    const name = getAttributeValue(span, 'gen_ai.tool.name');
    const callId = getAttributeValue(span, 'gen_ai.tool.call.id');
    const rawType = getAttributeValue(span, 'gen_ai.tool.type');
    const description = getAttributeValue(span, 'gen_ai.tool.description');
    const argumentsStr = getAttributeValue(span, 'gen_ai.tool.call.arguments');
    const resultStr = getAttributeValue(span, 'gen_ai.tool.call.result');

    return {
      name,
      callId,
      rawType,
      type: getToolType(rawType),
      description,
      arguments: argumentsStr,
      result: resultStr,
      hasArguments: !!argumentsStr,
      hasResult: !!resultStr,
      isArgumentsJson: isJsonContent(argumentsStr),
      isResultJson: isJsonContent(resultStr),
    };
  }, [span]);

  const hasToolData = toolData.name || toolData.callId || toolData.hasArguments || toolData.hasResult;

  if (!hasToolData) {
    return (
      <div className="rounded bg-muted/10 p-8 text-center text-muted-foreground">
        No tool call data found in this span
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      {/* Tool Header */}
      {toolData.name && (
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{toolData.name}</span>
          {toolData.type && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-flex">
                    <Badge className="cursor-help text-xs" variant="secondary">
                      {toolData.type}
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent arrow={false} className="max-w-sm border bg-popover text-popover-foreground">
                  <p className="text-xs">{getToolTypeTooltip(toolData.type, toolData.rawType)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}

      {/* Tool Description */}
      {toolData.description && (
        <div className="rounded border bg-muted/20 p-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">{toolData.description}</p>
        </div>
      )}

      {/* Tool ID */}
      {toolData.callId && (
        <div className="space-y-1">
          <h5 className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">CALL ID</h5>
          <div className="rounded border bg-muted/30 p-2">
            <p className="break-all font-mono text-[10px]">{toolData.callId}</p>
          </div>
        </div>
      )}

      {/* Arguments */}
      {toolData.hasArguments && (
        <div className="space-y-1.5">
          <h5 className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">ARGUMENTS</h5>
          <div className="rounded border bg-muted/30 p-2">
            {toolData.isArgumentsJson ? (
              <pre className="overflow-x-auto">
                <code className="font-mono text-[10px] leading-relaxed">{formatJsonContent(toolData.arguments)}</code>
              </pre>
            ) : (
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed">{truncateContent(toolData.arguments)}</p>
            )}
          </div>
        </div>
      )}

      {/* Result */}
      {toolData.hasResult && (
        <div className="space-y-1.5">
          <h5 className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">RESULT</h5>
          <div className="rounded border bg-muted/30 p-2">
            {toolData.isResultJson ? (
              <pre className="overflow-x-auto">
                <code className="font-mono text-[10px] leading-relaxed">{formatJsonContent(toolData.result)}</code>
              </pre>
            ) : (
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed">{truncateContent(toolData.result)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
