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
import { Button } from 'components/redpanda-ui/components/button';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { CheckCircle, ChevronDown, ChevronRight, HelpCircle, History, MessageSquare, User, Wrench } from 'lucide-react';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import type { FC } from 'react';
import { useMemo, useState } from 'react';
import { tryParseJson } from 'utils/json-utils';

import { CollapsibleCodeSection } from './collapsible-code-section';
import { ContentPanel } from './content-panel';
import { formatJsonContent } from '../utils/trace-formatters';

type Props = {
  span: Span;
};

// OpenTelemetry message part types
type MessagePart = {
  type: 'text' | 'tool_call' | 'tool_call_response';
  content?: string; // text parts
  name?: string; // tool_call parts
  arguments?: Record<string, unknown>; // tool_call parts
  response?: Record<string, unknown>; // tool_call_response parts
};

// OpenTelemetry message structure
type OTelMessage = {
  role: 'user' | 'assistant' | 'tool' | 'system';
  parts?: MessagePart[];
  content?: string; // Backward compatibility: simple format
};

// Tool call extracted from parts
type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  uiKey?: string; // Unique key for React rendering
};

// Tool response extracted from parts
type ToolResponse = {
  response: Record<string, unknown>;
  uiKey?: string; // Unique key for React rendering
};

// Normalized message for display
type Message = {
  role: string;
  content: string;
  toolCalls?: ToolCall[]; // Extracted from tool_call parts
  toolResponses?: ToolResponse[]; // Extracted from tool_call_response parts
};

// Component: Display tool call
const ToolCallDisplay: FC<{ toolCall: ToolCall }> = ({ toolCall }) => (
  <div className="space-y-1.5">
    <div className="flex items-center gap-1.5">
      <Wrench className="h-3 w-3 text-muted-foreground" />
      <span className="font-medium text-[10px] text-muted-foreground">Tool Call: {toolCall.name}</span>
    </div>
    <CollapsibleCodeSection content={JSON.stringify(toolCall.arguments, null, 2)} title="ARGUMENTS" />
  </div>
);

// Component: Display tool response
const ToolResponseDisplay: FC<{ response: ToolResponse }> = ({ response }) => (
  <div className="space-y-1.5">
    <div className="flex items-center gap-1.5">
      <CheckCircle className="h-3 w-3 text-muted-foreground" />
      <span className="font-medium text-[10px] text-muted-foreground">Tool Response</span>
    </div>
    <CollapsibleCodeSection content={JSON.stringify(response.response, null, 2)} title="RESPONSE" />
  </div>
);

// Component: Display a single history message
const HistoryMessageItem: FC<{ message: Message; index: number }> = ({ message, index }) => {
  const Icon = getMessageIcon(message.role);
  const messageType = getMessageType(message.role);
  const isJson = messageType === 'tool' && tryParseJson(message.content).success;
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
  const hasToolResponses = message.toolResponses && message.toolResponses.length > 0;
  const hasContent = message.content.length > 0;

  return (
    <ContentPanel className="space-y-1" key={`history-${message.role}-${index}`}>
      {/* Role header */}
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium text-[10px] capitalize">{message.role}</span>
      </div>

      {/* Text content */}
      {hasContent ? (
        <div className="text-[10px] leading-relaxed">
          {isJson ? (
            <div className="[&_*]:text-[10px]">
              <DynamicCodeBlock code={formatJsonContent(message.content)} lang="json" />
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words text-muted-foreground">{message.content}</p>
          )}
        </div>
      ) : null}

      {/* Tool calls */}
      {hasToolCalls ? (
        <div className="mt-2 space-y-4">
          {message.toolCalls?.map((toolCall) => (
            <ToolCallDisplay key={toolCall.uiKey} toolCall={toolCall} />
          ))}
        </div>
      ) : null}

      {/* Tool responses */}
      {hasToolResponses ? (
        <div className="mt-2 space-y-4">
          {message.toolResponses?.map((toolResp) => (
            <ToolResponseDisplay key={toolResp.uiKey} response={toolResp} />
          ))}
        </div>
      ) : null}
    </ContentPanel>
  );
};

