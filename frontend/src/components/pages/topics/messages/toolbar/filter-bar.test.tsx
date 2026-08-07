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

import { fireEvent, render, screen, within } from '@testing-library/react';
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

const input = () => screen.getByTestId('messages-filter-input') as HTMLInputElement;

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
    // picking the bare field just inserts "partition:" text, nothing committed yet
    expect(input()).toHaveValue('partition:');
    expect(props.onPartitionIdChange).not.toHaveBeenCalled();
    // Value list now shows distinct partition values with counts
    await userEvent.click(screen.getByText('1'));
    expect(props.onPartitionIdChange).toHaveBeenCalledWith(1);
    expect(input()).toHaveFocus();
  });

  test('typed offset token commits a field token on Enter', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('offset>1');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(props.onFieldTokensChange).toHaveBeenCalledWith([{ kind: 'field', field: 'offset', op: 'gt', value: '1' }]);
  });

  test('Tab accepts the ghost completion, inserting the field name', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('par');
    await userEvent.keyboard('{Tab}');
    expect(input()).toHaveValue('partition:');
    expect(props.onPartitionIdChange).not.toHaveBeenCalled();
  });

  test('typing partition: shows the possible values; picking one commits', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('partition:');
    expect(screen.getAllByText('1 msg')).toHaveLength(2);
    await userEvent.click(screen.getByText('1'));
    expect(props.onPartitionIdChange).toHaveBeenCalledWith(1);
  });

  test('pressing Enter twice after committing a token does not duplicate it', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('key:abc');
    await userEvent.keyboard('{Enter}');
    // caret now sits past the trailing space with an empty current word; the dropdown may
    // still be open showing default suggestions, but a stray Enter must not re-insert anything
    await userEvent.keyboard('{Enter}');
    expect(input()).toHaveValue('key:abc ');
    expect(props.onFieldTokensChange).toHaveBeenLastCalledWith([
      { kind: 'field', field: 'key', op: 'contains', value: 'abc' },
    ]);
  });

  test('typing key:value continuously derives the token — no Enter or trailing space needed', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('key:abc');
    expect(props.onFieldTokensChange).toHaveBeenLastCalledWith([
      { kind: 'field', field: 'key', op: 'contains', value: 'abc' },
    ]);
    expect(input()).toHaveValue('key:abc');
  });

  test('typed partition:1 paints a pill highlight and commits on Enter', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('partition:1');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(props.onPartitionIdChange).toHaveBeenCalledWith(1);
    expect(input()).toHaveValue('partition:1 ');
    // the overlay paints a highlight span with the exact recognized substring
    const overlay = within(screen.getByTestId('messages-filter-highlight-overlay'));
    expect(overlay.getByText('partition:1')).toHaveClass('bg-muted');
  });

  test('a quoted value keeps its internal space as one token', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('value:"New York"');
    expect(props.onFieldTokensChange).toHaveBeenLastCalledWith([
      { kind: 'field', field: 'value', op: 'contains', value: 'New York' },
    ]);
    expect(props.onQuickSearchChange).toHaveBeenLastCalledWith('');
  });

  test('an unquoted value stops at the first space; the rest stays plain search text', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('value:New York');
    expect(props.onFieldTokensChange).toHaveBeenLastCalledWith([
      { kind: 'field', field: 'value', op: 'contains', value: 'New' },
    ]);
    expect(props.onQuickSearchChange).toHaveBeenLastCalledWith('York');
  });

  test('while a quote is open, the value keeps growing without prematurely becoming a token', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('value:"New ');
    // still empty, same as the initial state — no spurious call
    expect(props.onFieldTokensChange).not.toHaveBeenCalled();
    expect(input()).toHaveValue('value:"New ');
    await userEvent.keyboard('York"');
    expect(props.onFieldTokensChange).toHaveBeenLastCalledWith([
      { kind: 'field', field: 'value', op: 'contains', value: 'New York' },
    ]);
  });

  test('the caret can be placed anywhere and typing inserts there — free browsing', async () => {
    const props = renderBar({
      fieldTokens: [{ kind: 'field', field: 'key', op: 'contains', value: 'abc' }],
    });
    const el = input();
    await userEvent.click(el);
    expect(el).toHaveValue('key:abc');
    // place the caret right after "key:", in the middle of the existing text
    el.setSelectionRange(4, 4);
    fireEvent.select(el);
    await userEvent.keyboard('X');
    expect(el).toHaveValue('key:Xabc');
    expect(props.onFieldTokensChange).toHaveBeenLastCalledWith([
      { kind: 'field', field: 'key', op: 'contains', value: 'Xabc' },
    ]);
  });

  test('Backspace deletes native characters — no special removal logic, un-highlights on its own', async () => {
    const props = renderBar({
      fieldTokens: [{ kind: 'field', field: 'key', op: 'contains', value: 'abc' }],
    });
    const el = input();
    await userEvent.click(el);
    el.setSelectionRange(el.value.length, el.value.length);
    fireEvent.select(el);
    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}');
    expect(el).toHaveValue('key:');
    expect(props.onFieldTokensChange).toHaveBeenLastCalledWith([]);
  });

  test('suggestions reflect the word under the caret, not the whole line', async () => {
    const props = renderBar();
    const el = input();
    await userEvent.click(el);
    await userEvent.keyboard('partition: value:def');
    // move the caret back into the "partition:" word
    el.setSelectionRange(5, 5);
    fireEvent.select(el);
    expect(screen.getByText('Value for Partition')).toBeInTheDocument();
    await userEvent.click(screen.getByText('1'));
    expect(props.onPartitionIdChange).toHaveBeenCalledWith(1);
    // the rest of the line is untouched by the mid-line splice
    expect(el).toHaveValue('partition:1 value:def');
  });

  test('js suggestion opens the editor; hidden without permission', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.click(screen.getByText('js:'));
    expect(props.onEditJsFilter).toHaveBeenCalledWith(null, undefined, undefined);
  });

  test('typing js:dach-region seeds the filter name, not the code', async () => {
    const props = renderBar();
    await userEvent.click(input());
    await userEvent.keyboard('js:dach-region');
    await userEvent.click(screen.getByText('ƒ dach-region'));
    expect(props.onEditJsFilter).toHaveBeenCalledWith(null, undefined, 'dach-region');
  });

  test('typing js: followed by an actual expression seeds the code, not the name', async () => {
    const props = renderBar();
    await userEvent.click(input());
    // no spaces — the dropdown's suggestions are scoped to the word under the caret, so a
    // multi-word expression is written in the dialog's own editor, not typed inline here
    await userEvent.keyboard('js:value!=null');
    await userEvent.click(screen.getByText('ƒ value!=null'));
    expect(props.onEditJsFilter).toHaveBeenCalledWith(null, 'value!=null', undefined);
  });

  test('js: is not offered when JS filters are unavailable', async () => {
    renderBar({ canUseJsFilters: false });
    await userEvent.click(input());
    expect(screen.queryByText('js:')).not.toBeInTheDocument();
  });

  test('JS filter chip: edit opens the dialog, remove removes it', async () => {
    const jsFilter = { id: 'js-1', code: 'return true', name: 'always' };
    const props = renderBar({ jsFilters: [jsFilter] });
    await userEvent.click(screen.getByText('ƒ always'));
    expect(props.onEditJsFilter).toHaveBeenCalledWith(jsFilter);
    await userEvent.click(screen.getByTitle('Remove filter'));
    expect(props.onRemoveJsFilter).toHaveBeenCalledWith('js-1');
  });

  test('clear-all resets the line and removes JS filters', async () => {
    const jsFilter = { id: 'js-1', code: 'return true' };
    const props = renderBar({
      fieldTokens: [{ kind: 'field', field: 'key', op: 'contains', value: 'abc' }],
      partitionId: 2,
      jsFilters: [jsFilter],
    });
    expect(input()).toHaveValue('partition:2 key:abc');
    await userEvent.click(screen.getByTitle('Clear all filters'));
    expect(props.onFieldTokensChange).toHaveBeenCalledWith([]);
    expect(props.onPartitionIdChange).toHaveBeenCalledWith(-1);
    expect(props.onQuickSearchChange).toHaveBeenCalledWith('');
    expect(props.onRemoveJsFilter).toHaveBeenCalledWith('js-1');
    expect(input()).toHaveValue('');
  });

  test('mounting with existing filters renders the combined line', () => {
    renderBar({
      fieldTokens: [
        { kind: 'field', field: 'key', op: 'contains', value: 'abc' },
        { kind: 'field', field: 'value', op: 'contains', value: 'New York' },
      ],
      partitionId: 2,
      quickSearch: 'hello',
    });
    expect(input()).toHaveValue('partition:2 key:abc value:"New York" hello');
  });
});
