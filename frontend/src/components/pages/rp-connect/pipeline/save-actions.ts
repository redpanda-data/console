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
   * Suppresses the editor's own post-save navigation. Set when the save was triggered by the
   * leave-without-saving dialog, which resumes the navigation the user actually asked for — two
   * navigations would flash a route nobody chose.
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
 * True when the failure means "this config isn't deployable yet" rather than a transport, auth or
 * naming problem.
 *
 * The dataplane answers an unlintable config with `invalid_argument` plus either LintHint details or
 * `REASON_CONNECT_INVALID_PIPELINE_CONFIGURATION` — the latter also covers a missing configuration. A
 * duplicate name (`already_exists`) or a bad field (`google.rpc.BadRequest` on displayName) is a
 * different class of problem and must surface as an error the user fixes now.
 */
const LINT_HINT_TYPE = 'redpanda.api.common.v1.LintHint';
const ERROR_INFO_TYPE = 'google.rpc.ErrorInfo';
const INVALID_CONFIG_REASON = 'REASON_CONNECT_INVALID_PIPELINE_CONFIGURATION';

/**
 * ConnectError details come in two shapes: decoded from the wire (`type` + `debug`) or attached
 * locally as `{ desc, value }`. Both appear in practice — the latter when an error is constructed in
 * process — so read whichever is present.
 */
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
 * The primary save action for a context, and the alternates that go in the split menu.
 *
 * The rules, in one place because the copy and the behaviour have to agree:
 *
 * - Nothing deployed yet (new pipeline or draft) → **Save draft**. It is the only action that always
 *   succeeds, and it starts nothing. A primary button that fails on unfinished input teaches people
 *   not to press it, which is how work gets lost.
 * - Deployed and stopped → **Save**, which applies the configuration and leaves it stopped.
 * - Deployed and running → **Apply and restart**. Saying "Save" would hide the restart, and there is
 *   no pending-revision support to make it untrue.
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
      // Creating always writes before it can stop, so there is no "and stop" to announce — the
      // pipeline simply never runs. Editing a running one does stop it, and says so.
      return context.mode === 'create' ? 'Save' : 'Save and stop';
    default:
      return isStoppableState(context.state) ? 'Apply and restart' : 'Save';
  }
}

/**
 * One-line explanation of what the primary action will do, shown beside the button so the outcome is
 * never a surprise — restarting a live pipeline drops in-flight messages, and a stopped one silently
 * staying stopped confuses just as much.
 */
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

/**
 * An empty config can be parked as a draft, but nothing else: `Save and start` on an empty editor
 * would round-trip to the server only to be told there is no pipeline to run. Blocking here loses
 * nothing, since the primary action is Save draft.
 */
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
 * Copy for the unsaved-changes dialog, which offers a different escape depending on what is open.
 *
 * Where no draft can be offered, it says the edits are kept in this browser rather than implying they
 * are gone: the editor autosaves a recovery buffer, and telling someone their work is lost while
 * quietly keeping it is the same class of lie as the reverse.
 */
export function unsavedChangesCopy(context: SaveContext): { body: string; canSaveDraft: boolean } {
  if (isUndeployed(context) && context.draftsEnabled) {
    return {
      body: 'You have unsaved changes. Save them as a draft to pick up later, or leave and lose them.',
      canSaveDraft: true,
    };
  }
  if (isStoppableState(context.state)) {
    return {
      body: 'You have unsaved changes to this pipeline. Saving them would restart it, so they stay unapplied — this browser keeps them, and offers them back next time you open the editor.',
      canSaveDraft: false,
    };
  }
  return {
    body: 'You have unsaved changes to this pipeline. They stay unapplied — this browser keeps them, and offers them back next time you open the editor.',
    canSaveDraft: false,
  };
}
