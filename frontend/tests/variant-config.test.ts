import { parseVariantConfig, parseVariantPorts, readVariantConfig } from './shared/variant-config.mjs';
import { describe, expect, test } from 'bun:test';

const validConfig = {
  name: 'console',
  displayName: 'Console OSS',
  isEnterprise: false,
  needsShadowlink: false,
  needsAuth: false,
  ports: { backend: 3000 },
};

describe('test variant configuration', () => {
  test('preserves variant-specific settings and valid port mappings', () => {
    const config = { ...validConfig, customSetting: 'retained', isKafka: true };
    expect(parseVariantConfig(config)).toEqual(config);
    expect(parseVariantPorts({ backend: 65_535 })).toEqual({ backend: 65_535 });
    expect(parseVariantPorts({})).toEqual({});
  });

  test.each([
    { value: null },
    { value: [] },
    { value: { ...validConfig, name: 42 } },
    { value: { ...validConfig, needsAuth: 'false' } },
  ])('rejects invalid variant configuration %#', ({ value }) => {
    expect(() => parseVariantConfig(value)).toThrow();
  });

  test.each([{ backend: '3000' }, { backend: 0 }, { backend: -1 }, { backend: 65_536 }, { backend: 1.5 }])(
    'rejects invalid port maps %#',
    (value) => {
      expect(() => parseVariantPorts(value)).toThrow();
    }
  );

  test('loads the maintained Console variant through the same parser as the CLI', () => {
    expect(
      readVariantConfig(new URL('./test-variant-console/config/variant.json', import.meta.url).pathname).name
    ).toBe('console');
  });
});
