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
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { FilterBar, type FilterBarProps } from './filter-bar';
import type { TopicMessage } from '../../../../../state/rest-interfaces';
import type { FieldFilterToken } from '../types';

const makeMsg = (partitionID: number, offset: number, value: unknown): TopicMessage =>
  ({
    partitionID,
    offset,
    timestamp: 0,
    compression: 'uncompressed',
    isTransactional: false,
    headers: [],
    key: { payload: `key-${offset}`, isPayloadNull: false, size: 1 },
    value: { payload: value, isPayloadNull: false, size: 1 },
    keyJson: `"key-${offset}"`,
    valueJson: JSON.stringify(value),
    keyBinHexPreview: '',
    valueBinHexPreview: '',
  }) as TopicMessage;

const messages = [makeMsg(0, 1, { type: 'INVOICE' }), makeMsg(1, 2, { type: 'ORDER' })];

/** Stateful wrapper: the bar's inputs are controlled, so tests need live state. */
const StatefulBar = (props: Partial<FilterBarProps> & { spies: FilterBarProps }) => {
  const [quickSearch, setQuickSearch] = useState(props.quickSearch ?? '');
  const [fieldTokens, setFieldTokens] = useState<FieldFilterToken[]>(props.fieldTokens ?? []);
  const [partitionId, setPartitionId] = useState(props.partitionId ?? -1);
  const { spies } = props;
  return (
    <FilterBar
      {...spies}
      {...props}
      fieldTokens={fieldTokens}
      onFieldTokensChange={(tokens) => {
        setFieldTokens(tokens);
        spies.onFieldTokensChange(tokens);
      }}
      onPartitionIdChange={(id) => {
        setPartitionId(id);
        spies.onPartitionIdChange(id);
      }}
      onQuickSearchChange={(q) => {
        setQuickSearch(q);
        spies.onQuickSearchChange(q);
      }}
      partitionId={partitionId}
      quickSearch={quickSearch}
    />
  );
};

const renderBar = (overrides: Partial<FilterBarProps> = {}) => {
  const spies: FilterBarProps = {
    messages,
    quickSearch: '',
    onQuickSearchChange: vi.fn(),
    fieldTokens: [],
    onFieldTokensChange: vi.fn(),
    partitionId: -1,
    onPartitionIdChange: vi.fn(),
    jsFilters: [],
    onEditJsFilter: vi.fn(),
    onRemoveJsFilter: vi.fn(),
    canUseJsFilters: true,
  };
  render(<StatefulBar {...overrides} spies={spies} />);
  return spies;
};

const input = () => screen.getByTestId('messages-filter-input');

