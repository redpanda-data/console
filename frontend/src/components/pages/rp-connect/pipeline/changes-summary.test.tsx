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

import { describe, expect, it } from '@rstest/core';
import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import {
  changesImpactMessage,
  changesImpactTone,
  NO_CHANGES_COPY,
  summarizeComponentChanges,
  summarizeSettingsChanges,
} from './changes-summary';
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

  // Ids are positional: deleting the first processor renumbers the second into its slot.
  it('names the component that was removed, not the one that slid into its place', () => {
    const changes = summarize(
      config({ processors: ['mapping: root = this', 'log: {}'] }),
      config({ processors: ['log: {}'] })
    );

    expect(changes).toEqual([expect.objectContaining({ kind: 'removed', id: 'proc-0' })]);
  });

  it('reports a component inserted ahead of the others as added, not as a change to them', () => {
    const changes = summarize(config(), config({ processors: ['log: {}', 'mapping: root = this'] }));

    expect(changes).toEqual([expect.objectContaining({ kind: 'added', id: 'proc-0' })]);
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

describe('summarizeSettingsChanges', () => {
  const saved = { name: 'orders', description: 'the orders pipeline', computeUnits: 1, tags: [] };

  it('reports nothing when the settings match what is saved', () => {
    expect(summarizeSettingsChanges(saved, { ...saved })).toEqual([]);
  });

  it('states both sides of a changed setting', () => {
    const changes = summarizeSettingsChanges(saved, { ...saved, computeUnits: 3 });

    expect(changes).toEqual([{ key: 'computeUnits', label: 'Compute units', from: '1', to: '3' }]);
  });

  it('lists changes in the order the settings dialog shows them', () => {
    const changes = summarizeSettingsChanges(saved, { ...saved, computeUnits: 3, name: 'renamed' });

    expect(changes.map((c) => c.key)).toEqual(['name', 'computeUnits']);
  });

  it('names an empty value rather than showing a gap', () => {
    const changes = summarizeSettingsChanges({}, { description: 'why', tags: [{ key: 'env', value: 'dev' }] });

    expect(changes.map((c) => c.from)).toEqual(['not set', 'none']);
  });

  // A field the form has never populated is not a change from an empty one.
  it('treats an absent value and an empty one as the same', () => {
    expect(summarizeSettingsChanges({ description: '' }, {})).toEqual([]);
  });

  // Trimming here would report no change for one the server would store.
  it('keeps a whitespace-only edit visible', () => {
    const [change] = summarizeSettingsChanges({ name: 'orders' }, { name: 'orders ' });

    expect(change).toMatchObject({ key: 'name', from: 'orders', to: 'orders ' });
  });

  it('lists tags as key: value pairs, ignoring half-typed rows', () => {
    const [change] = summarizeSettingsChanges(
      { tags: [{ key: 'env', value: 'dev' }] },
      {
        tags: [
          { key: 'env', value: 'prod' },
          { key: '', value: 'orphan' },
        ],
      }
    );

    expect(change).toMatchObject({ from: 'env: dev', to: 'env: prod' });
  });
});

describe('changesImpactMessage', () => {
  // The running case is the one worth a warning: there is no apply-later.
  it('warns that applying to a running pipeline restarts it', () => {
    for (const state of [Pipeline_State.RUNNING, Pipeline_State.STARTING]) {
      const message = changesImpactMessage(state);
      expect(message).toMatch(/not live/i);
      expect(message).toMatch(/restarts/i);
    }
  });

  it('says a draft edit is unsaved rather than unapplied', () => {
    expect(changesImpactMessage(Pipeline_State.DRAFT)).toMatch(/aren't saved to the draft/i);
  });

  it('does not talk about restarts for a stopped pipeline', () => {
    const message = changesImpactMessage(Pipeline_State.STOPPED);
    expect(message).toMatch(/not saved/i);
    expect(message).not.toMatch(/restart/i);
  });
});

describe('changesImpactTone', () => {
  // The editor header already shows "N issues to fix" in warning orange; a second orange line saying
  // something far less urgent flattens both into undifferentiated alarm.
  it('warns only where applying actually costs something', () => {
    expect(changesImpactTone(Pipeline_State.RUNNING)).toBe('warning');
    expect(changesImpactTone(Pipeline_State.STARTING)).toBe('warning');
  });

  it.each([
    ['a draft', Pipeline_State.DRAFT],
    ['a stopped pipeline', Pipeline_State.STOPPED],
  ])('states the facts without alarm for %s', (_name, state) => {
    expect(changesImpactTone(state)).toBe('info');
  });
});

describe('NO_CHANGES_COPY', () => {
  // The lane covers both halves of a save, so the empty state has to claim both are unchanged.
  it('accounts for the settings as well as the configuration', () => {
    expect(NO_CHANGES_COPY.title).toMatch(/no unsaved changes/i);
    expect(NO_CHANGES_COPY.body).toMatch(/settings/i);
  });
});
