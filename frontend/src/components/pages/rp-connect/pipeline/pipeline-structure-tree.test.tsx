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

import { describe, expect, it, rs } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { act, render, screen } from 'test-utils';

import { PipelineStructureTree } from './pipeline-structure-tree';

const HOLDING_NOTICE_RE = /last valid outline/iu;
const FIX_IT_NOTICE_RE = /the current yaml is invalid/iu;
const INVALID_NOTICE_RE = /invalid/iu;

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

async function pressAndExpectFocus(key: string, rowName: string) {
  await userEvent.keyboard(key);
  expect(screen.getByRole('treeitem', { name: rowName })).toHaveFocus();
}

describe('the PipelineStructureTree', () => {
  describe('rendering and selection', () => {
    it('renders the section headers and the full nested structure as rows', () => {
      render(<PipelineStructureTree configYaml={NESTED} />);
      expect(screen.getByText('INPUT')).toBeInTheDocument();
      expect(screen.getByText('PROCESSORS')).toBeInTheDocument();
      expect(screen.getByText('OUTPUT')).toBeInTheDocument();
      for (const label of ['switch', 'case 1', 'branch', 'http', 'rate_limit']) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it('selects an editable node directly when its row is clicked', async () => {
      const onSelectNode = rs.fn();
      render(<PipelineStructureTree configYaml={NESTED} onSelectNode={onSelectNode} />);
      await userEvent.click(screen.getByText('http'));
      expect(onSelectNode).toHaveBeenCalledTimes(1);
      const [highlightId, editableId] = onSelectNode.mock.calls[0];
      expect(highlightId).toBeTruthy();
      expect(highlightId).toBe(editableId);
    });

    it('resolves a switch case to itself so its routing condition is editable', async () => {
      const onSelectNode = rs.fn();
      render(<PipelineStructureTree configYaml={NESTED} onSelectNode={onSelectNode} />);
      await userEvent.click(screen.getByText('case 1'));
      const [highlightId, editableId] = onSelectNode.mock.calls[0];
      expect(highlightId).toContain('case');
      expect(editableId).toContain('case');
    });
  });

  describe('expansion', () => {
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
      const onSelectNode = rs.fn();
      render(<PipelineStructureTree configYaml={NESTED} onSelectNode={onSelectNode} />);
      const switchRow = screen.getByRole('treeitem', { name: 'switch' });
      const chevron = switchRow.querySelector('button');
      expect(chevron).not.toBeNull();
      await userEvent.click(chevron as HTMLElement);
      expect(screen.queryByText('http')).not.toBeInTheDocument();
      // Collapsing must not also select the node.
      expect(onSelectNode).not.toHaveBeenCalled();
    });
  });

  describe('keyboard navigation', () => {
    it('exposes rows as treeitems with level, position and expansion state', () => {
      render(<PipelineStructureTree configYaml={NESTED} />);
      expect(screen.getByRole('tree', { name: 'PROCESSORS' })).toBeInTheDocument();
      const switchRow = screen.getByRole('treeitem', { name: 'switch' });
      expect(switchRow).toHaveAttribute('aria-level', '1');
      expect(switchRow).toHaveAttribute('aria-posinset', '2');
      expect(switchRow).toHaveAttribute('aria-setsize', '2');
      expect(switchRow).toHaveAttribute('aria-expanded', 'true');
      const httpRow = screen.getByRole('treeitem', { name: 'http' });
      expect(httpRow).toHaveAttribute('aria-level', '4');
      expect(httpRow).not.toHaveAttribute('aria-expanded');
    });

    it('moves focus between visible rows with the arrow, Home and End keys', async () => {
      render(<PipelineStructureTree configYaml={NESTED} />);
      const first = screen.getByRole('treeitem', { name: 'kafka_franz' });
      expect(first).toHaveAttribute('tabindex', '0');
      expect(screen.getByRole('treeitem', { name: 'mapping' })).toHaveAttribute('tabindex', '-1');
      act(() => first.focus());
      await pressAndExpectFocus('{ArrowDown}', 'mapping');
      await pressAndExpectFocus('{End}', 'drop');
      await userEvent.keyboard('{Home}');
      expect(first).toHaveFocus();
    });

    it('moves into an expanded group with ArrowRight and to the parent with ArrowLeft', async () => {
      render(<PipelineStructureTree configYaml={NESTED} />);
      const switchRow = screen.getByRole('treeitem', { name: 'switch' });
      act(() => switchRow.focus());
      await userEvent.keyboard('{ArrowRight}');
      expect(screen.getByRole('treeitem', { name: 'case 1' })).toHaveFocus();
      const httpRow = screen.getByRole('treeitem', { name: 'http' });
      act(() => httpRow.focus());
      await userEvent.keyboard('{ArrowLeft}');
      expect(screen.getByRole('treeitem', { name: 'branch' })).toHaveFocus();
    });

    it('selects the focused row with Enter', async () => {
      const onSelectNode = rs.fn();
      render(<PipelineStructureTree configYaml={NESTED} onSelectNode={onSelectNode} />);
      const httpRow = screen.getByRole('treeitem', { name: 'http' });
      act(() => httpRow.focus());
      await userEvent.keyboard('{Enter}');
      expect(onSelectNode).toHaveBeenCalledTimes(1);
      const [highlightId, editableId] = onSelectNode.mock.calls[0];
      expect(highlightId).toBe(editableId);
    });
  });

  describe('docs links', () => {
    it('links each component row to its reference docs', () => {
      render(<PipelineStructureTree configYaml={NESTED} />);
      const docsLink = screen.getByRole('button', { name: 'kafka_franz documentation' });
      expect(docsLink).toHaveAttribute(
        'href',
        'https://docs.redpanda.com/cloud-data-platform/develop/connect/components/inputs/kafka_franz/'
      );
      expect(docsLink).toHaveAttribute('target', '_blank');
      expect(docsLink).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.getByRole('button', { name: 'http documentation' })).toHaveAttribute(
        'href',
        'https://docs.redpanda.com/cloud-data-platform/develop/connect/components/processors/http/'
      );
      expect(screen.getByRole('button', { name: 'switch documentation' })).toBeInTheDocument();
    });

    it('omits the docs link on structural rows that name no component', () => {
      render(<PipelineStructureTree configYaml={NESTED} />);
      const caseRow = screen.getByRole('treeitem', { name: 'case 1' });
      expect(caseRow.querySelector('a')).toBeNull();
    });

    it('opens the docs link without also selecting the row', async () => {
      const onSelectNode = rs.fn();
      render(<PipelineStructureTree configYaml={NESTED} onSelectNode={onSelectNode} />);
      const docsLink = screen.getByRole('button', { name: 'kafka_franz documentation' });
      await userEvent.click(docsLink);
      expect(onSelectNode).not.toHaveBeenCalled();
      // Enter must reach the link, not the row's select handler (which would preventDefault it).
      act(() => docsLink.focus());
      await userEvent.keyboard('{Enter}');
      expect(onSelectNode).not.toHaveBeenCalled();
    });
  });

  describe('invalid yaml', () => {
    it('keeps the last valid outline, flagged, when an edit makes the YAML invalid', () => {
      const { rerender } = render(<PipelineStructureTree configYaml={NESTED} />);
      expect(screen.getByText('switch')).toBeInTheDocument();

      // A syntax error mid-edit: the lane must not blank out — it holds the outline and flags it.
      rerender(<PipelineStructureTree configYaml={'input: [unclosed'} />);
      expect(screen.getByText(HOLDING_NOTICE_RE)).toBeInTheDocument();
      expect(screen.getByText('switch')).toBeInTheDocument();
    });

    it('shows a fix-it notice (no crash) when the YAML is invalid from the start', () => {
      render(<PipelineStructureTree configYaml={'input: [unclosed'} />);
      expect(screen.getByText(FIX_IT_NOTICE_RE)).toBeInTheDocument();
      expect(screen.queryByText('INPUT')).not.toBeInTheDocument();
    });

    it('does not flag a valid but still-incomplete config as invalid while authoring from blank', () => {
      const { rerender } = render(<PipelineStructureTree configYaml={''} />);
      rerender(<PipelineStructureTree configYaml={'input:'} />);
      expect(screen.queryByText(INVALID_NOTICE_RE)).not.toBeInTheDocument();
    });
  });
});

describe('the PipelineStructureTree stop conditions', () => {
  it('describes how each input row stops', async () => {
    render(
      <PipelineStructureTree
        configYaml={'input:\n  read_until:\n    idle_timeout: 30s\n    input:\n      kafka_franz: {}\n'}
      />
    );
    const row = await screen.findByRole('treeitem', { name: 'kafka_franz' });
    expect(row).toHaveAccessibleDescription('Stops after 30 seconds without new messages.');
  });
});
