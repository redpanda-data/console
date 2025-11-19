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

import { Message, MessageSendParams, SendMessageResponse, SendMessageSuccessResponse, Task, TaskArtifactUpdateEvent, TaskStatusUpdateEvent, FilePart, TextPart, Part } from '@a2a-js/sdk';
import { A2AClient } from "@a2a-js/sdk/client";

import {
  LanguageModelV2, LanguageModelV2CallOptions, LanguageModelV2Prompt, LanguageModelV2Content, LanguageModelV2CallWarning,
  LanguageModelV2StreamPart,
  LanguageModelV2FilePart,
  UnsupportedFunctionalityError,
  LanguageModelV2FinishReason,
  LanguageModelV2TextPart,
  LanguageModelV2File,
} from '@ai-sdk/provider';
import { convertAsyncIteratorToReadableStream, generateId, IdGenerator } from '@ai-sdk/provider-utils';
import { getAgentCardUrls } from 'utils/ai-agent.utils';

/**
 * Try multiple agent card URLs in order until one succeeds.
 * Tries agent-card.json first, then falls back to agent.json
 */
async function createA2AClientWithFallback(agentUrl: string, options: { fetchImpl: typeof fetch }): Promise<A2AClient> {
  const urls = getAgentCardUrls({ agentUrl });
  const errors: Error[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const isLastUrl = i === urls.length - 1;

    try {
      const client = await A2AClient.fromCardUrl(url, options);
      return client;
    } catch (error) {
      errors.push(error as Error);
      console.log(`Failed to fetch agent card from ${url}, ${isLastUrl ? 'no more URLs to try' : 'trying next URL...'}`);
      // Continue to next URL if not the last one
      if (isLastUrl) {
        break;
      }
    }
  }

  // If all URLs failed, throw an error with all attempted URLs
  const errorMessage = `Failed to create A2A client. Tried URLs: ${urls.join(', ')}. Errors: ${errors.map(e => e.message).join('; ')}`;
  throw new Error(errorMessage);
}

type A2AStreamEventData = Task | Message | TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

export type A2aChatSettings = object

export type A2aChatConfig = {
  readonly provider: string;
  readonly generateId?: IdGenerator;
  readonly jwt?: string;
}

export function mapFinishReason(event: TaskStatusUpdateEvent): LanguageModelV2FinishReason {
  if (event.status.state === "completed") {
    return 'stop';
  }

  if (event.status.state === "input-required") {
    return 'stop';
  }

  if (event.status.state === "auth-required") {
    return 'error';
  }

  if (event.status.state === "failed") {
    return 'error';
  }

  if (event.status.state === "canceled") {
    return 'other';
  }

  if (event.status.state === "rejected") {
    return 'error';
  }

  if (event.status.state === "submitted") {
    return 'stop';
  }

  if (event.status.state === "unknown") {
    return 'unknown';
  }

  if (event.status.state === "working") {
    return 'unknown';
  }

  return 'unknown';
}

export function getResponseMetadata(event: A2AStreamEventData) {
  if (event.kind === "task") {
    return {
      id: event.id,
      modelId: undefined,
      timestamp: event.status.timestamp ? new Date(event.status.timestamp) : undefined
    }
  }
  if (event.kind === "message") {
    return {
      id: event.messageId,
      modelId: undefined,
      timestamp: undefined
    }
  }

  if (event.kind === "status-update") {
    return {
      id: event.taskId,
      modelId: undefined,
      timestamp: event.status.timestamp ? new Date(event.status.timestamp) : undefined
    }
  }

  if (event.kind === "artifact-update") {
    return {
      id: event.taskId,
      modelId: undefined,
      timestamp: undefined
    }
  }

  return {
  }
}

function isErrorResponse(
  response: SendMessageResponse
): boolean {
  return 'error' in response;
}