// Component: Display input section
const InputSection: FC<{ input: string; lastInputMessage?: Message }> = ({ input, lastInputMessage }) => {
  if (!(input || lastInputMessage)) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <h5 className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">INPUT</h5>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3 w-3 text-muted-foreground/50" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">
                The last message added to the conversation before this LLM request. This could be a user message, tool
                response, or any other input that triggered this specific LLM call.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <ContentPanel spacing>
        {!!input && <p className="whitespace-pre-wrap break-words text-[10px] leading-relaxed">{input}</p>}

        {/* Tool responses in input */}
        {lastInputMessage?.toolResponses && lastInputMessage.toolResponses.length > 0 ? (
          <div className="space-y-4">
            {lastInputMessage.toolResponses.map((toolResp) => (
              <ToolResponseDisplay key={toolResp.uiKey} response={toolResp} />
            ))}
          </div>
        ) : null}

        {/* Tool calls in input (rare but possible) */}
        {lastInputMessage?.toolCalls && lastInputMessage.toolCalls.length > 0 ? (
          <div className="space-y-4">
            {lastInputMessage.toolCalls.map((toolCall) => (
              <ToolCallDisplay key={toolCall.uiKey} toolCall={toolCall} />
            ))}
          </div>
        ) : null}
      </ContentPanel>
    </div>
  );
};

// Component: Display output section
const OutputSection: FC<{ output: string; lastOutputMessage?: Message }> = ({ output, lastOutputMessage }) => {
  if (!(output || lastOutputMessage)) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <h5 className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">OUTPUT</h5>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3 w-3 text-muted-foreground/50" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">The response generated by the LLM for this specific request.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <ContentPanel spacing>
        {!!output && <p className="whitespace-pre-wrap break-words text-[10px] leading-relaxed">{output}</p>}

        {/* Tool calls in output (LLM making tool calls) */}
        {lastOutputMessage?.toolCalls && lastOutputMessage.toolCalls.length > 0 ? (
          <div className="space-y-4">
            {lastOutputMessage.toolCalls.map((toolCall) => (
              <ToolCallDisplay key={toolCall.uiKey} toolCall={toolCall} />
            ))}
          </div>
        ) : null}

        {/* Tool responses in output (rare but possible) */}
        {lastOutputMessage?.toolResponses && lastOutputMessage.toolResponses.length > 0 ? (
          <div className="space-y-4">
            {lastOutputMessage.toolResponses.map((toolResp) => (
              <ToolResponseDisplay key={toolResp.uiKey} response={toolResp} />
            ))}
          </div>
        ) : null}
      </ContentPanel>
    </div>
  );
};

const getAttributeValue = (span: Span, key: string): string | number => {
  const attr = span.attributes?.find((a) => a.key === key);
  if (!attr?.value?.value) {
    return '';
  }

  switch (attr.value.value.case) {
    case 'stringValue':
      return attr.value.value.value;
    case 'intValue':
      return Number(attr.value.value.value);
    case 'doubleValue':
      return attr.value.value.value;
    case 'boolValue':
      return attr.value.value.value ? 'true' : 'false';
    default:
      return '';
  }
};

const getMessageType = (role: string): 'user' | 'assistant' | 'tool' | 'system' => {
  const normalized = role.toLowerCase();
  if (normalized.includes('user')) {
    return 'user';
  }
  if (normalized.includes('assistant')) {
    return 'assistant';
  }
  if (normalized.includes('tool')) {
    return 'tool';
  }
  return 'system';
};

const getMessageIcon = (role: string) => {
  const type = getMessageType(role);
  switch (type) {
    case 'user':
      return User;
    case 'assistant':
      return MessageSquare;
    case 'tool':
      return Wrench;
    default:
      return MessageSquare;
  }
};

// Regex for matching indexed message format: gen_ai.prompt.{index}.{field}
const INDEXED_MESSAGE_PATTERN = /^gen_ai\.prompt\.(\d+)\.(role|content)$/;

// Helper: Flatten OpenTelemetry message parts into displayable message
const flattenMessageParts = (otelMsg: OTelMessage): Message => {
  const message: Message = {
    role: otelMsg.role || 'system',
    content: '',
    toolCalls: [],
    toolResponses: [],
  };

  const textParts: string[] = [];

  for (const part of otelMsg.parts || []) {
    switch (part.type) {
      case 'text':
        if (part.content) {
          textParts.push(part.content);
        }
        break;

      case 'tool_call':
        if (part.name && part.arguments) {
          message.toolCalls?.push({
            name: part.name,
            arguments: part.arguments,
            uiKey: crypto.randomUUID(),
          });
        }
        break;

      case 'tool_call_response':
        if (part.response) {
          message.toolResponses?.push({
            response: part.response,
            uiKey: crypto.randomUUID(),
          });
        }
        break;

      default:
        // Ignore unknown part types (blob, file, uri, reasoning, etc.)
        break;
    }
  }

  // Join text parts with newlines
  message.content = textParts.join('\n');

  return message;
};

