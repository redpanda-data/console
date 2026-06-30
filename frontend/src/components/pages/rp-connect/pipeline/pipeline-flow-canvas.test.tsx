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

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { decorateEdges, injectNodeData, selectionTargetForNode } from './pipeline-flow-canvas';

const edges: Edge[] = [
  { id: 'spine-a-b', source: 'a', target: 'b', type: 'flowGraphEdge', data: { insertIndex: 1 } },
  { id: 'fanout-c', source: 'b', target: 'c', type: 'flowGraphEdge', data: { tone: 'primary' } },
  { id: 'ref-a-resource-0', source: 'a', target: 'resource-0', type: 'flowGraphEdge', data: { tone: 'muted' } },
];

const refData = (decorated: Edge[]) =>
  decorated.find((e) => e.id.startsWith('ref-'))?.data as { dimmed?: boolean; emphasized?: boolean; faint?: boolean };

const scope = (...ids: string[]) => new Set(ids);

describe('decorateEdges', () => {
  it('keeps resource-reference edges faint until an endpoint is selected or hovered', () => {
    // Always present at a readable "faint" level — a hint, not clutter. Reference
    // edges never fully dim: even when an unrelated node is selected they stay
    // faint (muted but visible) rather than vanishing like dimmed flow edges.
    expect(refData(decorateEdges(edges, {}))).toMatchObject({ faint: true });
    expect(refData(decorateEdges(edges, { selectedScope: scope('b') }))).toMatchObject({ faint: true });

    // Selecting (or hovering) either endpoint renders the edge full-strength.
    expect(refData(decorateEdges(edges, { selectedScope: scope('a') }))).toMatchObject({
      faint: false,
      emphasized: true,
    });
    expect(refData(decorateEdges(edges, { hoveredScope: scope('a') }))).toMatchObject({
      faint: false,
      emphasized: true,
    });

    // Selecting the resource itself reveals who uses it.
    expect(refData(decorateEdges(edges, { selectedScope: scope('resource-0') }))).toMatchObject({ emphasized: true });
  });

  it('hover alone does not dim unrelated edges (only selection does)', () => {
    const hovered = decorateEdges(edges, { hoveredScope: scope('a') });
    expect((hovered.find((e) => e.id === 'fanout-c')?.data as { dimmed?: boolean }).dimmed).toBeUndefined();
  });

  it('dims unrelated edges and emphasizes connected ones while a node is selected', () => {
    const decorated = decorateEdges(edges, { selectedScope: scope('a') });
    const spine = decorated.find((e) => e.id === 'spine-a-b')?.data as { dimmed?: boolean; emphasized?: boolean };
    const fanout = decorated.find((e) => e.id === 'fanout-c')?.data as { dimmed?: boolean; emphasized?: boolean };
    expect(spine.emphasized).toBe(true);
    expect(spine.dimmed).toBe(false);
    expect(fanout.dimmed).toBe(true);

    // No selection → no dimming anywhere.
    const plain = decorateEdges(edges, {});
    expect((plain.find((e) => e.id === 'fanout-c')?.data as { dimmed?: boolean }).dimmed).toBeUndefined();
  });

  it("keeps a selected container's internal wiring lit (scope includes descendants)", () => {
    // Selecting the container 'a' whose subtree includes 'b' and 'c': the fan edge
    // between its children must stay full-strength, not dim as "unrelated".
    const decorated = decorateEdges(edges, { selectedScope: scope('a', 'b', 'c') });
    const fanout = decorated.find((e) => e.id === 'fanout-c')?.data as { dimmed?: boolean; emphasized?: boolean };
    expect(fanout.emphasized).toBe(true);
    expect(fanout.dimmed).toBe(false);
  });

  it('wires the insert handler onto spine edges with their processor index', () => {
    const onInsert = vi.fn();
    const decorated = decorateEdges(edges, { onInsert });
    const spineData = decorated.find((e) => e.type === 'flowGraphEdge')?.data as { onInsert?: () => void };
    spineData.onInsert?.();
    expect(onInsert).toHaveBeenCalledWith(1);
  });
});

describe('selectionTargetForNode', () => {
  const switchNode: Node = {
    id: 'proc-0',
    position: { x: 0, y: 0 },
    data: { label: 'switch', editTarget: { kind: 'processor', index: 0 } },
  };
  const caseNode: Node = {
    id: 'proc-0-case-1',
    parentId: 'proc-0',
    position: { x: 0, y: 0 },
    data: { label: 'case 1', isCase: true }, // no editTarget
  };

  it('selects an editable node directly', () => {
    expect(selectionTargetForNode(switchNode, [switchNode, caseNode])).toEqual({
      id: 'proc-0',
      target: { kind: 'processor', index: 0 },
    });
  });

  it('walks up from a structural node (no editTarget) to select its parent', () => {
    expect(selectionTargetForNode(caseNode, [switchNode, caseNode])).toEqual({
      id: 'proc-0',
      target: { kind: 'processor', index: 0 },
    });
  });

  it('selects a switch case directly when it carries a switchCase editTarget', () => {
    const editableCase: Node = {
      id: 'proc-0-case-1',
      parentId: 'proc-0',
      position: { x: 0, y: 0 },
      data: {
        label: 'case 1',
        isCase: true,
        editTarget: { kind: 'switchCase', path: ['pipeline', 'processors', 0, 'switch', 0] },
      },
    };
    expect(selectionTargetForNode(editableCase, [switchNode, editableCase])).toEqual({
      id: 'proc-0-case-1',
      target: { kind: 'switchCase', path: ['pipeline', 'processors', 0, 'switch', 0] },
    });
  });

  it('returns null when no ancestor is selectable', () => {
    const orphan: Node = { id: 'x', position: { x: 0, y: 0 }, data: { label: 'x' } };
    expect(selectionTargetForNode(orphan, [orphan])).toBeNull();
  });
});

describe('injectNodeData — appearance', () => {
  const node: Node = {
    id: 'child-1',
    position: { x: 0, y: 0 },
    data: { label: 'http' },
    style: { transition: 'transform 200ms ease' },
  };
  const base = { collapsedIds: new Set<string>(), toggleCollapse: () => undefined };

  it('marks a node new this render as appeared and drops its reposition transition', () => {
    // Empty previousIds → the node is appearing (e.g. revealed by expanding).
    const injected = injectNodeData(node, { ...base, previousIds: new Set() });
    expect((injected.data as { appeared?: boolean }).appeared).toBe(true);
    // No transform transition, so it snaps to its spot instead of flying from origin.
    expect((injected.style as { transition?: string }).transition).toBeUndefined();
  });

  it('leaves an existing node untouched (smooth reposition transition kept)', () => {
    const injected = injectNodeData(node, { ...base, previousIds: new Set(['child-1']) });
    expect((injected.data as { appeared?: boolean }).appeared).toBeUndefined();
    expect((injected.style as { transition?: string }).transition).toBe('transform 200ms ease');
  });

  it('flags a node as unsaved when its id is in unsavedNodeIds', () => {
    const unsaved = injectNodeData(node, {
      ...base,
      previousIds: new Set(['child-1']),
      unsavedNodeIds: new Set(['child-1']),
    });
    expect((unsaved.data as { unsaved?: boolean }).unsaved).toBe(true);
    const clean = injectNodeData(node, {
      ...base,
      previousIds: new Set(['child-1']),
      unsavedNodeIds: new Set(['other']),
    });
    expect((clean.data as { unsaved?: boolean }).unsaved).toBeUndefined();
  });
});
