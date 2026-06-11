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

import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { decorateEdges } from './pipeline-flow-canvas';

const edges: Edge[] = [
  { id: 'spine-a-b', source: 'a', target: 'b', type: 'flowSpine', data: { insertIndex: 1 } },
  { id: 'fanout-c', source: 'b', target: 'c', type: 'flowLink', data: { tone: 'primary' } },
  { id: 'ref-a-resource-0', source: 'a', target: 'resource-0', type: 'flowLink', data: { tone: 'muted' } },
];

const refData = (decorated: Edge[]) =>
  decorated.find((e) => e.id.startsWith('ref-'))?.data as { dimmed?: boolean; emphasized?: boolean };

describe('decorateEdges', () => {
  it('keeps resource-reference edges faint until an endpoint is selected or hovered', () => {
    // Always present, but dimmed by default — a hint, not clutter.
    expect(refData(decorateEdges(edges, {}))).toMatchObject({ dimmed: true });

    // Selecting (or hovering) either endpoint renders the edge full-strength.
    expect(refData(decorateEdges(edges, { selectedNodeId: 'a' }))).toMatchObject({ dimmed: false, emphasized: true });
    expect(refData(decorateEdges(edges, { hoveredNodeId: 'a' }))).toMatchObject({ dimmed: false, emphasized: true });

    // Selecting the resource itself reveals who uses it.
    expect(refData(decorateEdges(edges, { selectedNodeId: 'resource-0' }))).toMatchObject({ emphasized: true });
  });

  it('hover alone does not dim unrelated edges (only selection does)', () => {
    const hovered = decorateEdges(edges, { hoveredNodeId: 'a' });
    expect((hovered.find((e) => e.id === 'fanout-c')?.data as { dimmed?: boolean }).dimmed).toBeUndefined();
  });

  it('dims unrelated edges and emphasizes connected ones while a node is selected', () => {
    const decorated = decorateEdges(edges, { selectedNodeId: 'a' });
    const spine = decorated.find((e) => e.id === 'spine-a-b')?.data as { dimmed?: boolean; emphasized?: boolean };
    const fanout = decorated.find((e) => e.id === 'fanout-c')?.data as { dimmed?: boolean; emphasized?: boolean };
    expect(spine.emphasized).toBe(true);
    expect(spine.dimmed).toBe(false);
    expect(fanout.dimmed).toBe(true);

    // No selection → no dimming anywhere.
    const plain = decorateEdges(edges, {});
    expect((plain.find((e) => e.id === 'fanout-c')?.data as { dimmed?: boolean }).dimmed).toBeUndefined();
  });

  it('wires the insert handler onto spine edges with their processor index', () => {
    const onInsert = vi.fn();
    const decorated = decorateEdges(edges, { onInsert });
    const spineData = decorated.find((e) => e.type === 'flowSpine')?.data as { onInsert?: () => void };
    spineData.onInsert?.();
    expect(onInsert).toHaveBeenCalledWith(1);
  });
});
