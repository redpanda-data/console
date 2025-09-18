import { render, screen } from '@testing-library/react';
import type { ConfigEntryExtended } from '../../../state/restInterfaces';
import ConfigurationEditor from './TopicConfiguration';

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
      'Message Handling',
      'Write Caching',
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

    const { container } = render(<ConfigurationEditor entries={entries} targetTopic="" onForceRefresh={() => {}} />);
    expect(screen.getByTestId('config-group-table')).toBeVisible();

    const groups = container.querySelectorAll('.configGroupTitle');

    expect([
      'Retention',
      'Compaction',
      'Replication',
      'Tiered Storage',
      'Write Caching',
      'Iceberg',
      'Message Handling',
      'Compression',
      'Storage Internals',
    ]).toEqual(Array.from(groups).map((g) => g.textContent));
  });
});
