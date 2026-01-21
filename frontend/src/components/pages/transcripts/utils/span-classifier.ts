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

import type { LucideIcon } from 'lucide-react';
import { Cpu, Database, MessageSquare, Wrench, Zap } from 'lucide-react';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';

import { getAttributeFromSpan, hasAttribute } from './attribute-helpers';

/**
 * Span classification types based on OpenTelemetry semantic conventions
 */
export type SpanKind = 'agent' | 'llm' | 'tool' | 'span';

/**
 * Known GenAI operation types from OpenTelemetry semantic conventions.
 * These values come from the gen_ai.operation.name attribute.
 */
const KNOWN_OPERATION_TYPES = ['invoke_agent', 'create_agent', 'chat', 'text_completion', 'execute_tool'] as const;

/**
 * GenAI operation type - derived from OTEL operation names plus 'unknown' fallback.
 */
export type GenAIOperationType = (typeof KNOWN_OPERATION_TYPES)[number] | 'unknown';

// Create Set for O(1) lookup performance
const KNOWN_OPERATION_TYPES_SET = new Set<string>(KNOWN_OPERATION_TYPES);

/**
 * Extract the GenAI operation type from the span's gen_ai.operation.name attribute.
 * This is the most reliable way to classify GenAI spans per OpenTelemetry semantic conventions.
 *
 * @param span The span to extract operation type from
 * @returns The GenAI operation type or 'unknown' if not found
 */
export const getSpanOperationType = (span: Span): GenAIOperationType => {
  const operationName = getAttributeFromSpan(span, 'gen_ai.operation.name');

  if (!operationName) {
    return 'unknown';
  }

  const normalized = String(operationName).toLowerCase();

  // Check if it's a known operation type
  if (KNOWN_OPERATION_TYPES_SET.has(normalized)) {
    return normalized as GenAIOperationType;
  }

  return 'unknown';
};

/**
 * Classify a span based on OpenTelemetry GenAI semantic convention attributes.
 * Uses a three-tier classification strategy:
 * 1. Operation name (gen_ai.operation.name) - most reliable
 * 2. Type-specific attributes (gen_ai.agent.*, gen_ai.tool.*, gen_ai.input.messages)
 * 3. Span name pattern matching - least reliable, only for legacy/non-instrumented spans
 *
 * @param span The span to classify
 * @returns The span kind ('agent', 'llm', 'tool', or generic 'span')
 */
export const getSpanKind = (span: Span): SpanKind => {
  // TIER 1: Use gen_ai.operation.name (most reliable)
  const opType = getSpanOperationType(span);
  if (opType === 'invoke_agent' || opType === 'create_agent') {
    return 'agent';
  }
  if (opType === 'chat' || opType === 'text_completion') {
    return 'llm';
  }
  if (opType === 'execute_tool') {
    return 'tool';
  }

  // TIER 2: Check type-specific attributes when operation.name is unavailable
  // 2a. Agent-specific attributes
  if (hasAttribute(span, 'gen_ai.agent.name') || hasAttribute(span, 'gen_ai.agent.id')) {
    return 'agent';
  }

  // 2b. Tool-specific attributes
  if (
    hasAttribute(span, 'gen_ai.tool.name') ||
    hasAttribute(span, 'gen_ai.tool.call.id') ||
    hasAttribute(span, 'gen_ai.tool.call.arguments')
  ) {
    return 'tool';
  }

  // 2c. LLM-specific attributes
  // Note: Must check for messages/prompt, not just gen_ai.request.model (agents can have that too)
  if (
    hasAttribute(span, 'gen_ai.input.messages') ||
    hasAttribute(span, 'gen_ai.prompt') ||
    hasAttribute(span, 'gen_ai.completion')
  ) {
    return 'llm';
  }

  // TIER 3: Span name pattern matching (least reliable - legacy/non-instrumented only)
  // Guard: Only use pattern matching if span has any gen_ai.* attribute
  // This prevents misclassifying non-GenAI spans that happen to have "gpt", "llm", etc. in their names
  const hasAnyGenAIAttribute = span.attributes?.some((attr) => attr.key.startsWith('gen_ai.')) ?? false;
  if (!hasAnyGenAIAttribute) {
    return 'span';
  }

  const name = span.name.toLowerCase();

  if (name.includes('invoke') && name.includes('agent')) {
    return 'agent';
  }

  if (
    name.includes('chat') ||
    name.includes('gpt') ||
    name.includes('llm') ||
    name.includes('claude') ||
    name.includes('gemini')
  ) {
    return 'llm';
  }

  if (name.includes('tool') || name.includes('execute')) {
    return 'tool';
  }

  if (name.includes('agent')) {
    return 'agent';
  }

  return 'span';
};

