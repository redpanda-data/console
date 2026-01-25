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

// Re-export LOG_LEVELS and LogLevel from types for convenience
export { LOG_LEVELS, type LogLevel, DEFAULT_LEVEL_OPTIONS } from './types';

/**
 * Common log path prefixes.
 * These are examples - consumers can define their own paths.
 */
export const LOG_PATH_INPUT = 'root.input';
export const LOG_PATH_OUTPUT = 'root.output';
export const LOG_PATH_ROOT = 'root';

/**
 * Default scopes for log filtering.
 * Consumers can override these with their own scope options.
 */
export const DEFAULT_SCOPE_OPTIONS = [
  { value: 'root', label: 'Root' },
  { value: 'input', label: 'Input' },
  { value: 'output', label: 'Output' },
] as const;

export type DefaultLogScope = (typeof DEFAULT_SCOPE_OPTIONS)[number]['value'];
