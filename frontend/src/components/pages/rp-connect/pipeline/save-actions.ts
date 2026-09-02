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

import { Code, ConnectError } from '@connectrpc/connect';
import { STARTABLE_STATES, STOPPABLE_STATES } from 'components/ui/pipeline/constants';
import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

/** `draft` stores unvalidated; `keep` leaves the run state (restarts a running pipeline); `start`/`stopped` transition after the write. */
export type SaveRunIntent = 'draft' | 'keep' | 'start' | 'stopped';

export type SaveIntent = {
  run: SaveRunIntent;
  /** The leave dialog resumes its own navigation. */
  skipNavigation?: boolean;
};

export type SaveContext = {
  mode: 'create' | 'edit';
  state?: Pipeline_State;
  draftsEnabled: boolean;
};

const LINT_HINT_TYPE = 'redpanda.api.common.v1.LintHint';
const ERROR_INFO_TYPE = 'google.rpc.ErrorInfo';
const INVALID_CONFIG_REASON = 'REASON_CONNECT_INVALID_PIPELINE_CONFIGURATION';

// Wire details are `{ type, debug }`; locally attached ones are `{ desc, value }`.
function detailTypeAndPayload(detail: unknown): { typeName: string; payload: unknown } | null {
  if (detail === null || typeof detail !== 'object') {
    return null;
  }
  const incoming = detail as { type?: string; debug?: unknown };
  if (typeof incoming.type === 'string') {
    return { typeName: incoming.type, payload: incoming.debug };
  }
  const outgoing = detail as { desc?: { typeName?: string }; value?: unknown };
  if (typeof outgoing.desc?.typeName === 'string') {
    return { typeName: outgoing.desc.typeName, payload: outgoing.value };
  }
  return null;
}

export function isInvalidConfigError(error: unknown): boolean {
  if (!(error instanceof ConnectError) || error.code !== Code.InvalidArgument) {
    return false;
  }
  return error.details.some((detail) => {
    const parsed = detailTypeAndPayload(detail);
    if (!parsed) {
      return false;
    }
    if (parsed.typeName === LINT_HINT_TYPE) {
      return true;
    }
    if (parsed.typeName !== ERROR_INFO_TYPE) {
      return false;
    }
    return (parsed.payload as { reason?: string } | undefined)?.reason === INVALID_CONFIG_REASON;
  });
}

/** The service refuses a `draft: true` update once the pipeline has been started. */
export const isNoLongerDraftError = (error: unknown): boolean =>
  error instanceof ConnectError && error.code === Code.FailedPrecondition;

export const NO_LONGER_DRAFT_MESSAGE =
  'This pipeline has been started since you opened it, so it is no longer a draft. Reload to see the running configuration before saving.';

export const isStartableState = (state: Pipeline_State | undefined): boolean =>
  state !== undefined && (STARTABLE_STATES as readonly Pipeline_State[]).includes(state);

export const isStoppableState = (state: Pipeline_State | undefined): boolean =>
  state !== undefined && (STOPPABLE_STATES as readonly Pipeline_State[]).includes(state);

const isDraftState = (state: Pipeline_State | undefined): boolean => state === Pipeline_State.DRAFT;

export const isUndeployed = (context: SaveContext): boolean => context.mode === 'create' || isDraftState(context.state);

export function primaryRunIntent(context: SaveContext): SaveRunIntent {
  if (isUndeployed(context) && context.draftsEnabled) {
    return 'draft';
  }
  // Without draft support a new pipeline is deployed stopped.
  if (context.mode === 'create') {
    return 'stopped';
  }
  return 'keep';
}

export function alternateRunIntents(context: SaveContext): SaveRunIntent[] {
  if (isUndeployed(context)) {
    return ['start'];
  }
  if (isStoppableState(context.state)) {
    return ['stopped'];
  }
  if (isStartableState(context.state)) {
    return ['start'];
  }
  return [];
}

export function runIntentLabel(intent: SaveRunIntent, context: SaveContext): string {
  switch (intent) {
    case 'draft':
      return 'Save draft';
    case 'start':
      return 'Save and start';
    case 'stopped':
      return context.mode === 'create' ? 'Save' : 'Save and stop';
    default:
      return isStoppableState(context.state) ? 'Apply and restart' : 'Save';
  }
}

export function saveRunHint(context: SaveContext): string | null {
  const intent = primaryRunIntent(context);
  if (intent === 'draft') {
    return context.mode === 'create' ? "Saving won't start the pipeline" : "Saving keeps it a draft — it won't start";
  }
  if (intent === 'stopped') {
    return "Saving won't start the pipeline";
  }
  if (isStoppableState(context.state)) {
    return 'Saving restarts the running pipeline';
  }
  if (isStartableState(context.state)) {
    return "Pipeline is stopped — saving won't start it";
  }
  return null;
}

export const isBlankConfig = (configYaml: string): boolean => configYaml.trim().length === 0;

export const BLANK_CONFIG_MESSAGE = 'Add an input and an output before starting this pipeline.';

export function saveSuccessMessage(context: SaveContext, run: SaveRunIntent): string {
  const isCreate = context.mode === 'create';
  if (run === 'draft') {
    return isCreate ? "Draft saved. It isn't running yet." : 'Draft saved';
  }
  if (run === 'start') {
    return isCreate ? 'Pipeline created and starting' : 'Pipeline starting with the new configuration';
  }
  if (run === 'stopped') {
    return isCreate ? 'Pipeline created — it is not running yet' : 'Pipeline updated and stopping';
  }
  if (isCreate) {
    return 'Pipeline created';
  }
  return isStoppableState(context.state)
    ? 'Pipeline updated — restarting with the new configuration'
    : 'Pipeline updated';
}

/** The leave dialog's exit that keeps the work: a server-side draft, or this browser's recovery buffer. */
export type UnsavedChangesEscape = 'save-draft' | 'leave-for-now';

export function unsavedChangesCopy(context: SaveContext): { body: string; escape: UnsavedChangesEscape } {
  if (isUndeployed(context) && context.draftsEnabled) {
    return {
      body: 'Save them as a draft to come back to. A draft does not run, uses no compute and can be started when it is ready.',
      escape: 'save-draft',
    };
  }
  if (context.mode === 'create') {
    return {
      body: 'Saving them creates the pipeline without starting it. Keep editing to save, or leave for now — this browser keeps your edits and offers them back next time.',
      escape: 'leave-for-now',
    };
  }
  if (isStoppableState(context.state)) {
    return {
      body: 'The only way to save them is to apply them, which restarts this pipeline and drops in-flight messages. Leave for now instead and this browser keeps your edits, ready when you come back to this editor.',
      escape: 'leave-for-now',
    };
  }
  return {
    body: 'This pipeline is stopped, so saving them is safe and leaves it stopped. Keep editing to save, or leave for now — this browser keeps your edits and offers them back next time.',
    escape: 'leave-for-now',
  };
}
