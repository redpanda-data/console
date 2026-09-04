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

import { isFeatureFlagEnabled } from 'config';
import { type Pipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { prettyMilliseconds } from 'utils/utils';

export const areDraftsEnabled = (): boolean => isFeatureFlagEnabled('enableRpcnPipelineDrafts');

export const isDraft = (pipeline: { state?: Pipeline_State } | undefined): boolean =>
  pipeline?.state === Pipeline_State.DRAFT;

export const DRAFT_BADGE_TOOLTIP =
  'Saved but never deployed — it uses no compute and processes no data. Starting it makes it a regular pipeline.';

/** A pre-drafts proxy drops `draft` silently (Connect JSON discards unknown fields) and deploys for real. */
export const DRAFT_UNSUPPORTED_MESSAGE =
  'Drafts are not available on this cluster yet, so the pipeline was created and is starting. Stop it from its page if you did not mean to deploy it.';

export const DRAFT_UPDATE_UNSUPPORTED_MESSAGE =
  'Drafts are not available on this cluster yet, so this pipeline is no longer a draft. Check its state on its page before starting it.';

export const UNTITLED_PIPELINE_NAME = 'Untitled pipeline';

export const NOTHING_TO_SAVE_MESSAGE =
  "There's nothing to save yet. Add some configuration, or a name if you want somewhere to come back to.";

/** `display_name` is required (min 3 chars); numbered past the names already taken. */
export function untitledPipelineName(existingNames: Iterable<string>): string {
  const taken = new Set<string>();
  for (const name of existingNames) {
    taken.add(name.trim().toLowerCase());
  }
  if (!taken.has(UNTITLED_PIPELINE_NAME.toLowerCase())) {
    return UNTITLED_PIPELINE_NAME;
  }
  for (let n = 2; n < 1000; n++) {
    const candidate = `${UNTITLED_PIPELINE_NAME} ${n}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return `${UNTITLED_PIPELINE_NAME} ${Date.now()}`;
}

export const relativeAgeLabel = (at: number, now: number = Date.now()): string => {
  const elapsed = now - at;
  if (elapsed < 60_000) {
    return 'just now';
  }
  return `${prettyMilliseconds(elapsed, { compact: true })} ago`;
};

export const timestampToMillis = (timestamp: Pipeline['updateTime']): number | null =>
  timestamp ? Number(timestamp.seconds) * 1000 + Math.floor(timestamp.nanos / 1_000_000) : null;

export function startBlockedMessage(issueCount: number): string {
  if (issueCount === 1) {
    return "This draft has 1 issue to fix before it can start. We've opened the editor on it.";
  }
  if (issueCount > 1) {
    return `This draft has ${issueCount} issues to fix before it can start. We've opened the editor on them.`;
  }
  return "This draft isn't valid yet, so it can't start. We've opened the editor so you can fix it.";
}

export function draftIssueSummary(issueCount: number): string | null {
  if (issueCount <= 0) {
    return null;
  }
  return issueCount === 1 ? '1 issue to fix' : `${issueCount} issues to fix`;
}
