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
 * What a save should do with the pipeline's run state.
 *
 * The dataplane has no "create stopped" — CreatePipeline always transitions to STARTING — so
 * `stopped` is create-then-stop, and the pipeline is briefly STARTING in between. UpdatePipeline
 * already preserves run state (a running pipeline restarts with the new config, a stopped one stays
 * stopped), so `keep` issues no extra call.
 */
export type SaveRunIntent = 'keep' | 'start' | 'stopped';

/** Only ever a local draft — never touches the server. */
export type SaveTarget = 'server' | 'draft';

export type SaveIntent = { target: SaveTarget; run: SaveRunIntent };

/**
 * True when the failure means "this config isn't deployable yet" rather than a transport, auth or
 * naming problem. Those are the failures worth keeping as a draft instead of discarding the work.
 *
 * The dataplane answers an unlintable config with `invalid_argument` plus either LintHint details or
 * `REASON_CONNECT_INVALID_PIPELINE_CONFIGURATION`. A duplicate name (`already_exists`) or a bad
 * field (`google.rpc.BadRequest` on displayName) is a different class of problem and must surface as
 * an error the user fixes now.
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

export const isStartableState = (state: Pipeline_State | undefined): boolean =>
  state !== undefined && (STARTABLE_STATES as readonly Pipeline_State[]).includes(state);

export const isStoppableState = (state: Pipeline_State | undefined): boolean =>
  state !== undefined && (STOPPABLE_STATES as readonly Pipeline_State[]).includes(state);

/**
 * The alternate run action offered next to Save, or null when there isn't a sensible one.
 * Create and stopped pipelines can be deployed straight into a run; running ones can be taken down
 * with the same click that applies the config.
 */
export function alternateRunIntent(mode: 'create' | 'edit', state: Pipeline_State | undefined): SaveRunIntent | null {
  if (mode === 'create') {
    return 'start';
  }
  if (isStoppableState(state)) {
    return 'stopped';
  }
  if (isStartableState(state)) {
    return 'start';
  }
  return null;
}

export const RUN_INTENT_LABELS: Record<SaveRunIntent, string> = {
  keep: 'Save',
  start: 'Save and start',
  stopped: 'Save and stop',
};

/** Copy for the create-mode primary action, which saves without starting the pipeline. */
export const CREATE_SAVE_LABEL = 'Save';

/**
 * One-line explanation of what the primary Save will do to the pipeline's run state, shown beside
 * the button so the outcome is never a surprise — restarting a live pipeline drops in-flight
 * messages, and a stopped one silently staying stopped confuses just as much.
 */
export function saveRunHint(mode: 'create' | 'edit', state: Pipeline_State | undefined): string | null {
  if (mode === 'create') {
    // Present tense: this describes what the button will do. Past tense ("Saved without starting")
    // reads as a confirmation, and sits there claiming success even when the save has just failed.
    return "Saving won't start the pipeline";
  }
  if (state === Pipeline_State.RUNNING || state === Pipeline_State.STARTING) {
    return 'Saving restarts the running pipeline';
  }
  if (isStartableState(state)) {
    return "Pipeline is stopped — saving won't start it";
  }
  return null;
}

/**
 * An empty config never reaches lint: buf validation rejects `config_yaml` as required first, and that
 * surfaces as `request.pipeline.config_yaml: value is required` — a proto path the user can do nothing
 * with. Catch it before the request and say what's actually missing. There is also nothing to keep as
 * a draft in this case, so blocking loses no work: the settings stay in the editor either way.
 */
export const isBlankConfig = (configYaml: string): boolean => configYaml.trim().length === 0;

export const BLANK_CONFIG_MESSAGE = 'Add an input and an output before saving.';

/**
 * Announces the drafts the browser dropped to stay under its cap. Eviction is real data loss, so it
 * can't be silent — the user is the only one who can tell whether that draft still mattered.
 */
export function draftEvictionMessage(evictedNames: string[], cap: number): string {
  if (evictedNames.length === 1) {
    const name = evictedNames[0]?.trim() || 'Untitled pipeline';
    return `Removed your oldest draft ("${name}") — this browser keeps ${cap}.`;
  }
  return `Removed your ${evictedNames.length} oldest drafts — this browser keeps ${cap}.`;
}

/** Toast copy for a successful server save, given what it did with the run state. */
export function saveSuccessMessage(mode: 'create' | 'edit', run: SaveRunIntent, wasRunning: boolean): string {
  if (mode === 'create') {
    return run === 'start' ? 'Pipeline created and starting' : 'Pipeline created — it is not running yet';
  }
  if (run === 'start') {
    return 'Pipeline updated and starting';
  }
  if (run === 'stopped') {
    return 'Pipeline updated and stopping';
  }
  return wasRunning ? 'Pipeline updated — restarting with the new config' : 'Pipeline updated';
}
