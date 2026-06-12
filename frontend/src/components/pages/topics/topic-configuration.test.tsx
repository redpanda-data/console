import { render, screen, within } from '@testing-library/react';
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

const mockIsFeatureFlagEnabled = vi.fn<(flag: string) => boolean>();
vi.mock('../../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config')>();
  return {
    ...actual,
    isServerless: () => false,
    isFeatureFlagEnabled: (flag: string) => mockIsFeatureFlagEnabled(flag),
  };
});

import type { ConfigEntryExtended } from '../../../state/rest-interfaces';

const makeEntry = (overrides: Partial<ConfigEntryExtended> & { category: string }): ConfigEntryExtended => ({
  name: 'test.option',
  value: '',
  source: '',
  type: 'STRING',
  isExplicitlySet: false,
  isDefaultValue: false,
  isReadOnly: false,
  isSensitive: false,
  synonyms: [],
  currentValue: '',
  ...overrides,
});

describe('TopicConfiguration', () => {
  describe('legacy layout (enableNewTopicPage off)', () => {
    beforeEach(() => mockIsFeatureFlagEnabled.mockReturnValue(false));

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
      ].map((category) => makeEntry({ category }));

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

  describe('grouped layout (enableNewTopicPage on)', () => {
    beforeEach(() => mockIsFeatureFlagEnabled.mockReturnValue(true));

    test('renders a sidebar and titled sections, collapsing unmapped categories into Other', () => {
      const entries: ConfigEntryExtended[] = [
        makeEntry({ name: 'retention.ms', category: 'Retention', isExplicitlySet: true }),
        makeEntry({ name: 'cleanup.policy', category: 'Compaction' }),
        makeEntry({ name: 'redpanda.iceberg.mode', category: 'Iceberg' }),
      ];

      render(
        <ConfigurationEditor
          entries={entries}
          onForceRefresh={() => {
            // no op - test callback
          }}
          targetTopic="my-topic"
        />
      );

      // Sidebar lists each visible category; unmapped 'Iceberg' collapses into 'Other'.
      const nav = screen.getByRole('navigation', { name: 'Configuration categories' });
      expect(within(nav).getByText('Retention')).toBeVisible();
      expect(within(nav).getByText('Compaction')).toBeVisible();
      expect(within(nav).getByText('Other')).toBeVisible();
      expect(within(nav).queryByText('Iceberg')).not.toBeInTheDocument();

      // Each visible category renders as a titled section.
      const retentionSection = screen.getByRole('heading', { name: 'Retention' }).closest('section') as HTMLElement;
      expect(retentionSection).toBeVisible();

      // Only modified rows get a badge; the explicitly-set retention.ms row shows 'Modified',
      // and the default cleanup.policy row shows no badge.
      expect(within(retentionSection).getByText('Modified')).toBeVisible();
      const compactionSection = screen.getByRole('heading', { name: 'Compaction' }).closest('section') as HTMLElement;
      expect(within(compactionSection).queryByText('Modified')).not.toBeInTheDocument();
      expect(within(compactionSection).queryByText('Default')).not.toBeInTheDocument();
    });
  });
});
