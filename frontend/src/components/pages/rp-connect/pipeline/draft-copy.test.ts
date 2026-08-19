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

import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Pipeline_State, PipelineSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { describe, expect, it } from 'vitest';

import {
  draftIssueSummary,
  isDraft,
  relativeAgeLabel,
  startBlockedMessage,
  timestampToMillis,
  UNTITLED_PIPELINE_NAME,
  untitledPipelineName,
} from './draft-copy';

describe('isDraft', () => {
  it('recognises the draft state and nothing else', () => {
    expect(isDraft(create(PipelineSchema, { state: Pipeline_State.DRAFT }))).toBe(true);
    expect(isDraft(create(PipelineSchema, { state: Pipeline_State.STOPPED }))).toBe(false);
    expect(isDraft(undefined)).toBe(false);
    expect(isDraft({})).toBe(false);
  });
});

describe('untitledPipelineName', () => {
  // A draft has to be named, but making the user think of one before their work can be parked
  // defeats the point.
  it('uses the plain name when it is free', () => {
    expect(untitledPipelineName([])).toBe(UNTITLED_PIPELINE_NAME);
    expect(untitledPipelineName(['orders-enrichment'])).toBe(UNTITLED_PIPELINE_NAME);
  });

  it('numbers past the names already taken', () => {
    expect(untitledPipelineName([UNTITLED_PIPELINE_NAME])).toBe('Untitled pipeline 2');
    expect(untitledPipelineName([UNTITLED_PIPELINE_NAME, 'Untitled pipeline 2'])).toBe('Untitled pipeline 3');
    // A gap is fine to fill: the number distinguishes, it doesn't count.
    expect(untitledPipelineName([UNTITLED_PIPELINE_NAME, 'Untitled pipeline 3'])).toBe('Untitled pipeline 2');
  });

  it('ignores case and surrounding space, as a collision would', () => {
    expect(untitledPipelineName(['  untitled PIPELINE  '])).toBe('Untitled pipeline 2');
  });

  it('always returns a legal display name', () => {
    const namePattern = /^[A-Za-z0-9-_ /]+$/;
    const taken = [UNTITLED_PIPELINE_NAME, ...Array.from({ length: 1200 }, (_, i) => `Untitled pipeline ${i + 2}`)];
    const name = untitledPipelineName(taken);
    expect(name).toMatch(namePattern);
    expect(name.length).toBeGreaterThanOrEqual(3);
  });
});

describe('relativeAgeLabel', () => {
  const now = new Date('2026-08-14T12:00:00Z').getTime();

  it('says "just now" under a minute, so nothing reads as suspiciously precise', () => {
    expect(relativeAgeLabel(now, now)).toBe('just now');
    expect(relativeAgeLabel(now - 59_000, now)).toBe('just now');
  });

  it('counts up from a minute', () => {
    expect(relativeAgeLabel(now - 5 * 60_000, now)).toBe('5m ago');
    expect(relativeAgeLabel(now - 3 * 3_600_000, now)).toBe('3h ago');
  });
});

describe('timestampToMillis', () => {
  it('converts a proto timestamp for comparison against a local buffer', () => {
    const date = new Date('2026-08-14T12:00:00.250Z');
    expect(timestampToMillis(timestampFromDate(date))).toBe(date.getTime());
  });

  it('reports nothing for a pipeline written before the field existed', () => {
    expect(timestampToMillis(undefined)).toBeNull();
  });
});

describe('startBlockedMessage', () => {
  // The count matters: "some issues" sends people hunting, "3 issues" tells them when they're done.
  it('counts the issues that stand in the way', () => {
    expect(startBlockedMessage(1)).toMatch(/1 issue to fix/);
    expect(startBlockedMessage(3)).toMatch(/3 issues to fix/);
  });

  it('still says the start was refused when the count is unknown', () => {
    expect(startBlockedMessage(0)).toMatch(/isn't valid yet/i);
  });
});

describe('draftIssueSummary', () => {
  it('stays quiet on a clean draft', () => {
    expect(draftIssueSummary(0)).toBeNull();
    expect(draftIssueSummary(-1)).toBeNull();
  });

  it('says what start will ask for', () => {
    expect(draftIssueSummary(1)).toBe('1 issue to fix');
    expect(draftIssueSummary(4)).toBe('4 issues to fix');
  });
});
