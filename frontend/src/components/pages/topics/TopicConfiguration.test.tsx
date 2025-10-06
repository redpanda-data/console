import { render, screen } from '@testing-library/react';

import ConfigurationEditor from './TopicConfiguration';
import type { ConfigEntryExtended } from '../../../state/restInterfaces';

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
    ].map((category) => {
      return {
        name: 'test.option',
        category: category,
        value: '',
        source: '',
        type: 'STRING',
        isExplicitlySet: false,
        isDefaultValue: false,
        isReadOnly: false,
        isSensitive: false,
        synonyms: [],
        currentValue: '',
      };
    });

    const { container } = render(<ConfigurationEditor entries={entries} onForceRefresh={() => {}} targetTopic="" />);
    expect(screen.getByTestId('config-group-table')).toBeVisible();

    const groups = container.querySelectorAll('.configGroupTitle');

    expect([
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
    ]).toEqual(Array.from(groups).map((g) => g.textContent));
  });
});
