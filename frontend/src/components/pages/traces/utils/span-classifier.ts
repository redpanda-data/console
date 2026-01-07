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

/**
 * Span classification types based on span name patterns
 */
export type SpanKind = 'agent' | 'llm' | 'tool' | 'span';

/**
 * Classify a span based on its name using pattern matching.
 * This provides a consistent classification across the application.
 *
 * @param spanName The name of the span to classify
 * @returns The span kind ('agent', 'llm', 'tool', or generic 'span')
 */
export const getSpanKind = (spanName: string): SpanKind => {
  const name = spanName.toLowerCase();

  // Agent invocations
  if (name.includes('invoke') && name.includes('agent')) {
    return 'agent';
  }

  // LLM calls (various providers)
  if (
    name.includes('chat') ||
    name.includes('gpt') ||
    name.includes('llm') ||
    name.includes('claude') ||
    name.includes('gemini')
  ) {
    return 'llm';
  }

  // Tool executions
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
 * Get icon directly from span name (convenience function)
 *
 * @param spanName The name of the span
 * @returns Lucide icon component for the span
 */
export const getSpanIcon = (spanName: string): LucideIcon => getSpanKindIcon(getSpanKind(spanName));

/**
 * Get a service label from span name for display purposes
 *
 * @param spanName The name of the span
 * @returns Service name label (e.g., 'grafana', 'gpt', 'claude', 'agent', 'service')
 */
export const getServiceName = (spanName: string): string => {
  const name = spanName.toLowerCase();

  if (name.includes('grafana')) {
    return 'grafana';
  }
  if (name.includes('gpt')) {
    return 'gpt';
  }
  if (name.includes('claude')) {
    return 'claude';
  }
  if (name.includes('gemini')) {
    return 'gemini';
  }
  if (name.includes('agent')) {
    return 'agent';
  }

  return 'service';
};

/**
 * Get icon for a specific service name pattern (for backward compatibility)
 *
 * @param spanName The name of the span
 * @returns Lucide icon component
 */
export const getIconForServiceName = (spanName: string): LucideIcon => {
  const serviceName = getServiceName(spanName);

  // Map service names to icons
  if (serviceName === 'agent') {
    return Cpu;
  }

  // For most services, use the span kind icon
  return getSpanIcon(spanName);
};
