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

import type { LucideIcon } from 'lucide-react';
import { Cpu, Database, MessageSquare, Wrench, Zap } from 'lucide-react';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';

import { hasAttribute } from './attribute-helpers';

/**
 * Span classification types based on OpenTelemetry semantic conventions
 */
export type SpanKind = 'agent' | 'llm' | 'tool' | 'span';

/**
 * Classify a span based on OpenTelemetry GenAI semantic convention attributes.
 * Falls back to span name pattern matching if attributes are not present.
 *
 * @param span The span to classify
 * @returns The span kind ('agent', 'llm', 'tool', or generic 'span')
 */
export const getSpanKind = (span: Span): SpanKind => {
  // Check for LLM spans using gen_ai attributes (OTel semantic conventions)
  if (
    hasAttribute(span, 'gen_ai.request.model') ||
    hasAttribute(span, 'gen_ai.prompt') ||
    hasAttribute(span, 'gen_ai.completion') ||
    hasAttribute(span, 'gen_ai.system')
  ) {
    return 'llm';
  }

  // Check for tool spans using gen_ai.tool attributes
  if (
    hasAttribute(span, 'gen_ai.tool.name') ||
    hasAttribute(span, 'gen_ai.tool.call.id') ||
    hasAttribute(span, 'gen_ai.tool.call.arguments')
  ) {
    return 'tool';
  }

  // Fallback to span name pattern matching for non-instrumented spans
  const name = span.name.toLowerCase();

  // Agent invocations
  if (name.includes('invoke') && name.includes('agent')) {
    return 'agent';
  }

  // LLM calls (fallback pattern matching)
  if (
    name.includes('chat') ||
    name.includes('gpt') ||
    name.includes('llm') ||
    name.includes('claude') ||
    name.includes('gemini')
  ) {
    return 'llm';
  }

  // Tool executions (fallback)
  if (name.includes('tool') || name.includes('execute')) {
    return 'tool';
  }

  // Agent operations (more general)
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
