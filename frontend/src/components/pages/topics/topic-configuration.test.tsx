import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import ConfigurationEditor from './topic-configuration';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useSearch: () => ({}),
    useNavigate: () => vi.fn(),
  };
});

import type { ConfigEntryExtended } from '../../../state/rest-interfaces';

describe('TopicConfiguration', () => {
  test('renders groups in the correct order', () => {
    // Generate an out of order set of test options
    const entries: ConfigEntryExtended[] = [
      'Retention',
      'Tiered Storage',
      'Storage Internals',
      'Compression',
      'Compaction',
      'Replication',
      'Iceberg',
      '', // unknown options should appear at the end as 'Other'
      'Message Handling',
      'Write Caching',
      'Schema Registry and Validation',
    ].map((category) => ({
      name: 'test.option',
      category,
      value: '',
      source: '',
      type: 'STRING',
      isExplicitlySet: false,
      isDefaultValue: false,
      isReadOnly: false,
      isSensitive: false,
      synonyms: [],
      currentValue: '',
    }));

    const { container } = render(
      <ConfigurationEditor
        entries={entries}
        onForceRefresh={() => {
          // no op - test callback
        }}
        targetTopic=""
      />
    );
    expect(screen.getByTestId('config-group-table')).toBeVisible();

    const groups = container.querySelectorAll('.configGroupTitle');

    expect(Array.from(groups).map((g) => g.textContent)).toEqual([
      'Retention',
      'Compaction',
      'Replication',
      'Tiered Storage',
      'Write Caching',
      'Iceberg',
      'Schema Registry and Validation',
      'Message Handling',
      'Compression',
      'Storage Internals',
      'Other',
    ]);
  });
});