// Helper: Extract OpenTelemetry format messages from attribute
const extractOTelMessages = (span: Span, attributeKey: string): Message[] => {
  const attr = span.attributes?.find((a) => a.key === attributeKey);
  if (!attr?.value?.value || attr.value.value.case !== 'stringValue') {
    return [];
  }

  try {
    const parsed = JSON.parse(attr.value.value.value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((msg: OTelMessage) => {
        // Check if message has parts array (OpenTelemetry format)
        if (msg.parts && Array.isArray(msg.parts)) {
          return flattenMessageParts(msg);
        }

        // Backward compatibility: simple {role, content} format
        if (msg.role && msg.content) {
          return { role: msg.role, content: msg.content };
        }

        return null;
      })
      .filter((msg): msg is Message => msg !== null);
  } catch {
    return [];
  }
};

// Helper: Extract indexed format (backward compatibility)
const extractIndexedMessages = (span: Span): Message[] => {
  const messageMap = new Map<number, Partial<Message>>();
  const attrs = span.attributes || [];

  for (const attr of attrs) {
    const match = attr.key.match(INDEXED_MESSAGE_PATTERN);
    if (match) {
      const index = Number.parseInt(match[1], 10);
      const field = match[2] as 'role' | 'content';

      if (!messageMap.has(index)) {
        messageMap.set(index, {});
      }

      const msg = messageMap.get(index);
      if (msg && attr.value?.value?.case === 'stringValue') {
        msg[field] = attr.value.value.value;
      }
    }
  }

  // Convert map to array and filter complete messages
  const messages: Message[] = [];
  const sortedIndices = Array.from(messageMap.keys()).sort((a, b) => a - b);
  for (const index of sortedIndices) {
    const msg = messageMap.get(index);
    if (msg?.role && msg?.content) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  return messages;
};

// Helper: Find last assistant message from input messages (fallback for output)
const findLastAssistantMessage = (inputMessages: Message[]): Message | undefined => {
  for (let i = inputMessages.length - 1; i >= 0; i--) {
    const msg = inputMessages[i];
    if (getMessageType(msg.role) === 'assistant') {
      return msg;
    }
  }
  return;
};

// Helper: Process input and output messages
const processMessages = (
  inputMessages: Message[],
  outputMessages: Message[],
  inputFallback: string,
  outputFallback: string
) => {
  let input = inputFallback;
  let output = outputFallback;
  let lastInputMessage: Message | undefined;
  let lastOutputMessage: Message | undefined;

  // INPUT: Last message from gen_ai.input.messages
  if (inputMessages.length > 0) {
    lastInputMessage = inputMessages.at(-1);
    if (!input && lastInputMessage) {
      input = lastInputMessage.content;
    }
  }

  // OUTPUT: Last message from gen_ai.output.messages
  if (outputMessages.length > 0) {
    lastOutputMessage = outputMessages.at(-1);
    if (!output && lastOutputMessage) {
      output = lastOutputMessage.content;
    }
  }

  // Fallback: if no output messages, look for last assistant message in input messages
  if (!lastOutputMessage) {
    lastOutputMessage = findLastAssistantMessage(inputMessages);
    if (!output && lastOutputMessage) {
      output = lastOutputMessage.content;
    }
  }

  return { input, output, lastInputMessage, lastOutputMessage };
};

export const LLMIOTab: FC<Props> = ({ span }) => {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const llmData = useMemo(() => {
    const model = String(getAttributeValue(span, 'gen_ai.request.model') || '');
    const inputTokens = Number(getAttributeValue(span, 'gen_ai.usage.input_tokens') || 0);
    const outputTokens = Number(getAttributeValue(span, 'gen_ai.usage.output_tokens') || 0);

    // Extract messages from both input and output attributes separately
    const inputMessages = extractOTelMessages(span, 'gen_ai.input.messages');
    const outputMessages = extractOTelMessages(span, 'gen_ai.output.messages');

    const inputFallback = String(getAttributeValue(span, 'gen_ai.prompt') || '');
    const outputFallback = String(getAttributeValue(span, 'gen_ai.completion') || '');

    const { input, output, lastInputMessage, lastOutputMessage } = processMessages(
      inputMessages,
      outputMessages,
      inputFallback,
      outputFallback
    );

    return {
      model,
      input,
      output,
      inputTokens,
      outputTokens,
      inputMessages,
      outputMessages,
      lastInputMessage,
      lastOutputMessage,
    };
  }, [span]);

  // Compute history message count for the badge (always, even when collapsed)
  const historyMessageCount = useMemo(() => {
    let allMessages = [...llmData.inputMessages, ...llmData.outputMessages];

    if (allMessages.length === 0) {
      allMessages = extractIndexedMessages(span);
    }

    const filtered = allMessages.filter((msg) => msg !== llmData.lastInputMessage && msg !== llmData.lastOutputMessage);
    return filtered.length;
  }, [llmData.inputMessages, llmData.outputMessages, llmData.lastInputMessage, llmData.lastOutputMessage, span]);

  // Only compute full messages when expanded (for rendering)
  const historyMessages = useMemo(() => {
    if (!isHistoryOpen) {
      return [];
    }

    let allMessages = [...llmData.inputMessages, ...llmData.outputMessages];

    if (allMessages.length === 0) {
      allMessages = extractIndexedMessages(span);
    }

    return allMessages.filter((msg) => msg !== llmData.lastInputMessage && msg !== llmData.lastOutputMessage);
  }, [
    isHistoryOpen,
    llmData.inputMessages,
    llmData.outputMessages,
    llmData.lastInputMessage,
    llmData.lastOutputMessage,
    span,
  ]);

  const MAX_HISTORY_MESSAGES = 50;
  const visibleHistoryMessages = useMemo(() => historyMessages.slice(-MAX_HISTORY_MESSAGES), [historyMessages]);

  const hasLLMData =
    llmData.model || llmData.input || llmData.output || llmData.lastInputMessage || llmData.lastOutputMessage;

  if (!hasLLMData) {
    return (
      <div className="rounded bg-muted/10 p-8 text-center text-muted-foreground">No LLM data found in this span</div>
    );
  }

  const totalTokens = llmData.inputTokens + llmData.outputTokens;
  const hasConversationHistory = isHistoryOpen && historyMessages.length > 0;

  return (
    <div className="space-y-4 p-3">
      {/* Model Info & Token Counts */}
      {!!llmData.model && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Model:</span>
          <Badge className="text-xs" variant="secondary">
            {llmData.model}
          </Badge>
        </div>
      )}

      {/* Token Counts - Compact */}
      {llmData.inputTokens > 0 && (
        <ContentPanel className="flex items-center justify-between bg-muted/20 text-xs">
          <div className="space-x-3">
            <span className="text-muted-foreground">
              Input:{' '}
              <span className="font-medium font-mono text-foreground">{llmData.inputTokens.toLocaleString()}</span>
            </span>
            <span className="text-muted-foreground">
              Output:{' '}
              <span className="font-medium font-mono text-foreground">{llmData.outputTokens.toLocaleString()}</span>
            </span>
          </div>
          <span className="font-medium text-muted-foreground">{totalTokens.toLocaleString()} total</span>
        </ContentPanel>
      )}

      <InputSection input={llmData.input} lastInputMessage={llmData.lastInputMessage} />
      <OutputSection lastOutputMessage={llmData.lastOutputMessage} output={llmData.output} />

      {/* Conversation History */}
      <Collapsible onOpenChange={setIsHistoryOpen} open={isHistoryOpen}>
        <CollapsibleTrigger asChild>
          <Button className="h-7 w-full justify-between px-2 text-xs hover:bg-muted/50" variant="ghost">
            <div className="flex items-center gap-1.5">
              <History className="h-3 w-3" />
              <span>Conversation History</span>
              {historyMessageCount > 0 && (
                <Badge className="h-4 bg-muted/50 px-1 text-[9px]" variant="outline">
                  {historyMessageCount} {historyMessageCount === 1 ? 'message' : 'messages'}
                </Badge>
              )}
            </div>
            {isHistoryOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </CollapsibleTrigger>
        {hasConversationHistory ? (
          <CollapsibleContent className="space-y-2 pt-2">
            {visibleHistoryMessages.map((message, idx) => (
              <HistoryMessageItem index={idx} key={`history-${message.role}-${idx}`} message={message} />
            ))}
          </CollapsibleContent>
        ) : null}
      </Collapsible>
    </div>
  );
};