class A2aChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';
  readonly provider: string;
  readonly modelId: string;
  // @ts-ignore part of A2A adapter for AI SDK
  private readonly config: A2aChatConfig;


  constructor(
    modelId: string,
    // @ts-ignore part of A2A adapter for AI SDK
    settings: A2aChatSettings,
    config: A2aChatConfig,
  ) {
    this.provider = config.provider;
    this.modelId = modelId;
    this.config = config;
    // Initialize with settings and config
  }

  // Convert AI SDK prompt to provider format
  private getArgs(options: LanguageModelV2CallOptions) {
    const warnings: LanguageModelV2CallWarning[] = [];

    // Map messages to provider format
    const messages = this.convertToProviderMessages(options.prompt);

    if (options.tools) {
      throw new UnsupportedFunctionalityError({
        functionality: "tools",
        message: "We don't support tools, yet."
      });
    }

    const tools = undefined;

    const body = {
      model: this.modelId,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxOutputTokens,
      stop: options.stopSequences,
      tools
    };

    return { args: body, warnings };
  }

  async doGenerate(
    options: Parameters<LanguageModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
    const { args, warnings } = this.getArgs(options);

    const fetchWithCustomHeader: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      if (this.config.jwt) {
        headers.set('Authorization', `Bearer ${this.config.jwt}`);
      }
      headers.set('X-Redpanda-Stream-Tokens', 'true');

      const newInit = { ...init, headers };

      return fetch(url, newInit);
    };

    const client = await createA2AClientWithFallback(this.modelId, { fetchImpl: fetchWithCustomHeader });

    if (args.messages.length < 1) {
      throw new Error('Cannot handle zero messages!');
    }

    const message = args.messages[args.messages.length - 1];

    const sendParams: MessageSendParams = {
      message,
      configuration: {
        blocking: true,
        acceptedOutputModes: ['text/plain']
      }
    };

    if (options.providerOptions?.a2a?.contextId) {
      sendParams.message.contextId = options.providerOptions?.a2a?.contextId as string;
    }

    const sendResponse: SendMessageResponse = await client.sendMessage(sendParams);

    if (isErrorResponse(sendResponse)) {
      throw new Error("Error sending message:" + (sendResponse as { error: { message: string } }).error.message);
    }

    // On success, the result can be a Task or a Message. Check which one it is.
    const response = (sendResponse as SendMessageSuccessResponse).result;

    // Convert provider response to AI SDK format
    const content: LanguageModelV2Content[] = this.convertProviderResponseToContent(response);

    return {
      content,
      finishReason: "stop", // this.mapFinishReason(response.choices[0].finish_reason),
      usage: {
        inputTokens: undefined, // response.usage?.prompt_tokens,
        outputTokens: undefined, // response.usage?.completion_tokens,
        totalTokens: undefined, // response.usage?.total_tokens,
      },
      request: { body: args },
      response: { body: response },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV2['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
    const { args, warnings } = this.getArgs(options);

    const fetchWithCustomHeader: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      if (this.config.jwt) {
        headers.set('Authorization', `Bearer ${this.config.jwt}`);
      }

      const newInit = { ...init, headers };

      return fetch(url, newInit);
    };

    const client = await createA2AClientWithFallback(this.modelId, { fetchImpl: fetchWithCustomHeader });

    if (args.messages.length < 1) {
      throw new Error('Cannot handle less then one message!');
    }



    const message = args.messages[args.messages.length - 1];

    if (options.providerOptions?.a2a?.contextId) {
      message.contextId = options.providerOptions?.a2a?.contextId as string;
    }

    try {
      // Construct the `MessageSendParams` object.
      const streamParams: MessageSendParams = {
        message
      };
      const clientCard = await client.getAgentCard();

      let simulatedStream = null;

      if (!clientCard.capabilities.streaming) {
        const nonStreamingResponse = await client.sendMessage(streamParams);

        if ("result" in nonStreamingResponse) {
          // task or message
          simulatedStream = new ReadableStream<A2AStreamEventData>({
            start(controller) {
              controller.enqueue(nonStreamingResponse.result);
              controller.close();
            },
          });
        }

        if ("error" in nonStreamingResponse) {
          // FIXME: error
        }
      }

      // Use the `sendMessageStream` method.
      const response = client.sendMessageStream(streamParams);
      let isFirstChunk = true;
      const activeTextIds = new Set<string>();
      let finishReason: LanguageModelV2FinishReason = 'unknown';

      const enqueueTextParts = (controller: TransformStreamDefaultController<LanguageModelV2StreamPart>, parts: Part[], id: string, lastChunk: boolean) => {
        const textContentParts = parts.filter((part) => part.kind === "text");

        if (textContentParts.length > 0) {
          if (!activeTextIds.has(id)) {
            controller.enqueue({ type: 'text-start', id });
            activeTextIds.add(id);
          }

          const textContent = parts.filter((part) => part.kind === "text").map((part) => {
            return (part).text;
          }).join(' ');

          controller.enqueue({
            type: 'text-delta',
            id,
            delta: textContent,
          });

          if (lastChunk) {
            controller.enqueue({
              type: 'text-end',
              id,
            });
            activeTextIds.delete(id);
          }
        }
      }

      return {
        stream: (simulatedStream || convertAsyncIteratorToReadableStream(response)).pipeThrough(
          new TransformStream<
            A2AStreamEventData,
            LanguageModelV2StreamPart
          >({
            start(controller) {
              controller.enqueue({ type: 'stream-start', warnings });
            },

            transform(event, controller) {
              // Emit raw chunk if requested (before anything else)
              if (options.includeRawChunks) {
                controller.enqueue({ type: 'raw', rawValue: event });
              }

              if (isFirstChunk) {
                isFirstChunk = false;

                controller.enqueue({
                  type: 'response-metadata',
                  ...getResponseMetadata(event),
                });
              }

              // Handle only artifact-update and task state changes
              if (event.kind === 'status-update') {
                if (event.final) {
                  finishReason = mapFinishReason(event)
                }
              }
              // Artifact-update events are handled as raw events, not converted to text-delta
            },

            flush(controller) {
              activeTextIds.forEach((activeTextId) => {
                controller.enqueue({ type: 'text-end', id: activeTextId });
              })

              controller.enqueue({
                type: 'finish',
                finishReason,
                usage: {
                  inputTokens: undefined,
                  outputTokens: undefined,
                  totalTokens: undefined,
                },
              });
            },
          }),
        ),
      };
    } catch (error) {
      throw new Error(`Error during streaming for message ${message.messageId}:` + error);
    }
  }

  private convertToProviderMessages(prompt: LanguageModelV2Prompt): Message[] {
    return prompt.filter((message) => message.role === "assistant" || message.role === "user").map((message) => {
      return {
        role: message.role === 'assistant' ? 'agent' : 'user',
        kind: "message",
        messageId: generateId(),
        parts: message.content.map((part) => {
          if (part.type === "text") {
            return { kind: 'text', text: part.text } as TextPart;
          }
          if (part.type === "file") {
            return this.convertFileToProviderPart(part);
          }
          throw new Error(`Unsupported part type: ${part.type}`);
        }),
      };
    });
  };

  private convertProviderPartToContent(part: Part): LanguageModelV2Content[] {
    const content: LanguageModelV2Content[] = [];

    if (part.kind === "text") {
      content.push({
        type: 'text',
        text: part.text
      } as LanguageModelV2TextPart);
    }

    if (part.kind === "file") {
      if ("bytes" in part.file) {
        content.push({
          type: "file",
          mediaType: part.file.mimeType as string,
          data: Uint8Array.from(Buffer.from(part.file.bytes, 'base64'))
        } as LanguageModelV2File)
      } else {
        if ("uri" in part.file) {
          content.push({
            type: "file",
            mediaType: part.file.mimeType as string,
            data: part.file.uri as string
          } as LanguageModelV2File)
        }
      }
    }
    if (part.kind === "data") {
      /* FIXME: handle data */
    }

    return content;
  }

  private convertProviderResponseToContent(response: Task | Message): LanguageModelV2Content[] {
    let content: LanguageModelV2Content[] = [];

    if (response.kind === "message") {
      response.parts.forEach((part) => {
        content = content.concat(...this.convertProviderPartToContent(part).flat())
      });
    }

    if (response.kind === "task") {
      if (response.status.message) {

        response.status.message.parts.forEach((part) => {
          content = content.concat(...this.convertProviderPartToContent(part).flat());
        });
      }
      response.artifacts?.forEach((artifact) => {
        artifact.parts?.forEach((part) => {
          content = content.concat(...this.convertProviderPartToContent(part).flat());
        })
      })
    }

    return content;
  }

  private convertFileToProviderPart(part: LanguageModelV2FilePart): FilePart {
    if (part.type !== "file") {
      throw new UnsupportedFunctionalityError({
        functionality:
          'Unsupported file part of type ' + part.type,
      });
    }

    if (part.data instanceof URL) {
      return {
        kind: 'file',
        file: {
          mimeType: part.mediaType,
          name: part.filename,
          uri: part.data.toString(),
        }
      }
    }

    return {
      kind: 'file',
      file: {
        mimeType: part.mediaType,
        name: part.filename,
        bytes: Buffer.from(part.data).toString('base64')
      }
    }
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    '*/*': [/.+/],
  };
}

export { A2aChatLanguageModel }
