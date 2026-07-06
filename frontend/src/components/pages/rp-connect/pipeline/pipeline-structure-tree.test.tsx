/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import userEvent from '@testing-library/user-event';
import { act, render, screen } from 'test-utils';
import { describe, expect, it, vi } from 'vitest';

import { PipelineStructureTree } from './pipeline-structure-tree';

// A deeply-nested config: switch → case → branch → http, plus a sibling rate_limit.
const NESTED = `input:
  kafka_franz:
    topics: [orders]
pipeline:
  processors:
    - mapping: 'root = this'
    - switch:
        - check: 'a == 1'
          processors:
            - branch:
                processors:
                  - http: { url: http://x }
            - rate_limit: { resource: lim }
output:
  drop: {}`;

describe('PipelineStructureTree', () => {
  it('renders the section headers and the full nested structure as rows', () => {
    render(<PipelineStructureTree configYaml={NESTED} />);
    expect(screen.getByText('INPUT')).toBeInTheDocument();
    expect(screen.getByText('PROCESSORS')).toBeInTheDocument();
    expect(screen.getByText('OUTPUT')).toBeInTheDocument();
    // Deeply nested components are all present (not clipped/dropped).
    for (const label of ['switch', 'case 1', 'branch', 'http', 'rate_limit']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('selects an editable node directly when its row is clicked', async () => {
    const onSelectNode = vi.fn();
    render(<PipelineStructureTree configYaml={NESTED} onSelectNode={onSelectNode} />);
    await userEvent.click(screen.getByText('http'));
    // http maps to its own YAML location, so the highlighted and editable ids match.
    expect(onSelectNode).toHaveBeenCalledTimes(1);
    const [highlightId, editableId] = onSelectNode.mock.calls[0];
    expect(highlightId).toBeTruthy();
    expect(highlightId).toBe(editableId);
  });

  it('resolves a switch case to itself so its routing condition is editable', async () => {
    const onSelectNode = vi.fn();
    render(<PipelineStructureTree configYaml={NESTED} onSelectNode={onSelectNode} />);
    await userEvent.click(screen.getByText('case 1'));
    const [highlightId, editableId] = onSelectNode.mock.calls[0];
    // The case is now selectable in its own right (switchCase editTarget) so the
    // inspector can edit its `check` — both ids point at the case row.
    expect(highlightId).toContain('case');
    expect(editableId).toContain('case');
  });

  it('collapses a group to hide its descendants', async () => {
    render(<PipelineStructureTree configYaml={NESTED} />);
    expect(screen.getByText('http')).toBeInTheDocument();
    const switchRow = screen.getByRole('treeitem', { name: 'switch' });
    expect(switchRow).toHaveAttribute('aria-expanded', 'true');
    act(() => switchRow.focus());
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.queryByText('http')).not.toBeInTheDocument();
    expect(switchRow).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('switch')).toBeInTheDocument();
  });

  it('toggles a group via the chevron without selecting the node', async () => {
    const onSelectNode = vi.fn();
    render(<PipelineStructureTree configYaml={NESTED} onSelectNode={onSelectNode} />);
    const switchRow = screen.getByRole('treeitem', { name: 'switch' });
    // The chevron is presentational (the row owns the ARIA expansion), so target it directly.
    const chevron = switchRow.querySelector('button');
    expect(chevron).not.toBeNull();
    await userEvent.click(chevron as HTMLElement);
    expect(screen.queryByText('http')).not.toBeInTheDocument();
    // Collapsing must not also select the node.
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it('exposes rows as treeitems with level, position and expansion state', () => {
    render(<PipelineStructureTree configYaml={NESTED} />);
    // One labelled tree per non-empty section, so role="tree" owns only treeitems
    // (headers / Add buttons live between the trees).
    expect(screen.getByRole('tree', { name: 'PROCESSORS' })).toBeInTheDocument();
    const switchRow = screen.getByRole('treeitem', { name: 'switch' });
    expect(switchRow).toHaveAttribute('aria-level', '1');
    expect(switchRow).toHaveAttribute('aria-posinset', '2');
    expect(switchRow).toHaveAttribute('aria-setsize', '2');
    expect(switchRow).toHaveAttribute('aria-expanded', 'true');
    const httpRow = screen.getByRole('treeitem', { name: 'http' });
    expect(httpRow).toHaveAttribute('aria-level', '4');
    // Leaves expose no aria-expanded.
    expect(httpRow).not.toHaveAttribute('aria-expanded');
  });

  it('moves focus between visible rows with the arrow, Home and End keys', async () => {
    render(<PipelineStructureTree configYaml={NESTED} />);
    const first = screen.getByRole('treeitem', { name: 'kafka_franz' });
    // Roving tabindex: only the first row is initially tabbable.
    expect(first).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('treeitem', { name: 'mapping' })).toHaveAttribute('tabindex', '-1');
    act(() => first.focus());
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('treeitem', { name: 'mapping' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('treeitem', { name: 'drop' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(first).toHaveFocus();
  });

  it('moves into an expanded group with ArrowRight and to the parent with ArrowLeft', async () => {
    render(<PipelineStructureTree configYaml={NESTED} />);
    const switchRow = screen.getByRole('treeitem', { name: 'switch' });
    act(() => switchRow.focus());
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: 'case 1' })).toHaveFocus();
    // From a leaf, ArrowLeft climbs to the parent group.
    const httpRow = screen.getByRole('treeitem', { name: 'http' });
    act(() => httpRow.focus());
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('treeitem', { name: 'branch' })).toHaveFocus();
  });

  it('selects the focused row with Enter', async () => {
    const onSelectNode = vi.fn();
    render(<PipelineStructureTree configYaml={NESTED} onSelectNode={onSelectNode} />);
    const httpRow = screen.getByRole('treeitem', { name: 'http' });
    act(() => httpRow.focus());
    await userEvent.keyboard('{Enter}');
    expect(onSelectNode).toHaveBeenCalledTimes(1);
    const [highlightId, editableId] = onSelectNode.mock.calls[0];
    expect(highlightId).toBe(editableId);
  });
});
