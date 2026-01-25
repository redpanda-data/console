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

import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

// Re-export log-related constants from ui/logs for backward compatibility
export { LOG_LEVELS, LOG_PATH_INPUT, LOG_PATH_OUTPUT, type LogLevel } from '../logs';

/**
 * Issue levels that represent warning or error states.
 * Used for filtering pipelines by issue severity.
 */
export const ISSUE_LEVELS = ['warning', 'error'] as const;
export type IssueLevel = (typeof ISSUE_LEVELS)[number];

/**
 * Pipeline state options for filtering.
 * Maps Pipeline_State enum to human-readable labels.
 */
export const PIPELINE_STATE_OPTIONS = [
  { label: 'Running', value: String(Pipeline_State.RUNNING) },
  { label: 'Starting', value: String(Pipeline_State.STARTING) },
  { label: 'Stopping', value: String(Pipeline_State.STOPPING) },
  { label: 'Stopped', value: String(Pipeline_State.STOPPED) },
  { label: 'Error', value: String(Pipeline_State.ERROR) },
  { label: 'Completed', value: String(Pipeline_State.COMPLETED) },
] as const;

/**
 * Issue filter options for filtering pipelines by log severity.
 */
export const ISSUE_FILTER_OPTIONS = [
  { label: 'Error', value: 'error' as IssueLevel },
  { label: 'Warning', value: 'warning' as IssueLevel },
] as const;

/**
 * States where a pipeline can be started.
 */
export const STARTABLE_STATES = [Pipeline_State.STOPPED, Pipeline_State.ERROR, Pipeline_State.COMPLETED] as const;

/**
 * States where a pipeline can be stopped.
 */
export const STOPPABLE_STATES = [Pipeline_State.RUNNING, Pipeline_State.STARTING] as const;
