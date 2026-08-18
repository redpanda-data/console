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

import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { describe, expect, it } from 'vitest';

import { changesImpactMessage, noChangesCopy, summarizeComponentChanges } from './changes-summary';
import { changedNodeIds } from '../utils/pipeline-diff';

const config = ({
  input = 'generate',
  processors = ['mapping: root = this'],
  output = 'drop',
}: {
  input?: string;
  processors?: string[];
  output?: string;
} = {}) => `input:
  ${input}: {}
pipeline:
  processors:
${processors.map((p) => `    - ${p}`).join('\n')}
output:
  ${output}: {}
`;

/** The summary is always fed the ids the diff reports, so the tests do the same. */
const summarize = (savedYaml: string, editedYaml: string) =>
  summarizeComponentChanges(savedYaml, editedYaml, changedNodeIds(savedYaml, editedYaml));

describe('summarizeComponentChanges', () => {
  it('reports nothing when the documents match', () => {
    expect(summarize(config(), config())).toEqual([]);
  });

  it('reports a swapped component as changed, not added and removed', () => {
    const changes = summarize(config({ input: 'generate' }), config({ input: 'kafka_franz' }));

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'changed', section: 'Input' });
  });

  it('reports an added component', () => {
    const changes = summarize(config(), config({ processors: ['mapping: root = this', 'log: {}'] }));

    expect(changes.filter((c) => c.kind === 'added')).toHaveLength(1);
    expect(changes.some((c) => c.kind === 'removed')).toBe(false);
  });

  it('reports a removed component', () => {
    const changes = summarize(config({ processors: ['mapping: root = this', 'log: {}'] }), config());

    expect(changes.filter((c) => c.kind === 'removed')).toHaveLength(1);
    expect(changes.some((c) => c.kind === 'added')).toBe(false);
  });

  // The section headings exist to hold children; counting them would double-report every change.
  it('never reports a section container', () => {
    const changes = summarize(config({ input: 'generate' }), config({ input: 'kafka_franz' }));

    expect(changes.every((c) => !/^(input|output|pipeline)$/.test(c.id))).toBe(true);
  });

  it('says nothing about a document it cannot parse, rather than throwing', () => {
    expect(() => summarize(config(), 'input:\n  kafka_')).not.toThrow();
    expect(() => summarize('input:\n  kafka_', config())).not.toThrow();
  });

  it('treats an empty saved config as everything being new', () => {
    const changes = summarize('', config());

    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((c) => c.kind === 'added')).toBe(true);
  });
});

describe('changesImpactMessage', () => {
  // The running case is the one worth a warning: there is no apply-later.
  it('warns that applying to a running pipeline restarts it', () => {
    for (const state of [Pipeline_State.RUNNING, Pipeline_State.STARTING]) {
      const message = changesImpactMessage(state, 'edit');
      expect(message).toMatch(/not live/i);
      expect(message).toMatch(/restarts/i);
    }
  });

  it('says a draft edit is unsaved rather than unapplied', () => {
    expect(changesImpactMessage(Pipeline_State.DRAFT, 'edit')).toMatch(/aren't saved to the draft/i);
  });

  it('does not talk about restarts for a stopped pipeline', () => {
    const message = changesImpactMessage(Pipeline_State.STOPPED, 'edit');
    expect(message).toMatch(/not saved/i);
    expect(message).not.toMatch(/restart/i);
  });

  // The create page has no save to have happened yet, so it must not imply one.
  it('does not claim a new pipeline has been saved', () => {
    const message = changesImpactMessage(undefined, 'create');
    expect(message).toMatch(/nothing is saved yet/i);
    expect(message).not.toMatch(/last save|your draft/i);
  });
});

describe('noChangesCopy', () => {
  // "No unsaved changes" is only true once something has been saved. On the create page everything is
  // unsaved, and the earlier copy claimed the editor was "saved to your draft" when no draft existed.
  it('does not claim a new pipeline is saved anywhere', () => {
    const { title, body } = noChangesCopy('create');
    expect(title).not.toMatch(/unsaved/i);
    expect(body).toMatch(/none of it is saved/i);
    expect(body).not.toMatch(/saved to your draft/i);
  });

  it('reports an unchanged editor against the saved configuration when editing', () => {
    const { title, body } = noChangesCopy('edit');
    expect(title).toMatch(/no unsaved changes/i);
    expect(body).toMatch(/matches the saved configuration/i);
  });
});
