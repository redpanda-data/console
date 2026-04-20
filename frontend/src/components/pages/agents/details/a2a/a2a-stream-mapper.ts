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

import type { Message, Task, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import type { LanguageModelV2FinishReason, LanguageModelV2StreamPart } from '@ai-sdk/provider';

import { getResponseMetadata, mapFinishReason } from './a2a-chat-language-model';

/**
 * Pure-reducer state threaded through `a2aEventToV2StreamParts` on each event.
 *
 * The state captures cross-event bookkeeping that the AI SDK v6 stream protocol
 * requires us to track:
 *   - `isFirstChunk` — the spec requires exactly one `response-metadata` part,
 *     and it must be emitted from the first event we see.
 *   - `finishReason` — terminal `status-update` events mutate this; `flush`
 *     reads it back into the trailing `finish` part.
 */
export type StreamMapperState = {
  isFirstChunk: boolean;
  finishReason: LanguageModelV2FinishReason;
};

type A2AStreamEventData = Task | Message | TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

/**
 * Build the initial state for `a2aEventToV2StreamParts`.
 *
 * `finishReason` starts as `'unknown'` — it is only changed when a terminal
 * `status-update` event arrives. If the stream ends without a terminal event
 * (network drop, cancel, etc.) we want the emitted `finish` part to carry
 * `'unknown'` rather than pretending the run completed.
 */
export const initialStreamMapperState = (): StreamMapperState => ({
  isFirstChunk: true,
  finishReason: 'unknown',
});

/**
 * Pure per-event translator from A2A SDK stream events to AI SDK v6 stream
 * parts.
 *
 * Contract:
 *   - Returns the parts to enqueue for this event plus the next state.
 *   - Never side-effects; the caller owns the controller.
 *   - Mirrors `doStream`'s original inline behavior exactly — the adapter
 *     call-site is the *only* place this should be wired up.
 *
 * Ordering note: if `includeRawChunks` is set we emit the `raw` part *before*
 * any other parts for that event. On the first chunk the order is therefore
 * `raw`, `response-metadata`. The AI SDK expects `response-metadata` to arrive
 * before any content parts but allows `raw` parts to be interleaved freely, so
 * putting `raw` first preserves the original ordering while keeping callers
 * free to dedupe on `response-metadata`.
 */
export function a2aEventToV2StreamParts(
  event: A2AStreamEventData,
  state: StreamMapperState,
  options: { includeRawChunks?: boolean }
): { parts: LanguageModelV2StreamPart[]; state: StreamMapperState } {
  const parts: LanguageModelV2StreamPart[] = [];
  let nextState = state;

  // Emit raw chunk first so callers can observe the untouched SDK event.
  if (options.includeRawChunks) {
    parts.push({ type: 'raw', rawValue: event });
  }

  if (nextState.isFirstChunk) {
    nextState = { ...nextState, isFirstChunk: false };
    parts.push({
      type: 'response-metadata',
      ...getResponseMetadata(event),
    });
  }

  // Only terminal status-update events change the finish reason. Task,
  // artifact-update, and message events leave it alone.
  if (event.kind === 'status-update' && event.final) {
    nextState = { ...nextState, finishReason: mapFinishReason(event) };
  }

  return { parts, state: nextState };
}

/**
 * Build the trailing `finish` stream part from the final mapper state.
 *
 * Usage values are always `undefined` because the A2A protocol does not
 * surface token counts on the stream close event. Token accounting flows
 * through a separate out-of-band metadata path.
 */
export function finalizeStream(state: StreamMapperState): LanguageModelV2StreamPart {
  return {
    type: 'finish',
    finishReason: state.finishReason,
    usage: {
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    },
  };
}
