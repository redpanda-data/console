import { rs } from '@rstest/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ConfigurationEditor from './topic-configuration';

const PRECISE_VALUE_LABEL = /Precise value:/;

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    useSearch: () => ({}),
    useNavigate: () => rs.fn(),
  };
});

rs.mock('../../../config', () => {
  const actual = rs.requireActual<typeof import('../../../config')>('../../../config');
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

const entries: ConfigEntryExtended[] = [
  makeEntry({ name: 'retention.ms', category: 'Retention', isExplicitlySet: true }),
  makeEntry({ name: 'cleanup.policy', category: 'Compaction' }),
  makeEntry({ name: 'redpanda.iceberg.mode', category: 'Iceberg' }),
  makeEntry({ name: 'some.unknown.option', category: 'Totally Unknown' }),
];

function renderEditor() {
  return render(
    <ConfigurationEditor
      entries={entries}
      onForceRefresh={() => {
        // no op - test callback
      }}
      targetTopic="my-topic"
    />
  );
}

function getSection(name: string) {
  return screen.getByRole('heading', { name }).closest('section') as HTMLElement;
}

describe('the TopicConfiguration', () => {
  describe('grouped layout', () => {
    test('renders a sidebar preserving backend categories and collapsing only unmapped ones into Other', () => {
      renderEditor();

      // Sidebar lists each visible category; known backend categories like 'Iceberg' are
      // preserved, and only genuinely unmapped categories collapse into 'Other'.
      const nav = screen.getByRole('navigation', { name: 'Configuration categories' });
      expect(within(nav).getByText('Retention')).toBeVisible();
      expect(within(nav).getByText('Compaction')).toBeVisible();
      expect(within(nav).getByText('Iceberg')).toBeVisible();
      expect(within(nav).getByText('Other')).toBeVisible();
    });

    test('renders titled sections that badge only modified rows', () => {
      renderEditor();

      // Each visible category renders as a titled section.
      const retentionSection = getSection('Retention');
      expect(retentionSection).toBeVisible();

      // Only modified rows get a badge; the explicitly-set retention.ms row shows 'Modified',
      // and the default cleanup.policy row shows no badge.
      expect(within(retentionSection).getByText('Modified')).toBeVisible();
      const compactionSection = getSection('Compaction');
      expect(within(compactionSection).queryByText('Modified')).not.toBeInTheDocument();
      expect(within(compactionSection).queryByText('Default')).not.toBeInTheDocument();
    });
  });

  describe('edit dialog', () => {
    test('names the value type group and labels the custom value control', async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(within(getSection('Retention')).getByRole('button'));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('radiogroup', { name: 'retention.ms' })).toBeVisible();
      expect(
        within(dialog).getByRole('textbox', { name: 'Set a custom retention.ms value for this topic' })
      ).toBeVisible();
    });

    test('labels the ratio slider and the precise value input', async () => {
      const user = userEvent.setup();
      render(
        <ConfigurationEditor
          entries={[
            makeEntry({
              name: 'min.cleanable.dirty.ratio',
              category: 'Compaction',
              frontendFormat: 'RATIO',
              isExplicitlySet: true,
              value: '0.5',
            }),
          ]}
          onForceRefresh={() => {
            // no op - test callback
          }}
          targetTopic="my-topic"
        />
      );

      await user.click(within(getSection('Compaction')).getByRole('button'));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('group', { name: 'Percentage (50%)' })).toBeVisible();
      const preciseInput = within(dialog).getByRole('spinbutton', { name: PRECISE_VALUE_LABEL });
      expect(preciseInput).toBeVisible();
      expect(within(dialog).getByLabelText('Set a custom min.cleanable.dirty.ratio value for this topic')).toBe(
        preciseInput
      );
    });
  });
});
