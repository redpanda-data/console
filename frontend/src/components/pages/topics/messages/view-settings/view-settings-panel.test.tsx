/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ViewSettingsPanel, type ViewSettingsPanelProps } from './view-settings-panel';
import { PayloadEncoding } from '../../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { DEFAULT_ROW_DENSITY, useTopicSettingsStore } from '../../../../../stores/topic-settings-store';

const TOPIC = 'view-settings-test-topic';

const renderPanel = (overrides: Partial<ViewSettingsPanelProps> = {}) => {
  const props: ViewSettingsPanelProps = {
    topicName: TOPIC,
    onClose: vi.fn(),
    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    onKeyDeserializerChange: vi.fn(),
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
    onValueDeserializerChange: vi.fn(),
    onResetDeserializers: vi.fn(),
    valuePathHints: ['address', 'address.city'],
    liveTail: false,
    ...overrides,
  };
  render(<ViewSettingsPanel {...props} />);
  return props;
};

describe('ViewSettingsPanel', () => {
  beforeEach(() => {
    useTopicSettingsStore.setState({ perTopicSettings: [] });
  });

  test('density toggle writes to the store instantly', async () => {
    renderPanel();
    await userEvent.click(screen.getByTestId('view-settings-density-compact'));
    expect(useTopicSettingsStore.getState().getRowDensity(TOPIC)).toBe('compact');
  });

  test('column visibility toggle updates the store', async () => {
    renderPanel();
    await userEvent.click(screen.getByTestId('column-toggle-offset'));
    const columns = useTopicSettingsStore.getState().getMessageColumns(TOPIC);
    expect(columns.find((c) => c.id === 'offset')?.visible).toBe(true);
  });

  test('column count summary reflects visibility', () => {
    renderPanel();
    // Defaults: timestamp, key, value visible out of 7
    expect(screen.getByText('3 of 7')).toBeInTheDocument();
  });

  test('preview field editor adds a pattern row', async () => {
    renderPanel();
    await userEvent.click(screen.getByTestId('column-config-value'));
    await userEvent.click(screen.getByTestId('preview-tag-add'));
    expect(useTopicSettingsStore.getState().getPreviewTags(TOPIC)).toHaveLength(1);
  });

  test('key/value deserializers are disabled while live tail is active, since changes only apply on the next (re)start', async () => {
    renderPanel({ liveTail: true });
    await userEvent.click(screen.getByTestId('column-config-key'));
    expect(screen.getByTestId('view-settings-key-deser')).toBeDisabled();
    await userEvent.click(screen.getByTestId('column-config-value'));
    expect(screen.getByTestId('view-settings-value-deser')).toBeDisabled();
  });

  test('key/value deserializers stay enabled outside live tail', async () => {
    renderPanel({ liveTail: false });
    await userEvent.click(screen.getByTestId('column-config-key'));
    expect(screen.getByTestId('view-settings-key-deser')).toBeEnabled();
  });

  test('reset restores defaults and resets deserializers', async () => {
    const props = renderPanel();
    useTopicSettingsStore.getState().setRowDensity(TOPIC, 'compact');
    await userEvent.click(screen.getByTestId('view-settings-reset'));
    expect(useTopicSettingsStore.getState().getRowDensity(TOPIC)).toBe(DEFAULT_ROW_DENSITY);
    expect(props.onResetDeserializers).toHaveBeenCalled();
  });
});