/**
 * Get the appropriate icon for a span kind
 *
 * @param kind The span kind
 * @returns Lucide icon component for the span kind
 */
export const getSpanKindIcon = (kind: SpanKind): LucideIcon => {
  switch (kind) {
    case 'agent':
      return Zap;
    case 'llm':
      return MessageSquare;
    case 'tool':
      return Wrench;
    default:
      return Database;
  }
};

/**
 * Get icon directly from span (convenience function)
 *
 * @param span The span to get icon for
 * @returns Lucide icon component for the span
 */
export const getSpanIcon = (span: Span): LucideIcon => getSpanKindIcon(getSpanKind(span));

/**
 * Get a service label from span for display purposes using OTel semantic conventions.
 * For LLM spans, uses gen_ai.system attribute. Falls back to span name pattern matching.
 *
 * @param span The span to extract service name from
 * @returns Service name label (e.g., 'openai', 'anthropic', 'google', 'agent', 'tool', 'service')
 */
export const getServiceName = (span: Span): string => {
  // For LLM spans, use the gen_ai.system attribute (OTel semantic convention)
  const genAiSystem = span.attributes?.find((attr) => attr.key === 'gen_ai.system')?.value;
  if (genAiSystem?.value?.case === 'stringValue') {
    return genAiSystem.value.value;
  }

  // For tool spans, check if it's a tool call
  if (hasAttribute(span, 'gen_ai.tool.name')) {
    return 'tool';
  }

  // Fallback to span name pattern matching for non-instrumented spans
  const name = span.name.toLowerCase();

  if (name.includes('grafana')) {
    return 'grafana';
  }
  if (name.includes('gpt') || name.includes('openai')) {
    return 'openai';
  }
  if (name.includes('claude') || name.includes('anthropic')) {
    return 'anthropic';
  }
  if (name.includes('gemini') || name.includes('google')) {
    return 'google';
  }
  if (name.includes('agent')) {
    return 'agent';
  }
  if (name.includes('tool')) {
    return 'tool';
  }

  return 'service';
};

/**
 * Get icon for a span based on its classification
 *
 * @param span The span to get icon for
 * @returns Lucide icon component
 */
export const getIconForServiceName = (span: Span): LucideIcon => {
  const serviceName = getServiceName(span);

  // Map service names to icons
  if (serviceName === 'agent') {
    return Cpu;
  }

  // For most services, use the span kind icon
  return getSpanIcon(span);
};

/**
 * Check if span is an agent invocation span.
 * Uses gen_ai.operation.name as primary signal, with fallback to agent-specific attributes.
 */
export const isAgentSpan = (span: Span): boolean => {
  const opType = getSpanOperationType(span);
  if (opType === 'invoke_agent' || opType === 'create_agent') {
    return true;
  }
  return hasAttribute(span, 'gen_ai.agent.name') || hasAttribute(span, 'gen_ai.agent.id');
};

/**
 * Check if span is a tool execution span.
 * Uses gen_ai.operation.name as primary signal, with fallback to tool-specific attributes.
 */
export const isToolSpan = (span: Span): boolean => {
  const opType = getSpanOperationType(span);
  if (opType === 'execute_tool') {
    return true;
  }
  return (
    hasAttribute(span, 'gen_ai.tool.name') ||
    hasAttribute(span, 'gen_ai.tool.call.id') ||
    hasAttribute(span, 'gen_ai.tool.call.arguments') ||
    hasAttribute(span, 'gen_ai.tool.call.result')
  );
};

/**
 * Check if span is an LLM/model interaction span.
 * CRITICAL: Excludes agent spans even if they have gen_ai.request.model.
 */
export const isLLMSpan = (span: Span): boolean => {
  const opType = getSpanOperationType(span);
  if (opType === 'chat' || opType === 'text_completion') {
    return true;
  }
  if (isAgentSpan(span)) {
    return false;
  }
  return (
    hasAttribute(span, 'gen_ai.input.messages') ||
    hasAttribute(span, 'gen_ai.prompt') ||
    hasAttribute(span, 'gen_ai.completion')
  );
};
