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

/**
 * Issue levels that represent warning or error states.
 * Used for filtering pipelines by issue severity.
 */
export const ISSUE_LEVELS = ['warning', 'error'] as const;
export type IssueLevel = (typeof ISSUE_LEVELS)[number];

/**
 * Human-readable labels for each pipeline state. Single source of truth for
 * state copy across the pipeline UI.
 */
export const PIPELINE_STATE_LABELS: Partial<Record<Pipeline_State, string>> = {
  [Pipeline_State.RUNNING]: 'Running',
  [Pipeline_State.STARTING]: 'Starting',
  [Pipeline_State.STOPPING]: 'Stopping',
  [Pipeline_State.STOPPED]: 'Stopped',
  [Pipeline_State.ERROR]: 'Error',
  [Pipeline_State.COMPLETED]: 'Completed',
};

/**
 * Pipeline state options for filtering.
 */
export const PIPELINE_STATE_OPTIONS = [
  Pipeline_State.RUNNING,
  Pipeline_State.STARTING,
  Pipeline_State.STOPPING,
  Pipeline_State.STOPPED,
  Pipeline_State.ERROR,
  Pipeline_State.COMPLETED,
].map((state) => ({ label: PIPELINE_STATE_LABELS[state] ?? 'Unknown', value: String(state) }));

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
export const STARTABLE_STATES = [Pipeline_State.STOPPED, Pipeline_State.ERROR, Pipeline_State.COMPLETED, Pipeline_State.STOPPING] as const;

/**
 * States where a pipeline can be stopped.
 */
export const STOPPABLE_STATES = [Pipeline_State.RUNNING, Pipeline_State.STARTING] as const;

/**
 * Transitional states where retry actions are available.
 */
export const TRANSITIONAL_STATES = [Pipeline_State.STARTING, Pipeline_State.STOPPING] as const;
