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

/**
 * One place for the words "draft" appears in, so the list, the editor header and the recovery notice
 * can't drift into describing the same object three different ways.
 */

/** Drafts need the server-side `STATE_DRAFT` support, so they roll out behind a flag. */
export const areDraftsEnabled = (): boolean => isFeatureFlagEnabled('enableRpcnPipelineDrafts');

export const isDraft = (pipeline: { state?: Pipeline_State } | undefined): boolean =>
  pipeline?.state === Pipeline_State.DRAFT;

export const DRAFT_BADGE_TOOLTIP = 'Saved but never deployed — it uses no compute and processes no data';

/** Name used when a draft is saved with the name field left empty, so saving never stops to ask. */
export const UNTITLED_PIPELINE_NAME = 'Untitled pipeline';

/**
 * A draft has to be named (`display_name` is required, min 3 characters), but making the user think of
 * one before their work can be parked defeats the point. Numbered against the names already taken so
 * two parked drafts are still tellable apart.
 */
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
  // Pathological: a thousand untitled drafts. A timestamp is ugly but unique, and still a legal
  // display name (digits and spaces only).
  return `${UNTITLED_PIPELINE_NAME} ${Date.now()}`;
}

/** "5m ago" — same phrasing the rest of Console uses for recent timestamps. */
export const relativeAgeLabel = (at: number, now: number = Date.now()): string => {
  const elapsed = now - at;
  if (elapsed < 60_000) {
    return 'just now';
  }
  return `${prettyMilliseconds(elapsed, { compact: true })} ago`;
};

/** Millisecond epoch of a proto timestamp, for comparing against a local buffer's `updatedAt`. */
export const timestampToMillis = (timestamp: Pipeline['updateTime']): number | null =>
  timestamp ? Number(timestamp.seconds) * 1000 + Math.floor(timestamp.nanos / 1_000_000) : null;

/**
 * Why a start was refused, in the words of the thing the user has to go and fix. The count matters:
 * "some issues" sends people hunting, "3 issues" tells them when they're done.
 */
export function startBlockedMessage(issueCount: number): string {
  if (issueCount === 1) {
    return "This draft has 1 issue to fix before it can start. We've opened the editor on it.";
  }
  if (issueCount > 1) {
    return `This draft has ${issueCount} issues to fix before it can start. We've opened the editor on them.`;
  }
  return "This draft isn't valid yet, so it can't start. We've opened the editor so you can fix it.";
}

/** Shown under the editor header while a draft has outstanding lint issues. */
export function draftIssueSummary(issueCount: number): string | null {
  if (issueCount <= 0) {
    return null;
  }
  return issueCount === 1
    ? '1 issue to fix before this can start'
    : `${issueCount} issues to fix before this can start`;
}
