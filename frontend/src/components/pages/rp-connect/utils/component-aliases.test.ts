import { describe, expect, it } from 'vitest';

import { aliasTermsForName, COMPONENT_ALIASES } from './component-aliases';

describe('component aliases', () => {
  it('maps intent terms to a component name via its fragments', () => {
    // "queue" lists kafka, so kafka_franz surfaces under that intent.
    expect(aliasTermsForName('kafka_franz')).toContain('queue');
    expect(aliasTermsForName('kafka_franz')).toContain('stream');
  });

  it('maps transform/map intents to bloblang/mapping', () => {
    expect(aliasTermsForName('mapping')).toEqual(expect.arrayContaining(['transform', 'map']));
    expect(aliasTermsForName('bloblang')).toContain('transform');
  });

  it('returns no alias terms for a name no fragment matches', () => {
    expect(aliasTermsForName('totally_unrelated_xyz')).toEqual([]);
  });

  it('keeps alias keys and fragments lowercase', () => {
    for (const [key, fragments] of Object.entries(COMPONENT_ALIASES)) {
      expect(key).toBe(key.toLowerCase());
      for (const fragment of fragments) {
        expect(fragment).toBe(fragment.toLowerCase());
      }
    }
  });
});
