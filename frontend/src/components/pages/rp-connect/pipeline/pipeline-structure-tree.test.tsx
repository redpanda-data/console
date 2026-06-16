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
import { render, screen } from 'test-utils';
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

  it('resolves a structural sub-node (switch case) to its editable ancestor', async () => {
    const onSelectNode = vi.fn();
    render(<PipelineStructureTree configYaml={NESTED} onSelectNode={onSelectNode} />);
    await userEvent.click(screen.getByText('case 1'));
    const [highlightId, editableId] = onSelectNode.mock.calls[0];
    // The case row itself is highlighted, but the editor reveals the parent switch.
    expect(highlightId).toContain('case');
    expect(editableId).toBe('proc-1');
  });

  it('collapses a group to hide its descendants', async () => {
    render(<PipelineStructureTree configYaml={NESTED} />);
    expect(screen.getByText('http')).toBeInTheDocument();
    // Toggles appear in document order: switch is the first collapsible group.
    await userEvent.click(screen.getAllByLabelText('Collapse')[0]);
    expect(screen.queryByText('http')).not.toBeInTheDocument();
    expect(screen.getByText('switch')).toBeInTheDocument();
  });
});
