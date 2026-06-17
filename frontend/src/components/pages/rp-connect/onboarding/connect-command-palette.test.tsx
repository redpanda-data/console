import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { describe, expect, it } from 'vitest';

import { byProminence } from './connect-command-palette';
import type { ConnectComponentSpec } from '../types/schema';

const spec = (name: string, status: ComponentStatus = ComponentStatus.STABLE): ConnectComponentSpec =>
  ({ name, type: 'processor', status }) as ConnectComponentSpec;

const sorted = (specs: ConnectComponentSpec[]) => [...specs].sort(byProminence).map((s) => s.name);

describe('byProminence', () => {
  it('sorts common components ahead of the long tail', () => {
    // `mapping` is a common processor; `avro` is not.
    expect(sorted([spec('avro'), spec('mapping')])).toEqual(['mapping', 'avro']);
  });

  it('demotes deprecated and experimental below stable, even when common', () => {
    const result = sorted([
      spec('mapping', ComponentStatus.DEPRECATED),
      spec('avro', ComponentStatus.STABLE),
      spec('parquet', ComponentStatus.EXPERIMENTAL),
    ]);
    // Stable (even uncommon) sorts above demoted ones; deprecated/experimental sink.
    expect(result[0]).toBe('avro');
    expect(result.slice(1).sort()).toEqual(['mapping', 'parquet']);
  });

  it('falls back to alphabetical within the same prominence bucket', () => {
    expect(sorted([spec('zzz'), spec('aaa')])).toEqual(['aaa', 'zzz']);
  });
});
