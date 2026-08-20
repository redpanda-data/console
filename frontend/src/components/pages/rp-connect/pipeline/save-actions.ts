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

/**
 * What a save does, beyond writing the configuration.
 *
 * - `draft`   — save without deploying. The configuration is stored as typed, valid or not.
 * - `keep`    — write the configuration and leave the run state alone. On a running pipeline the
 *               dataplane rolls it, so this restarts it; there is no apply-later.
 * - `start`   — write, then run. For a draft this is promotion, which validates first.
 * - `stopped` — write, then stop.
 */
export type SaveRunIntent = 'draft' | 'keep' | 'start' | 'stopped';

export type SaveIntent = {
  run: SaveRunIntent;
  /**
   * Suppresses the editor's own post-save navigation, for the leave-without-saving dialog: it resumes
   * the navigation itself, and two would flash a route nobody chose.
   */
  skipNavigation?: boolean;
};

/** Editor context that decides which actions make sense. */
export type SaveContext = {
  mode: 'create' | 'edit';
  /** Absent while creating. */
  state?: Pipeline_State;
  /** False when the dataplane has no draft support, so drafts must not be offered. */
  draftsEnabled: boolean;
};

/**
 * "This config isn't deployable yet", rather than a transport, auth or naming problem. The dataplane
 * answers an unlintable config with `invalid_argument` plus LintHint details or
 * `REASON_CONNECT_INVALID_PIPELINE_CONFIGURATION`; a duplicate name or bad field is a different class.
 */
const LINT_HINT_TYPE = 'redpanda.api.common.v1.LintHint';
const ERROR_INFO_TYPE = 'google.rpc.ErrorInfo';
const INVALID_CONFIG_REASON = 'REASON_CONNECT_INVALID_PIPELINE_CONFIGURATION';

/** Details arrive decoded from the wire (`type` + `debug`) or attached locally as `{ desc, value }`. */
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

/**
 * True when someone else started the draft while it was being edited. The service refuses the update
 * rather than applying it to a pipeline that is now running.
 */
export const isNoLongerDraftError = (error: unknown): boolean =>
  error instanceof ConnectError && error.code === Code.FailedPrecondition;

export const NO_LONGER_DRAFT_MESSAGE =
  'This pipeline has been started since you opened it, so it is no longer a draft. Reload to see the running configuration before saving.';

export const isStartableState = (state: Pipeline_State | undefined): boolean =>
  state !== undefined && (STARTABLE_STATES as readonly Pipeline_State[]).includes(state);

export const isStoppableState = (state: Pipeline_State | undefined): boolean =>
  state !== undefined && (STOPPABLE_STATES as readonly Pipeline_State[]).includes(state);

const isDraftState = (state: Pipeline_State | undefined): boolean => state === Pipeline_State.DRAFT;

/** Is this editor working on something that has never been deployed? */
export const isUndeployed = (context: SaveContext): boolean => context.mode === 'create' || isDraftState(context.state);

/**
 * The primary save action, in one place because the copy and the behaviour have to agree.
 *
 * - Nothing deployed yet → **Save draft**: the only action that always succeeds, and it starts nothing.
 * - Deployed and stopped → **Save**, which applies and leaves it stopped.
 * - Deployed and running → **Apply and restart**, because "Save" would hide the restart.
 */
export function primaryRunIntent(context: SaveContext): SaveRunIntent {
  if (isUndeployed(context) && context.draftsEnabled) {
    return 'draft';
  }
  // Without draft support a new pipeline is deployed stopped, which is the closest thing to parking it.
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

/**
 * Button copy per intent and context. A running pipeline's labels say "restart" out loud, because that
 * is what applying a configuration to it does.
 */
export function runIntentLabel(intent: SaveRunIntent, context: SaveContext): string {
  switch (intent) {
    case 'draft':
      return 'Save draft';
    case 'start':
      return 'Save and start';
    case 'stopped':
      // Creating never runs it, so there is no "and stop" to announce. Editing a running one does.
      return context.mode === 'create' ? 'Save' : 'Save and stop';
    default:
      return isStoppableState(context.state) ? 'Apply and restart' : 'Save';
  }
}

/** Shown beside the button, so neither a restart nor a pipeline staying stopped is a surprise. */
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

/** An empty config can be parked as a draft, but not started — blocked here to save the round trip. */
export const isBlankConfig = (configYaml: string): boolean => configYaml.trim().length === 0;

export const BLANK_CONFIG_MESSAGE = 'Add an input and an output before starting this pipeline.';

/** Toast copy for a successful save, given what it did with the run state. */
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

/**
 * The way out of the leave-without-saving dialog that keeps the work.
 *
 * - `save-draft`  — park it server-side. Strictly better than the browser: a teammate can pick it up,
 *                   and it survives this profile. Only possible before a pipeline has ever deployed.
 * - `leave-for-now` — keep it in this browser's recovery buffer, which is all that is left once a
 *                   pipeline is deployed. Named as a choice rather than left as a hidden mechanism:
 *                   with only Discard and Keep editing on offer, someone with real work and no way to
 *                   save it has to either sit on the page forever or close the tab to save their
 *                   changes from the app's own dialog. Closing the tab should not be the safe move.
 */
export type UnsavedChangesEscape = 'save-draft' | 'leave-for-now';

/**
 * Says why the work cannot simply be saved here, and what the primary button will do instead. The
 * promise that the browser keeps the edits belongs to `leave-for-now` alone — Discard clears the buffer,
 * so a dialog-wide promise would be false for one of its own buttons.
 */
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
