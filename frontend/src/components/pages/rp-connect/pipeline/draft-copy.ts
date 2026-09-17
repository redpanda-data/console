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
import { pluralize } from 'utils/string';
import { prettyMilliseconds } from 'utils/utils';

export const areDraftsEnabled = (): boolean => isFeatureFlagEnabled('enableRpcnPipelineDrafts');

export const isDraft = (pipeline: { state?: Pipeline_State } | undefined): boolean =>
  pipeline?.state === Pipeline_State.DRAFT;

export const DRAFT_BADGE_TOOLTIP =
  "Saved but never deployed — it uses no compute and processes no data. It still counts against the cluster's pipeline limit. Starting it makes it a regular pipeline.";

/** The editor stopped what it could not park. The stop does not undo what already ran. */
export const DRAFT_UNSUPPORTED_STOPPED_MESSAGE =
  'Drafts are not available on this cluster yet, so the pipeline was deployed and then stopped again. It may have processed messages while it ran — check its output topics before starting it again.';

/** The same, when the follow-up stop never landed: the pipeline is live and only a human can park it. */
export const DRAFT_UNSUPPORTED_MESSAGE =
  'Drafts are not available on this cluster yet, so the pipeline was created and is starting. It could not be stopped automatically — stop it from its page if you did not mean to deploy it.';

export const DRAFT_UPDATE_UNSUPPORTED_MESSAGE =
  'Drafts are not available on this cluster yet, so this pipeline is no longer a draft. Check its state on its page before starting it.';

export const DRAFT_VIEW_NOTICE_TITLE = 'This pipeline is a draft';

export const DRAFT_VIEW_NOTICE_BODY =
  "It has never run, so it costs nothing and there's nothing to monitor yet. Starting it checks the configuration, then deploys it for real.";

export const UNTITLED_PIPELINE_NAME = 'Untitled pipeline';

export const NOTHING_TO_SAVE_MESSAGE = 'Nothing to save yet — add a name or some configuration first.';

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
  if (issueCount > 0) {
    const issues = issueCount === 1 ? '1 issue' : `${issueCount} issues`;
    return `${issues} to fix before this draft can start — opening the editor.`;
  }
  return "This draft isn't valid yet, so it can't start — opening the editor.";
}

export function draftIssueSummary(issueCount: number): string | null {
  if (issueCount <= 0) {
    return null;
  }
  return issueCount === 1 ? '1 issue to fix' : `${issueCount} issues to fix`;
}

export const START_DRAFT_CONFIRM_TITLE = 'Start pipeline?';

export const START_DRAFT_CONFIRM_IRREVERSIBLE =
  "It becomes a regular pipeline — you can stop it, but it can't go back to being a draft.";

const MAX_LISTED_TOPICS = 3;

/** "a", "a and b", "a, b and c", "a, b, c and 2 more". */
export function formatTopicList(topics: string[]): string {
  if (topics.length > MAX_LISTED_TOPICS) {
    return `${topics.slice(0, MAX_LISTED_TOPICS).join(', ')} and ${topics.length - MAX_LISTED_TOPICS} more`;
  }
  if (topics.length < 2) {
    return topics[0] ?? '';
  }
  return `${topics.slice(0, -1).join(', ')} and ${topics.at(-1)}`;
}

export function startDraftConfirmBody(topics: string[], computeUnits: number): string {
  // No topics: the clause goes rather than reading "through  and uses".
  const through = topics.length > 0 ? ` through ${formatTopicList(topics)}` : '';
  return `Starting checks the configuration, then deploys the pipeline for real. It begins processing data${through} and uses ${computeUnits} compute ${pluralize(computeUnits, 'unit')}.`;
}
