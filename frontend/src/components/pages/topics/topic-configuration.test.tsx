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

vi.mock('../../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config')>();
  return {
    ...actual,
    isServerless: () => false,
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
  describe('grouped layout', () => {
    test('renders a sidebar and titled sections, preserving backend categories and collapsing only unmapped ones into Other', () => {
      const entries: ConfigEntryExtended[] = [
        makeEntry({ name: 'retention.ms', category: 'Retention', isExplicitlySet: true }),
        makeEntry({ name: 'cleanup.policy', category: 'Compaction' }),
        makeEntry({ name: 'redpanda.iceberg.mode', category: 'Iceberg' }),
        makeEntry({ name: 'some.unknown.option', category: 'Totally Unknown' }),
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

      // Sidebar lists each visible category; known backend categories like 'Iceberg' are
      // preserved, and only genuinely unmapped categories collapse into 'Other'.
      const nav = screen.getByRole('navigation', { name: 'Configuration categories' });
      expect(within(nav).getByText('Retention')).toBeVisible();
      expect(within(nav).getByText('Compaction')).toBeVisible();
      expect(within(nav).getByText('Iceberg')).toBeVisible();
      expect(within(nav).getByText('Other')).toBeVisible();

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