describe('FilterBar', () => {
  test('focusing opens grouped suggestions', async () => {
    renderBar();
    await userEvent.click(input());
    expect(screen.getByText('partition:')).toBeInTheDocument();
    expect(screen.getByText('js:')).toBeInTheDocument();
    expect(screen.getByText('value:')).toBeInTheDocument();
  });

  test('partition flow: pick field, pick value, commits partition id', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.click(screen.getByText('partition:'));
    // Pending mode lists distinct partition values with counts
    await userEvent.click(screen.getByText('1'));
    expect(props.onPartitionIdChange).toHaveBeenCalledWith(1);
    // focus returns to the input, right after the freshly committed badge
    expect(input()).toHaveFocus();
  });

  test('typed offset token commits a field token on Enter', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('offset>1');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(props.onFieldTokensChange).toHaveBeenCalledWith([{ kind: 'field', field: 'offset', op: 'gt', value: '1' }]);
  });

  test('Tab accepts the ghost completion into pending mode', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('par');
    await userEvent.keyboard('{Tab}');
    // pending pill for partition appears, nothing committed yet
    expect(screen.getByText('partition:')).toBeInTheDocument();
    expect(props.onPartitionIdChange).not.toHaveBeenCalled();
  });

  test('typing partition: shows the possible values; picking one commits', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('partition:');
    // distinct partition values appear with counts, like pending mode
    expect(screen.getAllByText('1 msg')).toHaveLength(2);
    await userEvent.click(screen.getByText('1'));
    expect(props.onPartitionIdChange).toHaveBeenCalledWith(1);
  });

  test('typed partition:1 commits the partition badge', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('partition:1');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(props.onPartitionIdChange).toHaveBeenCalledWith(1);
    expect(screen.getByTitle('Click to edit the partition filter')).toHaveTextContent('partition:1');
  });

  test('ArrowLeft unwraps the last chip into editable text', async () => {
    const props = renderBar({ partitionId: 1 });
    await userEvent.click(input());
    await userEvent.keyboard('{ArrowLeft}');
    // the badge turns back into text: partition cleared, its token in the input
    expect(props.onPartitionIdChange).toHaveBeenCalledWith(-1);
    expect(input()).toHaveValue('partition:1');
  });

  test('unwrapped chip can be edited and recommitted (partition:1 -> partition:2)', async () => {
    const props = renderBar({ partitionId: 1 });
    await userEvent.click(input());
    await userEvent.keyboard('{ArrowLeft}');
    expect(input()).toHaveValue('partition:1');
    await userEvent.clear(input());
    await userEvent.type(input(), 'partition:2');
    await userEvent.keyboard('{Enter}');
    expect(props.onPartitionIdChange).toHaveBeenLastCalledWith(2);
    expect(screen.getByTitle('Click to edit the partition filter')).toHaveTextContent('partition:2');
  });

  test('editing a middle chip keeps its position on recommit', async () => {
    const props = renderBar({
      fieldTokens: [
        { kind: 'field', field: 'key', op: 'contains', value: 'abc' },
        { kind: 'field', field: 'value', op: 'contains', value: 'x' },
      ],
    });
    // click the first chip to unwrap it into the input
    await userEvent.click(screen.getByText('key:abc'));
    expect(input()).toHaveValue('key:abc');
    await userEvent.clear(input());
    await userEvent.type(input(), 'key:zzz');
    await userEvent.keyboard('{Enter}');
    // the edited filter stays first — it must not jump to the end
    expect(props.onFieldTokensChange).toHaveBeenLastCalledWith([
      { kind: 'field', field: 'key', op: 'contains', value: 'zzz' },
      { kind: 'field', field: 'value', op: 'contains', value: 'x' },
    ]);
  });

  test('Backspace on empty input removes the last chip', async () => {
    const tokens: FieldFilterToken[] = [{ kind: 'field', field: 'key', op: 'contains', value: 'abc' }];
    const props = renderBar({ fieldTokens: tokens });
    await userEvent.click(input());
    await userEvent.keyboard('{Backspace}');
    expect(props.onFieldTokensChange).toHaveBeenCalledWith([]);
  });

  test('chips render and clear-all removes everything', async () => {
    const props = renderBar({
      fieldTokens: [{ kind: 'field', field: 'key', op: 'contains', value: 'abc' }],
      partitionId: 2,
    });
    expect(screen.getByText('key:abc')).toBeInTheDocument();
    expect(screen.getByText('partition:2')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('Clear all filters'));
    expect(props.onFieldTokensChange).toHaveBeenCalledWith([]);
    expect(props.onPartitionIdChange).toHaveBeenCalledWith(-1);
    expect(props.onQuickSearchChange).toHaveBeenCalledWith('');
  });

  test('js suggestion opens the editor; hidden without permission', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.click(screen.getByText('js:'));
    expect(props.onEditJsFilter).toHaveBeenCalledWith(null, undefined);
  });

  test('js: is not offered when JS filters are unavailable', async () => {
    renderBar({ canUseJsFilters: false });
    await userEvent.click(input());
    expect(screen.queryByText('js:')).not.toBeInTheDocument();
  });
});
