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

import { Reasoning, ReasoningTrigger } from 'components/ai-elements/reasoning';
import { Response } from 'components/ai-elements/response';
import { CollapsibleContent } from 'components/redpanda-ui/components/collapsible';
import { cn } from 'components/redpanda-ui/lib/utils';
import type { ChatMessage } from 'database/chat-db';

type AIAgentMessageViewProps = {
  message: ChatMessage;
  isStreaming?: boolean;
};

// Regex patterns for parsing tool requests and responses
const TOOL_REQUEST_REGEX = /^Tool request: (.+?) with arguments: (.+)$/s;
const TOOL_RESPONSE_REGEX = /^Tool response: (.+)$/s;

/**
 * Message view component for AI Agent chat that uses Streamdown for markdown rendering.
 * Renders user messages with standard styling and agent responses with animated markdown.
 * Shows reasoning/thinking steps for task-based responses.
 */
export const AIAgentMessageView = ({ message, isStreaming = false }: AIAgentMessageViewProps) => {
  const hasReasoning = message.reasoning && message.reasoning.length > 0;

  return (
    <div className={`flex p-4 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`} key={message.id}>
      <article
        aria-label={`${message.sender} message`}
        className={`max-w-[85%] rounded-xl p-4 shadow-sm ${
          message.sender === 'user' ? 'bg-blue-500 text-white' : 'border border-slate-200 bg-white text-slate-900'
        }`}
      >
        <div className="space-y-4 text-sm leading-relaxed">
          {message.sender === 'user' ? (
            // User messages: simple text
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <>
              {/* Show reasoning/thinking indicator during streaming or after completion */}
              {(hasReasoning || isStreaming) && (
                <Reasoning className="w-full" defaultOpen={false} isStreaming={isStreaming}>
                  <ReasoningTrigger>
                    <div className="flex w-full items-center gap-2 text-muted-foreground text-sm">
                      <svg
                        aria-label="Reasoning indicator"
                        className="size-4"
                        fill="none"
                        role="img"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <title>Reasoning indicator</title>
                        <path
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {isStreaming ? (
                        <span>Thinking...</span>
                      ) : (
                        <span>View reasoning ({message.reasoning?.split('\n\n').length || 0} steps)</span>
                      )}
                      <svg
                        aria-label="Toggle reasoning"
                        className="ml-auto size-4 transition-transform data-[state=open]:rotate-180"
                        fill="none"
                        role="img"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <title>Toggle reasoning</title>
                        <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </ReasoningTrigger>
                  <CollapsibleContent
                    className={cn(
                      'mt-4 text-sm',
                      'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in'
                    )}
                  >
                    {isStreaming && !message.reasoning ? (
                      <div className="text-muted-foreground text-sm">
                        Let me think about this problem step by step...
                      </div>
                    ) : (
                      <div className="space-y-2 overflow-x-hidden">
                        {message.reasoning?.split('\n\n').map((step, index) => {
                          // Parse tool requests and responses for better formatting
                          const toolRequestMatch = step.match(TOOL_REQUEST_REGEX);
                          const toolResponseMatch = step.match(TOOL_RESPONSE_REGEX);

                          if (toolRequestMatch) {
                            const [, toolName, argsString] = toolRequestMatch;
                            try {
                              const args = JSON.parse(argsString);
                              return (
                                <div className="text-slate-600 text-xs" key={`${message.id}-reasoning-${index}`}>
                                  <div className="overflow-wrap-anywhere break-words rounded bg-blue-50 p-2">
                                    <div className="font-semibold text-blue-900">Tool request: {toolName}</div>
                                    <pre className="mt-1 whitespace-pre-wrap font-mono text-blue-800">
                                      {JSON.stringify(args, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              );
                            } catch {
                              // Fall back to original display if parsing fails
                            }
                          }

                          if (toolResponseMatch) {
                            const [, responseString] = toolResponseMatch;
                            try {
                              const response = JSON.parse(responseString);
                              return (
                                <div className="text-slate-600 text-xs" key={`${message.id}-reasoning-${index}`}>
                                  <div className="overflow-wrap-anywhere break-words rounded bg-green-50 p-2">
                                    <div className="font-semibold text-green-900">Tool response:</div>
                                    <pre className="mt-1 whitespace-pre-wrap font-mono text-green-800">
                                      {JSON.stringify(response, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              );
                            } catch {
                              // Fall back to original display if parsing fails
                            }
                          }

                          // Default display for non-tool messages
                          return (
                            <div className="text-slate-600 text-xs" key={`${message.id}-reasoning-${index}`}>
                              <div className="overflow-wrap-anywhere whitespace-pre-wrap break-words rounded bg-slate-100 p-2 font-mono">
                                {step}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CollapsibleContent>
                </Reasoning>
              )}

              {/* Agent messages: use Streamdown Response component for markdown */}
              <Response isAnimating={isStreaming}>{message.content}</Response>
            </>
          )}
        </div>
        <p className={`mt-2 text-xs ${message.sender === 'user' ? 'text-blue-100' : 'text-slate-500'}`}>
          {message.timestamp.toLocaleTimeString()}
          {message.taskId && <span className="ml-2 opacity-50">Task: {message.taskId.slice(0, 8)}...</span>}
        </p>
      </article>
    </div>
  );
};
